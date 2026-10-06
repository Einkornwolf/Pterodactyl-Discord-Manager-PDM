const fs = require('node:fs/promises');
const path = require('node:path');
const { MemoryDatabase } = require('./helpers/memoryDatabase');
const mockDatabase = new MemoryDatabase();
jest.mock('../classes/dataBaseInterface', () => ({ DataBaseInterface: jest.fn(() => mockDatabase) }));

beforeEach(() => { mockDatabase.records.clear(); jest.resetModules(); });
afterEach(() => jest.useRealTimers());

test.each([null, {}, { language: 'de-DE' }])('translation language uses the user setting or configured default: %j', async record => {
    if (record) mockDatabase.records.set('user', record);
    const { TranslationManager } = require('../classes/translationManager');
    const manager = new TranslationManager('user');
    expect(await manager.getUserLanguage()).toBe(record?.language || 'en-US');
});
test('translation reads the requested key from a shipped language file', async () => {
    const english = JSON.parse(await fs.readFile(path.join(__dirname, '../translations/en-US.json'), 'utf8'));
    const manager = new (require('../classes/translationManager').TranslationManager)('user');
    expect(await manager.getTranslation('account_manager.main_label')).toBe(english['account_manager.main_label']);
    expect(await manager.getTranslation('trivia.expired')).toBe(english['trivia.expired']);
});
test('saving and removing language only changes the language field', async () => {
    mockDatabase.records.set('user', { e_mail: 'user@test.invalid', balance: 100, language: 'en-US' });
    const manager = new (require('../classes/translationManager').TranslationManager)('user');
    await manager.saveUserLanguage('de-DE');
    expect(mockDatabase.setUserValue).toHaveBeenCalledWith('user', '.language', 'de-DE');
    expect(await manager.getUserLanguage()).toBe('de-DE');
    await manager.deleteUserLanguage();
    expect(mockDatabase.records.get('user')).toEqual({ e_mail: 'user@test.invalid', balance: 100 });
    expect(await manager.getUserLanguage()).toBe('en-US');
});

test.each([
    ['<:logo:123456789>', { id: '123456789', name: 'logo', animated: false }],
    ['<a:dance:123456789>', { id: '123456789', name: 'dance', animated: true }],
    ['✅', '✅'], [{ id: '123', name: 'custom', animated: 1 }, { id: '123', name: 'custom', animated: true }],
    [{ id: '123' }, { id: '123', name: undefined, animated: false }],
    [null, null], ['', null], [{}, null], [42, null]
])('emoji parser supports %j', (input, output) => {
    const manager = new (require('../classes/emojiManager').EmojiManager)();
    expect(manager.parseEmoji(input)).toEqual(output);
});
test('emoji lookups prefer configured custom IDs and fall back to Unicode', async () => {
    jest.spyOn(fs, 'readFile').mockResolvedValue(JSON.stringify({
        custom: { id: '<:logo:123>', emoji: '✅' }, unicode: { id: '  ', emoji: '✅' }, empty: {}
    }));
    const manager = new (require('../classes/emojiManager').EmojiManager)();
    expect(await manager.getEmoji('custom')).toBe('<:logo:123>');
    expect(await manager.getEmoji('unicode')).toBe('✅');
    expect(await manager.getEmoji('empty')).toBeNull();
    expect(await manager.getEmoji('missing')).toBeNull();
});
test('the shipped emoji file provides the configured logo', async () => {
    const manager = new (require('../classes/emojiManager').EmojiManager)();
    expect(await manager.getEmoji('emoji_logo')).toBe('🔶');
});

test('log timestamps contain the local date, clock, and UTC offset', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-02-03T15:24:35Z'));
    const manager = new (require('../classes/logManager').LogManager)();
    const timestamp = await manager.getLogTimestamp();
    const date = new Date();
    expect(timestamp).toContain(`[2026-02-03 ${date.getHours()}:24:35 UTC`);
    expect(timestamp).toMatch(/UTC[+-]\d+(?::\d{2})?\]$/);
});
test('logging appends a timestamped record and preserves append failures', async () => {
    const append = jest.spyOn(fs, 'appendFile').mockResolvedValue();
    jest.spyOn(fs, 'mkdir').mockResolvedValue();
    const manager = new (require('../classes/logManager').LogManager)();
    jest.spyOn(manager, 'getLogTimestamp').mockResolvedValue('[timestamp]');
    await manager.logString('test event');
    expect(append.mock.calls[0][0]).toMatch(/log[/\\]log\.txt$/);
    expect(append.mock.calls[0][1]).toMatch(/^\[timestamp\] test event\s*\n$/);
    append.mockRejectedValueOnce(new Error('Disk full'));
    await expect(manager.logString('next event')).rejects.toThrow('Disk full');
});
test.each([true, false])('log-file existence probes handle an existing or absent file: %s', async exists => {
    const read = jest.spyOn(fs, 'readFile'), access = jest.spyOn(fs, 'access');
    if (exists) { read.mockResolvedValue(''); access.mockResolvedValue(); }
    else { const error = Object.assign(new Error('No file'), { code: 'ENOENT' }); read.mockRejectedValue(error); access.mockRejectedValue(error); }
    const manager = new (require('../classes/logManager').LogManager)();
    await expect(manager.checkForLogFile()).resolves.not.toThrow();
    expect(read.mock.calls.length + access.mock.calls.length).toBe(1);
});
test('log-file creation appends without replacing prior contents', async () => {
    const append = jest.spyOn(fs, 'appendFile').mockResolvedValue();
    jest.spyOn(fs, 'mkdir').mockResolvedValue();
    await new (require('../classes/logManager').LogManager)().createLogFile();
    expect(append).toHaveBeenCalledWith(expect.stringMatching(/log[/\\]log\.txt$/), '');
});
