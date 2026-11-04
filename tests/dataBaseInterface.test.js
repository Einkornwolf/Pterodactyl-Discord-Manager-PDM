// dataBaseInterface.test.js
const fs = require('fs');
const path = require('path');
const os = require('os');
const { DataBaseInterface } = require('../classes/dataBaseInterface');

const TEMP_DIRS = [];
function tempDbFile(name) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dbi-'));
    TEMP_DIRS.push(dir);
    return path.join(dir, `${name}.sqlite`);
}

afterAll(async () => {
    await DataBaseInterface.closeAll();
    for (const dir of TEMP_DIRS) {
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch { }
    }
});

describe('DataBaseInterface (isolated file)', () => {
    it('setUser/deleteUser/getObject: writes and reads user', async () => {
        const db = new DataBaseInterface(tempDbFile('t1'));
        await db.setUser('u1', 'a@b.c', 'Alice');
        const obj = await db.getObject('u1');
        expect(obj).toEqual({ e_mail: 'a@b.c', name: 'Alice' });
        await db.deleteUser("u1");
        expect(await db.getObject("u1")).toBeNull();
    });

    it('changeUserMail: updates email only', async () => {
        const db = new DataBaseInterface(tempDbFile('t2'));
        await db.setUser('u2', 'old@x.y', 'Bob');
        await db.changeUserMail('u2', 'new@x.y');
        const obj = await db.getObject('u2');
        expect(obj).toEqual({ e_mail: 'new@x.y', name: 'Bob' });
    });

    it('shop: set/add/remove', async () => {
        const db = new DataBaseInterface(tempDbFile('shop'));
        await db.setShop([]);
        await db.addShopItem('server', { id: 1 });
        let shop = await db.getObject('shop_items_servers');
        expect(shop).toEqual([{ type: 'server', data: { id: 1 } }]);

        await db.removeShopItem(0);
        shop = await db.getObject('shop_items_servers');
        expect(shop).toEqual([]);

        let testAdd = await db.addShopItem("", { id: 1});
        expect(testAdd).toBeNull();
    });

    it('removeShopItem: null when shop missing', async () => {
        const db = new DataBaseInterface(tempDbFile('shop-miss'));
        const res = await db.removeShopItem(0);
        expect(res).toBeNull();
        expect(await db.getObject('shop_items_servers')).toBeNull();
    });

    it('numeric ops: set/add/sub user values', async () => {
        const db = new DataBaseInterface(tempDbFile('nums'));
        await db.setUserValue('u', ':coins', 0);
        await db.addUserValue('u', ':coins', 10);
        await db.removeUserValue('u', ':coins', 3);
        expect(await db.getObject('u:coins')).toBe(7);
    });

    it('generic ops: set/push/delete object', async () => {
        const db = new DataBaseInterface(tempDbFile('gen'));
        await db.setObject('arr', []);
        await db.pushObject('arr', 1);
        await db.pushObject('arr', 2);
        expect(await db.getObject('arr')).toEqual([1, 2]);
        await db.deleteObject('arr');
        expect(await db.getObject('arr')).toBeNull();
    });

    it('fetchAll: returns rows with ids', async () => {
        const db = new DataBaseInterface(tempDbFile('all'));
        await db.setObject('k1', { a: 1 });
        await db.setObject('k2', 42);
        const all = await db.fetchAll();
        expect(Array.isArray(all)).toBe(true);
        const ids = all.map(r => r.id);
        expect(ids).toEqual(expect.arrayContaining(['k1', 'k2']));
    });
});
