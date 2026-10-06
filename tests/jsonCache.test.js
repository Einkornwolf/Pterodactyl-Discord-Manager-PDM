const mockGetObject = jest.fn();
jest.mock('../classes/dataBaseInterface', () => ({
    DataBaseInterface: jest.fn(() => ({
        getObject: mockGetObject,
        setUserValue: jest.fn(),
        deleteObject: jest.fn()
    }))
}));

const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { readJson, clearJsonCache } = require('../classes/jsonCache');
const { TranslationManager } = require('../classes/translationManager');
const { EmojiManager } = require('../classes/emojiManager');
const englishFile = path.resolve(__dirname, '..', 'translations', 'en-US.json');

beforeEach(() => {
    clearJsonCache();
    jest.clearAllMocks();
});
afterEach(() => jest.restoreAllMocks());

test('concurrent callers share a single read and can explicitly invalidate it', async () => {
    const read = jest.spyOn(fs, 'readFile').mockResolvedValue('{"key":"value"}');
    await Promise.all([readJson(englishFile), readJson(englishFile)]);
    expect(read).toHaveBeenCalledTimes(1);

    clearJsonCache();
    await readJson(englishFile);
    expect(read).toHaveBeenCalledTimes(2);
});

test('failed reads are retried', async () => {
    jest.spyOn(fs, 'readFile').mockRejectedValueOnce(new Error('missing')).mockResolvedValue('{}');
    await expect(readJson(englishFile)).rejects.toThrow('missing');
    await expect(readJson(englishFile)).resolves.toEqual({});
});

test('JSON files outside translations use their full paths and share relative path aliases', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'pdm-json-cache-'));
    const firstFile = path.join(directory, 'first', 'settings.json');
    const secondFile = path.join(directory, 'second', 'settings.json');

    try {
        await fs.mkdir(path.dirname(firstFile));
        await fs.mkdir(path.dirname(secondFile));
        await fs.writeFile(firstFile, '{"value":"first"}');
        await fs.writeFile(secondFile, '{"value":"second"}');

        const [first, alias, second] = await Promise.all([
            readJson(firstFile),
            readJson(path.relative(process.cwd(), firstFile)),
            readJson(secondFile)
        ]);

        expect(first).toEqual({ value: 'first' });
        expect(alias).toBe(first);
        expect(second).toEqual({ value: 'second' });
    } finally {
        await fs.rm(directory, { recursive: true, force: true });
    }
});

test('language is looked up once per interaction and missing keys fall back to English', async () => {
    mockGetObject.mockResolvedValue({ language: 'de-DE' });
    jest.spyOn(fs, 'readFile').mockImplementation(async file => {
        return file.endsWith('de-DE.json') ? '{"present":"Hallo"}' : '{"missing":"Fallback"}';
    });
    const t = new TranslationManager('user');

    expect(await t.getTranslation('present')).toBe('Hallo');
    expect(await t.getTranslation('missing')).toBe('Fallback');
    expect(mockGetObject).toHaveBeenCalledTimes(1);

    await t.saveUserLanguage('en-US');
    expect(await t.getUserLanguage()).toBe('en-US');
});

test('translation and emoji managers find their files from another working directory', async () => {
    mockGetObject.mockResolvedValue({ language: 'en-US' });
    jest.spyOn(process, 'cwd').mockReturnValue(os.tmpdir());

    const translations = new TranslationManager('user');
    const emojis = new EmojiManager();

    await expect(translations.getTranslation('errors.cancel_label')).resolves.toBe('Cancelled!');
    await expect(emojis.getEmoji('emoji_error')).resolves.toBe('⛔');
});
