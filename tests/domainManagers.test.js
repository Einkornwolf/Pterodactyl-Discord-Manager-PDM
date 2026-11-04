jest.mock('../classes/dataBaseInterface', () => ({
    DataBaseInterface: require('./helpers/memoryDatabase').MemoryDatabase
}));
const { EconomyManager } = require('../classes/economyManager');
const { GiftCodeManager } = require('../classes/giftCodeManager');
const { BoosterManager } = require('../classes/boosterManager');
const { CacheManager } = require('../classes/cacheManager');

describe('economy', () => {
    let economy;
    beforeEach(() => { economy = new EconomyManager(); });

    test.each([
        ['addCoins', 'addUserValue', '.balance'], ['setCoins', 'setUserValue', '.balance'],
        ['removeCoins', 'removeUserValue', '.balance'], ['addDailyAmount', 'addUserValue', '.daily'],
        ['setDailyAmount', 'setUserValue', '.daily'], ['removeDailyAmount', 'removeUserValue', '.daily']
    ])('%s addresses the correct user field', async (method, adapter, field) => {
        await economy[method]('user', 12);
        expect(economy[adapter]).toHaveBeenCalledWith('user', field, 12);
    });
    test('reads balances, including zero and missing accounts', async () => {
        await expect(economy.getUserBalance('missing')).resolves.toBeNull();
        await expect(economy.getUserDaily('missing')).resolves.toBeNull();
        economy.records.set('user', { balance: 0, daily: 4 });
        await expect(economy.getUserBalance('user')).resolves.toBe(0);
        await expect(economy.getUserDaily('user')).resolves.toBe(4);
    });
    test('totals balances while ignoring non-economy records', async () => {
        economy.records.set('a', { balance: 10 });
        economy.records.set('b', { balance: 25 });
        economy.records.set('c', { balance: 0 });
        economy.records.set('settings', {});
        economy.records.set('invalid', { balance: '100' });
        economy.records.set('null', null);
        economy.records.set('infinite', { balance: Infinity });
        await expect(economy.getTotalCoinAmount()).resolves.toBe(35);
    });
    test('returns nonzero numeric balances in ascending order', async () => {
        economy.records.set('a', { balance: 20 });
        economy.records.set('b', { balance: 15 });
        economy.records.set('c', { balance: -5 });
        economy.records.set('zero', { balance: 0 });
        economy.records.set('invalid', { balance: '100' });
        economy.records.set('infinite', { balance: Infinity });
        economy.records.set('null', null);
        economy.records.set('settings', {});
        expect((await economy.getTopUsers()).map(user => user.id)).toEqual(['c', 'b', 'a']);
    });
    test('resets daily rewards for every participating user', async () => {
        economy.records.set('a', { daily: 5 });
        economy.records.set('b', { daily: 10 });
        economy.records.set('settings', {});
        economy.records.set('null', null);
        await economy.resetAllDailyAmounts();
        expect(economy.setDailyAmount).toBeDefined();
        expect(economy.setUserValue.mock.calls).toEqual([['a', '.daily', 0], ['b', '.daily', 0]]);
        await expect(economy.getUserDaily('a')).resolves.toBe(0);
    });
});

describe('gift codes', () => {
    let gifts;
    beforeEach(() => { gifts = new GiftCodeManager(); });
    test('creates the redemption metadata for a new code', async () => {
        await gifts.createGiftCode('WELCOME', 50, 'false');
        await expect(gifts.getObject('gift_codes_list')).resolves.toEqual([
            { code: 'WELCOME', value: 50, singleUse: 'false', usedBy: [] }
        ]);
    });
    test('deletes only the requested code and reports a missing code', async () => {
        await gifts.createGiftCode('A', 5, 'true');
        await gifts.createGiftCode('B', 10, 'false');
        await expect(gifts.deleteGiftCode('unknown')).resolves.toBe(false);
        await expect(gifts.deleteGiftCode('A')).resolves.toBe(true);
        expect((await gifts.getObject('gift_codes_list')).map(code => code.code)).toEqual(['B']);
    });
    test('records a redemption without changing other code properties', async () => {
        await gifts.createGiftCode('A', 5, 'false');
        await gifts.addUsed('user', 'A');
        await expect(gifts.getObject('gift_codes_list')).resolves.toEqual([
            { code: 'A', value: 5, singleUse: 'false', usedBy: ['user'] }
        ]);
    });
});

test('booster status can be granted and removed', async () => {
    const boosters = new BoosterManager();
    await boosters.setBoosterStatus('user', true);
    await expect(boosters.getBoosterStatus('user')).resolves.toBe(true);
    await boosters.setBoosterStatus('user', false);
    await expect(boosters.getBoosterStatus('user')).resolves.toBe(false);
    expect(boosters.setUserValue).toHaveBeenLastCalledWith('user', '.booster', false);
});

test('interaction caches are isolated by user and can be cleared', async () => {
    const cache = new CacheManager();
    await cache.cacheData('a', { selected: 1 });
    await cache.cacheData('b', { selected: 2 });
    await expect(cache.getCachedData('a')).resolves.toEqual({ selected: 1 });
    await cache.clearCache('a');
    await expect(cache.getCachedData('a')).resolves.toBeNull();
    await expect(cache.getCachedData('b')).resolves.toEqual({ selected: 2 });
});
