const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const SQLite = require('better-sqlite3');
const { DataBaseInterface } = require('../classes/dataBaseInterface');
const { EconomyManager } = require('../classes/economyManager');
let directory, filename, db, economy;
beforeEach(async () => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pdm-transfer-'));
    filename = path.join(directory, 'db.sqlite');
    db = new DataBaseInterface(filename);
    economy = new EconomyManager(filename);
    await db.setObject('sender', { e_mail: 'a@example.invalid', balance: 100, language: 'de-DE' });
    await db.setObject('recipient', { e_mail: 'b@example.invalid', balance: 0 });
});
afterEach(async () => { await DataBaseInterface.closeAll(); fs.rmSync(directory, { recursive: true, force: true }); });
test('overlapping transfers cannot spend the same balance twice', async () => {
    const results = await Promise.all([db.transferCoins('sender', 'recipient', 80), economy.transferCoins('sender', 'recipient', 80)]);
    expect(results).toEqual([{ ok: true }, { ok: false, reason: 'insufficient_funds' }]);
    expect(await db.getObject('sender')).toMatchObject({ balance: 20, language: 'de-DE' });
    expect((await db.getObject('recipient')).balance).toBe(80);
});
test('other managers cannot overwrite transfers with a stale read', async () => {
    await Promise.all([economy.addCoins('sender', 10), db.transferCoins('sender', 'recipient', 80), economy.addCoins('sender', 5)]);
    expect((await db.getObject('sender')).balance).toBe(35);
    expect((await db.getObject('recipient')).balance).toBe(80);
});
test('failure on the second write rolls back the first write', async () => {
    const sqlite = new SQLite(filename);
    sqlite.exec("CREATE TRIGGER fail_credit BEFORE UPDATE ON json WHEN NEW.ID = 'recipient' BEGIN SELECT RAISE(ABORT, 'test credit failure'); END");
    sqlite.close();
    await expect(db.transferCoins('sender', 'recipient', 50)).rejects.toThrow('test credit failure');
    expect((await db.getObject('sender')).balance).toBe(100);
    expect((await db.getObject('recipient')).balance).toBe(0);
});
test.each([0, -1, 1.2, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid amount %s', async amount => {
    expect(await db.transferCoins('sender', 'recipient', amount)).toEqual({ ok: false, reason: 'invalid_amount' });
});
test('rejects self transfers and missing accounts without changing balances', async () => {
    expect((await db.transferCoins('sender', 'sender', 5)).reason).toBe('same_user');
    expect((await db.transferCoins('sender', 'missing', 5)).reason).toBe('recipient_missing');
    expect((await db.getObject('sender')).balance).toBe(100);
});
