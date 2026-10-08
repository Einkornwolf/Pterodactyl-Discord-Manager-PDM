const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const SQLite = require('better-sqlite3');
const { DataBaseInterface } = require('../classes/dataBaseInterface');
const { EconomyManager } = require('../classes/economyManager');

let directory;
let filename;
let db;
let economy;

function executeSql(sql, ...parameters) {
    const sqlite = new SQLite(filename);
    try {
        if (parameters.length) {
            sqlite.prepare(sql).run(...parameters);
        } else {
            sqlite.exec(sql);
        }
    } finally {
        sqlite.close();
    }
}

beforeEach(async () => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pdm-transfer-'));
    filename = path.join(directory, 'db.sqlite');
    db = new DataBaseInterface(filename);
    economy = new EconomyManager(filename);
    await db.setObject('sender', { e_mail: 'a@example.invalid', balance: 100, language: 'de-DE' });
    await db.setObject('recipient', { e_mail: 'b@example.invalid', balance: 0 });
});

afterEach(async () => {
    await DataBaseInterface.closeAll();
    fs.rmSync(directory, { recursive: true, force: true });
});

test('overlapping transfers cannot spend the same balance twice', async () => {
    const results = await Promise.all([
        db.transferCoins('sender', 'recipient', 80),
        economy.transferCoins('sender', 'recipient', 80)
    ]);
    expect(results).toEqual([{ ok: true }, { ok: false, reason: 'insufficient_funds' }]);
    expect(await db.getObject('sender')).toMatchObject({ balance: 20, language: 'de-DE' });
    expect((await db.getObject('recipient')).balance).toBe(80);
});

test('other managers cannot overwrite transfers with a stale read', async () => {
    await Promise.all([
        economy.addCoins('sender', 10),
        db.transferCoins('sender', 'recipient', 80),
        economy.addCoins('sender', 5)
    ]);
    expect((await db.getObject('sender')).balance).toBe(35);
    expect((await db.getObject('recipient')).balance).toBe(80);
});

test('failure on the second write rolls back the first write', async () => {
    executeSql("CREATE TRIGGER fail_credit BEFORE UPDATE ON json WHEN NEW.ID = 'recipient' BEGIN SELECT RAISE(ABORT, 'test credit failure'); END");
    const rejectedTransfer = expect(db.transferCoins('sender', 'recipient', 50)).rejects.toThrow('test credit failure');
    const followingRead = db.getObject('sender');

    await rejectedTransfer;
    await expect(followingRead).resolves.toMatchObject({ balance: 100 });
    expect((await db.getObject('sender')).balance).toBe(100);
    expect((await db.getObject('recipient')).balance).toBe(0);

    executeSql('DROP TRIGGER fail_credit');
    await expect(db.transferCoins('sender', 'recipient', 50)).resolves.toEqual({ ok: true });
    expect((await db.getObject('sender')).balance).toBe(50);
    expect((await db.getObject('recipient')).balance).toBe(50);
});

test.each([0, -1, 1.2, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '10', null])('rejects invalid amount %s', async amount => {
    expect(await db.transferCoins('sender', 'recipient', amount)).toEqual({ ok: false, reason: 'invalid_amount' });
    expect((await db.getObject('sender')).balance).toBe(100);
    expect((await db.getObject('recipient')).balance).toBe(0);
});

test('rejects self transfers without changing the account', async () => {
    const before = await db.getObject('sender');
    expect(await db.transferCoins('sender', 'sender', 5)).toEqual({ ok: false, reason: 'same_user' });
    expect(await db.getObject('sender')).toEqual(before);
});

test.each(['sender', 'recipient'])('rejects a missing %s account without changing the other account', async missing => {
    await db.deleteUser(missing);
    const before = await db.fetchAll();
    expect(await db.transferCoins('sender', 'recipient', 5)).toEqual({ ok: false, reason: `${missing}_missing` });
    expect(await db.fetchAll()).toEqual(before);
});

describe.each(['sender', 'recipient'])('%s validation', account => {
    test.each([null, [], 100, 'corrupt', false])('rejects malformed account record %j without writes', async record => {
        executeSql('UPDATE json SET json = ? WHERE ID = ?', JSON.stringify(record), account);
        const before = await db.fetchAll();

        expect(await db.transferCoins('sender', 'recipient', 5)).toEqual({ ok: false, reason: 'invalid_balance' });
        expect(await db.fetchAll()).toEqual(before);
    });

    test.each([null, '100', {}, [], true, Number.MAX_SAFE_INTEGER + 1, -Number.MAX_SAFE_INTEGER - 1])('rejects invalid balance %j without writes', async balance => {
        await db.setObject(account, { balance });
        const before = await db.fetchAll();

        expect(await db.transferCoins('sender', 'recipient', 5)).toEqual({ ok: false, reason: 'invalid_balance' });
        expect(await db.fetchAll()).toEqual(before);
    });

    test('rejects an infinite balance stored as a JSON numeric literal', async () => {
        executeSql('UPDATE json SET json = ? WHERE ID = ?', '{"balance":1e400}', account);
        const before = await db.fetchAll();

        expect(await db.transferCoins('sender', 'recipient', 5)).toEqual({ ok: false, reason: 'invalid_balance' });
        expect(await db.fetchAll()).toEqual(before);
    });

    test.each([undefined, null, 123, {}, [], true])('rejects non-string account ID %j', async id => {
        const senderId = account === 'sender' ? id : 'sender';
        const recipientId = account === 'recipient' ? id : 'recipient';
        const before = await db.fetchAll();

        await expect(db.transferCoins(senderId, recipientId, 5)).rejects.toThrow('Transfer account IDs must be strings');
        expect(await db.fetchAll()).toEqual(before);
    });
});

test('numeric and string forms of the same ID cannot mint coins', async () => {
    await db.setObject('123', { balance: 100 });

    await expect(db.transferCoins('123', 123, 5)).rejects.toThrow('Transfer account IDs must be strings');
    expect((await db.getObject('123')).balance).toBe(100);
});

test('a missing sender balance is treated as zero', async () => {
    await db.setUser('sender', 'a@example.invalid', 'Sender');

    expect(await db.transferCoins('sender', 'recipient', 5)).toEqual({ ok: false, reason: 'insufficient_funds' });
    expect(await db.getObject('sender')).toEqual({ e_mail: 'a@example.invalid', name: 'Sender' });
    expect((await db.getObject('recipient')).balance).toBe(0);
});

test('a missing recipient balance starts at zero and other account fields survive', async () => {
    await db.setUser('recipient', 'b@example.invalid', 'Recipient');

    expect(await db.transferCoins('sender', 'recipient', 5)).toEqual({ ok: true });
    expect(await db.getObject('sender')).toEqual({ e_mail: 'a@example.invalid', balance: 95, language: 'de-DE' });
    expect(await db.getObject('recipient')).toEqual({ e_mail: 'b@example.invalid', name: 'Recipient', balance: 5 });
});

test('whole-coin transfers preserve valid fractional balances', async () => {
    await economy.setCoins('sender', 100.5);
    await economy.setCoins('recipient', 0.25);

    expect(await db.transferCoins('sender', 'recipient', 80)).toEqual({ ok: true });
    expect(await economy.getUserBalance('sender')).toBe(20.5);
    expect(await economy.getUserBalance('recipient')).toBe(80.25);
    expect(await economy.getTotalCoinAmount()).toBe(100.75);
});

test('rejects a credit that would exceed the safe numeric range', async () => {
    await economy.setCoins('recipient', Number.MAX_SAFE_INTEGER);

    expect(await db.transferCoins('sender', 'recipient', 1)).toEqual({ ok: false, reason: 'invalid_balance' });
    expect((await db.getObject('sender')).balance).toBe(100);
    expect((await db.getObject('recipient')).balance).toBe(Number.MAX_SAFE_INTEGER);
});

test('accepts a credit exactly at the safe numeric boundary', async () => {
    await economy.setCoins('recipient', Number.MAX_SAFE_INTEGER - 5);

    expect(await db.transferCoins('sender', 'recipient', 5)).toEqual({ ok: true });
    expect((await db.getObject('sender')).balance).toBe(95);
    expect((await db.getObject('recipient')).balance).toBe(Number.MAX_SAFE_INTEGER);
});

test('relative and absolute paths share the same operation queue', async () => {
    const relativeEconomy = new EconomyManager(path.relative(process.cwd(), filename));

    await Promise.all(Array.from({ length: 20 }, (_, index) =>
        (index % 2 ? relativeEconomy : economy).addCoins('sender', 1)));

    expect(await economy.getUserBalance('sender')).toBe(120);
});

test('different database files keep their accounts isolated', async () => {
    const otherEconomy = new EconomyManager(path.join(directory, 'other.sqlite'));
    await otherEconomy.setCoins('sender', 500);

    await Promise.all([economy.addCoins('sender', 5), otherEconomy.addCoins('sender', 10)]);

    expect(await economy.getUserBalance('sender')).toBe(105);
    expect(await otherEconomy.getUserBalance('sender')).toBe(510);
});

test('concurrent email and coin updates preserve both fields', async () => {
    await Promise.all([db.changeUserMail('sender', 'new@example.invalid'), economy.addCoins('sender', 5)]);

    expect(await db.getObject('sender')).toEqual({ e_mail: 'new@example.invalid', balance: 105, language: 'de-DE' });
});

test('concurrent shop removal and insertion preserve the new item', async () => {
    await db.addShopItem('server', { name: 'Old' });

    await Promise.all([db.removeShopItem(0), economy.addShopItem('server', { name: 'New' })]);

    expect(await db.getObject('shop_items_servers')).toEqual([{ type: 'server', data: { name: 'New' } }]);
});

test('a failed ordinary operation does not prevent a later write', async () => {
    const rejectedChange = expect(db.changeUserMail('missing', 'new@example.invalid')).rejects.toThrow('User not found');
    const followingWrite = economy.addCoins('sender', 5);

    await Promise.all([rejectedChange, followingWrite]);
    expect(await economy.getUserBalance('sender')).toBe(105);
});

test('closing drains pending work, rejects old managers and allows the file to reopen', async () => {
    const pendingWrite = economy.addCoins('sender', 5);
    const closing = DataBaseInterface.closeAll();
    const rejectedRead = expect(db.getObject('sender')).rejects.toThrow('Database connection is closing or closed');

    await Promise.all([pendingWrite, closing, rejectedRead]);
    await expect(economy.addCoins('sender', 1)).rejects.toThrow('Database connection is closing or closed');

    const reopened = new EconomyManager(filename);
    expect(await reopened.getUserBalance('sender')).toBe(105);
});

test('closing existing connections preserves a newly opened database file', async () => {
    const pendingWrite = economy.addCoins('sender', 5);
    const closing = DataBaseInterface.closeAll();
    const otherEconomy = new EconomyManager(path.join(directory, 'other.sqlite'));

    await Promise.all([pendingWrite, closing, otherEconomy.setCoins('other', 50)]);
    expect(await otherEconomy.getUserBalance('other')).toBe(50);

    await DataBaseInterface.closeAll();
    await expect(otherEconomy.addCoins('other', 1)).rejects.toThrow('Database connection is closing or closed');
});
