// An isolated storage boundary for domain tests; the SQLite adapter is tested separately.
class MemoryDatabase {
    constructor() {
        this.records = new Map();
        const clone = value => value === undefined ? null : structuredClone(value);
        this.getObject = jest.fn(async key => clone(this.records.get(key)));
        this.setObject = jest.fn(async (key, value) => {
            this.records.set(key, clone(value));
            return value;
        });
        this.deleteObject = jest.fn(async key => {
            const [id, field] = key.split('.');
            if (!field) return this.records.delete(id);
            const record = this.records.get(id);
            if (record) delete record[field];
        });
        this.pushObject = jest.fn(async (key, value) => {
            const list = this.records.get(key) || [];
            list.push(clone(value));
            this.records.set(key, list);
            return list;
        });
        this.fetchAll = jest.fn(async () => [...this.records].map(([id, value]) => ({ id, value: clone(value) })));
        this.setUserValue = jest.fn(async (id, key, value) => {
            const user = this.records.get(id) || {};
            user[key.slice(1)] = value;
            this.records.set(id, user);
            return value;
        });
        this.addUserValue = jest.fn(async (id, key, amount) => {
            const user = this.records.get(id) || {};
            user[key.slice(1)] = (user[key.slice(1)] || 0) + amount;
            this.records.set(id, user);
            return user[key.slice(1)];
        });
        this.removeUserValue = jest.fn(async (id, key, amount) => this.addUserValue(id, key, -amount));
    }
}

module.exports = { MemoryDatabase };
