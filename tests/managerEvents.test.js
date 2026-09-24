const mockLoadFiles = jest.fn();
const mockEvent = { name: 'testEvent', execute: jest.fn(), once: true };
jest.mock('../classes/utilityCollection', () => ({ UtilityCollection: jest.fn(() => ({ loadFiles: mockLoadFiles })) }));
jest.mock('../events/loadInteractions', () => mockEvent);
const { ManagerClient } = require('../managers/manager');
const { Collection } = require('discord.js');
let client;
beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockLoadFiles.mockResolvedValue([require.resolve('../events/loadInteractions')]);
    mockEvent.once = true; mockEvent.rest = false;
    client = new ManagerClient({ intents: [] }); client.events = new Collection();
});
afterEach(async () => { await client.destroy(); jest.restoreAllMocks(); });
test.each([false, true])('once handlers register correctly (REST=%s)', async rest => {
    mockEvent.rest = rest;
    await client.loadEvents();
    const emitter = rest ? client.rest : client;
    emitter.emit('testEvent'); emitter.emit('testEvent');
    await new Promise(setImmediate);
    expect(mockEvent.execute).toHaveBeenCalledTimes(1);
});
test('reload removes old REST listeners', async () => {
    mockEvent.rest = true; mockEvent.once = false;
    await client.loadEvents(); await client.reloadEvents();
    client.rest.emit('testEvent');
    await new Promise(setImmediate);
    expect(mockEvent.execute).toHaveBeenCalledTimes(1);
});
test('async event failures are handled', async () => {
    mockEvent.execute.mockRejectedValueOnce(new Error('test failure'));
    await client.loadEvents(); client.emit('testEvent');
    await new Promise(setImmediate);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('testEvent'), expect.any(Error));
});
