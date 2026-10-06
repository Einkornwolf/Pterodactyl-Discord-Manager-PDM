/*
 * Copyright (c) 2025 Finn Wolf
 * All rights reserved.
 */

const fs = require('node:fs');
const path = require('node:path');
const { QuickDB } = require('quick.db');
const connections = new Map();

// Share one connection and operation queue across managers using the same file.
function getConnection(filePath) {
    const filename = path.resolve(filePath);

    if (!connections.has(filename)) {
        fs.mkdirSync(path.dirname(filename), { recursive: true });
        connections.set(filename, {
            database: new QuickDB({ filePath: filename }),
            queue: Promise.resolve(),
            closing: false
        });
    }

    return connections.get(filename);
}

class DataBaseInterface {
    /**
     * Handle database access without overlapping read/modify/write operations.
     *
     * @param {string} [filePath='database/json.sqlite'] SQLite database file.
     */
    constructor(filePath = 'database/json.sqlite') {
        const connection = getConnection(filePath);
        const enqueue = operation => {
            if (connection.closing) {
                return Promise.reject(new Error('Database connection is closing or closed'));
            }

            const result = connection.queue.then(() => operation(connection.database));
            // Return the failure to the caller, but allow later operations to proceed.
            connection.queue = result.catch(() => {});
            return result;
        };

        // Add a user to the database.
        this.setUser = (userId, eMail, userName) => enqueue(database => database.set(userId, {
            e_mail: eMail,
            name: userName
        }));

        // Read an object, including QuickDB's nested keys.
        this.getObject = key => enqueue(database => database.get(key));

        // Change a user's email while preserving their other fields.
        this.changeUserMail = (userId, eMail) => enqueue(async database => {
            const user = await database.get(userId);
            if (!user) {
                throw new Error('User not found');
            }

            return database.set(userId, { ...user, e_mail: eMail });
        });

        // Add a supported shop item.
        this.addShopItem = (type, data) => enqueue(database => {
            if (type !== 'server') {
                return null;
            }
            return database.push('shop_items_servers', { type, data });
        });

        // Replace the shop's contents.
        this.setShop = data => enqueue(database => database.set('shop_items_servers', data));

        // Delete a user from the database.
        this.deleteUser = userId => enqueue(database => database.delete(userId));

        // Remove a shop item without overwriting a concurrent shop update.
        this.removeShopItem = index => enqueue(async database => {
            const shop = await database.get('shop_items_servers');
            if (!shop) {
                return null;
            }

            shop.splice(index, 1);
            await database.set('shop_items_servers', shop);
        });

        // Update numeric user fields using the existing key suffix convention.
        this.addUserValue = (userId, key, value) => enqueue(database => database.add(`${userId}${key}`, value));
        this.removeUserValue = (userId, key, value) => enqueue(database => database.sub(`${userId}${key}`, value));
        this.setUserValue = (userId, key, value) => enqueue(database => database.set(`${userId}${key}`, value));

        // Retrieve the entire database.
        this.fetchAll = () => enqueue(database => database.all());

        // Write, append to, or delete a general object.
        this.setObject = (key, data) => enqueue(database => database.set(key, data));
        this.pushObject = (key, data) => enqueue(database => database.push(key, data));
        this.deleteObject = key => enqueue(database => database.delete(key));

        /**
         * Transfer whole coins, rechecking both accounts inside one transaction.
         * Other account fields and valid fractional balances are preserved.
         *
         * @param {string} senderId Sender's database key.
         * @param {string} recipientId Recipient's database key.
         * @param {number} amount Positive safe integer number of coins.
         * @returns {Promise<{ok: boolean, reason?: string}>} Success or a validation failure.
         */
        this.transferCoins = (senderId, recipientId, amount) => enqueue(async database => {
            if (typeof senderId !== 'string' || typeof recipientId !== 'string') {
                throw new TypeError('Transfer account IDs must be strings');
            }
            if (!Number.isSafeInteger(amount) || amount <= 0) {
                return { ok: false, reason: 'invalid_amount' };
            }
            if (senderId === recipientId) {
                return { ok: false, reason: 'same_user' };
            }

            await database.init();
            const sqlite = database.driver.database;
            const read = sqlite.prepare('SELECT json FROM json WHERE ID = ?');
            const write = sqlite.prepare('UPDATE json SET json = ? WHERE ID = ?');

            // QuickDB stores account documents in its default json table.
            // Keep the callback synchronous: both writes commit or neither does.
            return sqlite.transaction(() => {
                const senderRow = read.get(senderId);
                const recipientRow = read.get(recipientId);
                if (!senderRow) {
                    return { ok: false, reason: 'sender_missing' };
                }
                if (!recipientRow) {
                    return { ok: false, reason: 'recipient_missing' };
                }

                const sender = JSON.parse(senderRow.json);
                const recipient = JSON.parse(recipientRow.json);
                if (!sender || !recipient || typeof sender !== 'object' || typeof recipient !== 'object'
                    || Array.isArray(sender) || Array.isArray(recipient)) {
                    return { ok: false, reason: 'invalid_balance' };
                }

                const senderBalance = sender.balance === undefined ? 0 : sender.balance;
                const recipientBalance = recipient.balance === undefined ? 0 : recipient.balance;
                const creditedBalance = recipientBalance + amount;
                if (!Number.isFinite(senderBalance) || Math.abs(senderBalance) > Number.MAX_SAFE_INTEGER
                    || !Number.isFinite(recipientBalance) || Math.abs(recipientBalance) > Number.MAX_SAFE_INTEGER
                    || !Number.isFinite(creditedBalance) || Math.abs(creditedBalance) > Number.MAX_SAFE_INTEGER) {
                    return { ok: false, reason: 'invalid_balance' };
                }
                if (senderBalance < amount) {
                    return { ok: false, reason: 'insufficient_funds' };
                }

                sender.balance = senderBalance - amount;
                recipient.balance = creditedBalance;
                write.run(JSON.stringify(sender), senderId);
                write.run(JSON.stringify(recipient), recipientId);
                return { ok: true };
            }).immediate();
        });
    }

    /**
     * Drain queued operations and close shared connections.
     * Existing managers reject further work; new managers can reopen the file.
     *
     * @returns {Promise<void>}
     */
    static async closeAll() {
        const closingConnections = [...connections.entries()];
        for (const [, connection] of closingConnections) {
            connection.closing = true;
        }

        for (const [filename, connection] of closingConnections) {
            await connection.queue;
            const sqlite = connection.database.driver.database;
            if (sqlite.open) {
                sqlite.close();
            }
            if (connections.get(filename) === connection) {
                connections.delete(filename);
            }
        }
    }
}

module.exports = { DataBaseInterface };
