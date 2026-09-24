/*
 * Copyright (c) 2025 Finn Wolf
 * All rights reserved.
 */
const { QuickDB } = require('quick.db');
const fs = require('node:fs');
const path = require('node:path');

// QuickDB read/modify/write methods contain awaits. Serialize them per file,
// including transfers, so other managers cannot overwrite a committed balance.
const connections = new Map();
function connection(filePath) {
    const filename = path.resolve(filePath);
    if (!connections.has(filename)) {
        fs.mkdirSync(path.dirname(filename), { recursive: true });
        connections.set(filename, { database: new QuickDB({ filePath: filename }), tail: Promise.resolve() });
    }
    return connections.get(filename);
}

class DataBaseInterface {
    constructor(filePath = 'database/json.sqlite') {
        const state = connection(filePath);
        const database = state.database;
        const run = operation => {
            const result = state.tail.then(() => operation(database));
            state.tail = result.catch(() => {});
            return result;
        };
        this.setUser = (userId, eMail, userName) => run(db => db.set(userId, { e_mail: eMail, name: userName }));
        this.getObject = key => run(db => db.get(key));
        this.changeUserMail = (userId, eMail) => run(async db => {
            const user = await db.get(userId);
            if (!user) throw new Error('User not found');
            return db.set(userId, { ...user, e_mail: eMail });
        });
        this.addShopItem = (type, data) => run(db => type === 'server' ? db.push('shop_items_servers', { type, data }) : null);
        this.setShop = data => run(db => db.set('shop_items_servers', data));
        this.deleteUser = userId => run(db => db.delete(userId));
        this.removeShopItem = index => run(async db => {
            const shop = await db.get('shop_items_servers');
            if (!shop) return null;
            shop.splice(index, 1);
            await db.set('shop_items_servers', shop);
        });
        this.addUserValue = (userId, key, value) => run(db => db.add(`${userId}${key}`, value));
        this.removeUserValue = (userId, key, value) => run(db => db.sub(`${userId}${key}`, value));
        this.setUserValue = (userId, key, value) => run(db => db.set(`${userId}${key}`, value));
        this.fetchAll = () => run(db => db.all());
        this.setObject = (key, data) => run(db => db.set(key, data));
        this.pushObject = (key, data) => run(db => db.push(key, data));
        this.deleteObject = key => run(db => db.delete(key));

        this.transferCoins = (senderId, recipientId, amount) => run(async db => {
            if (!Number.isSafeInteger(amount) || amount <= 0) return { ok: false, reason: 'invalid_amount' };
            if (senderId === recipientId) return { ok: false, reason: 'same_user' };
            await db.init();
            const sqlite = db.driver.database;
            const read = sqlite.prepare('SELECT json FROM json WHERE ID = ?');
            const write = sqlite.prepare('UPDATE json SET json = ? WHERE ID = ?');
            // No awaits inside this transaction: both writes commit or neither does.
            return sqlite.transaction(() => {
                const senderRow = read.get(senderId), recipientRow = read.get(recipientId);
                if (!senderRow) return { ok: false, reason: 'sender_missing' };
                if (!recipientRow) return { ok: false, reason: 'recipient_missing' };
                const sender = JSON.parse(senderRow.json), recipient = JSON.parse(recipientRow.json);
                if (!Number.isFinite(sender.balance) || sender.balance < amount) return { ok: false, reason: 'insufficient_funds' };
                const recipientBalance = recipient.balance ?? 0;
                if (!Number.isFinite(recipientBalance) || Math.abs(recipientBalance + amount) > Number.MAX_SAFE_INTEGER) {
                    return { ok: false, reason: 'invalid_balance' };
                }
                sender.balance -= amount;
                recipient.balance = recipientBalance + amount;
                write.run(JSON.stringify(sender), senderId);
                write.run(JSON.stringify(recipient), recipientId);
                return { ok: true };
            }).immediate();
        });
    }
    static async closeAll() {
        for (const state of connections.values()) {
            await state.tail;
            state.database.driver.database.close();
        }
        connections.clear();
    }
}
module.exports = { DataBaseInterface };
