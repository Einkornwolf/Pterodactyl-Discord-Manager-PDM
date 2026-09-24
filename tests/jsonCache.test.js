const mockGetObject = jest.fn();
jest.mock('../classes/dataBaseInterface', () => ({ DataBaseInterface: jest.fn(() => ({ getObject: mockGetObject, setUserValue: jest.fn(), deleteObject: jest.fn() })) }));
const fs = require('node:fs/promises');
const { readJson, clearJsonCache } = require('../classes/jsonCache');
const { TranslationManager } = require('../classes/translationManager');
beforeEach(() => { clearJsonCache(); jest.clearAllMocks(); });
afterEach(() => jest.restoreAllMocks());
test('concurrent callers share a single read and can explicitly invalidate it', async () => {
    const read = jest.spyOn(fs, 'readFile').mockResolvedValue('{"key":"value"}');
    await Promise.all([readJson('en-US.json'), readJson('en-US.json')]);
    expect(read).toHaveBeenCalledTimes(1);
    clearJsonCache(); await readJson('en-US.json');
    expect(read).toHaveBeenCalledTimes(2);
});
test('failed reads are retried', async () => {
    jest.spyOn(fs, 'readFile').mockRejectedValueOnce(new Error('missing')).mockResolvedValue('{}');
    await expect(readJson('en-US.json')).rejects.toThrow('missing');
    await expect(readJson('en-US.json')).resolves.toEqual({});
});
test('language is looked up once per interaction and missing keys fall back to English', async () => {
    mockGetObject.mockResolvedValue({ language: 'de-DE' });
    jest.spyOn(fs, 'readFile').mockImplementation(async file => file.endsWith('de-DE.json') ? '{"present":"Hallo"}' : '{"missing":"Fallback"}');
    const t = new TranslationManager('user');
    expect(await t.getTranslation('present')).toBe('Hallo');
    expect(await t.getTranslation('missing')).toBe('Fallback');
    expect(mockGetObject).toHaveBeenCalledTimes(1);
    await t.saveUserLanguage('en-US');
    expect(await t.getUserLanguage()).toBe('en-US');
});
