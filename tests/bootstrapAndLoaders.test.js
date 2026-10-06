const path = require('node:path');
const fs = require('node:fs/promises');
const { execFileSync } = require('node:child_process');
const { Collection, GatewayIntentBits, Partials } = require('discord.js');
const { installHandlerMocks } = require('./helpers/handlerHarness');
installHandlerMocks();

describe('real module loading', () => {
    let client;
    beforeEach(() => {
        const { ManagerClient } = require('../managers/manager');
        client = new ManagerClient({ intents: [] });
        for (const name of ['commands', 'events', 'buttons', 'selectMenus', 'modals', 'analogCommands', 'cronJobs']) client[name] = new Collection([['obsolete', {}]]);
        client.application = { commands: { set: jest.fn().mockResolvedValue() } };
        jest.spyOn(console, 'log').mockImplementation(() => {});
    });
    afterEach(async () => { await client.destroy(); });
    test('command loading replaces stale entries and publishes valid slash-command definitions', async () => {
        await client.loadCommands();
        expect(client.commands.has('obsolete')).toBe(false);
        expect(client.commands.size).toBeGreaterThan(15);
        const definitions = client.application.commands.set.mock.calls[0][0];
        expect(new Set(definitions.map(command => command.name)).size).toBe(definitions.length);
        for (const definition of definitions) {
            expect(definition.name).toMatch(/^[a-z0-9-]+$/);
            expect(definition.description.length).toBeGreaterThan(0);
            expect(client.commands.get(definition.name).execute).toEqual(expect.any(Function));
        }
    });
    test.each([
        ['loadButtons', 'buttons'], ['loadSelectMenus', 'selectMenus'], ['loadModals', 'modals'],
        ['loadAnalogCommands', 'analogCommands'], ['loadCronJobs', 'cronJobs']
    ])('%s registers executable modules and clears obsolete entries', async (method, collection) => {
        await client[method]();
        expect(client[collection].has('obsolete')).toBe(false);
        expect(client[collection].size).toBeGreaterThan(0);
        for (const [id, handler] of client[collection]) {
            expect(id).toEqual(expect.any(String));
            expect(handler.customId).toBe(id);
            expect(handler.execute).toEqual(expect.any(Function));
        }
    });
    test('events register listeners that forward Discord arguments and the owning client', async () => {
        await client.loadEvents();
        expect([...client.events.keys()].sort()).toEqual(['clientReady', 'interactionCreate', 'messageCreate']);
        const handler = require('../events/analogCreate');
        const spy = jest.spyOn(handler, 'execute').mockResolvedValue();
        const message = { content: 'hello' };
        const listener = client.listeners('messageCreate')[0];
        await listener(message);
        expect(spy).toHaveBeenCalledWith(message, client);
        expect(client.events.has('messageCreate')).toBe(true);
    });
    test('event reload removes old listeners before loading replacements', async () => {
        await client.loadEvents();
        const old = client.listeners('messageCreate')[0];
        jest.spyOn(client, 'loadEvents').mockResolvedValue();
        await client.reloadEvents();
        expect(client.listeners('messageCreate')).not.toContain(old);
        expect(client.loadEvents).toHaveBeenCalledTimes(1);
    });
    test.each([
        ['reloadCommands', 'loadCommands'], ['reloadButtons', 'loadButtons'], ['reloadSelectMenus', 'loadSelectMenus'],
        ['reloadModals', 'loadModals'], ['reloadAnalogCommands', 'loadAnalogCommands']
    ])('%s invokes its corresponding loader', async (reload, load) => {
        jest.spyOn(client, load).mockResolvedValue();
        await client[reload]();
        expect(client[load]).toHaveBeenCalledTimes(1);
    });
});

test('file discovery finds nested JavaScript and invalidates its require cache', async () => {
    const { UtilityCollection } = require('../classes/utilityCollection');
    const directory = await fs.mkdtemp(path.join(process.cwd(), 'pdm-loader-test-'));
    const nested = path.join(directory, 'nested');
    const filename = path.join(nested, 'handler.js');
    try {
        await fs.mkdir(nested);
        await fs.writeFile(filename, 'module.exports = { version: 1 };\n');
        await fs.writeFile(path.join(directory, 'ignore.txt'), 'not JavaScript');
        const files = await new UtilityCollection().loadFiles(path.basename(directory));
        expect(files).toEqual([filename]);
        // Jest maintains its own module registry; exercise Node's real require cache in a child.
        const script = `
            const fs = require('node:fs');
            const { UtilityCollection } = require('./classes/utilityCollection');
            const filename = process.argv[1];
            const directory = process.argv[2];
            const original = require(filename).version;
            fs.writeFileSync(filename, 'module.exports = { version: 2 };');
            new UtilityCollection().loadFiles(directory).then(() => {
                process.stdout.write(JSON.stringify([original, require(filename).version]));
            }).catch(error => { console.error(error); process.exitCode = 1; });
        `;
        expect(JSON.parse(execFileSync(process.execPath, ['-e', script, filename, path.basename(directory)], { encoding: 'utf8' }))).toEqual([1, 2]);
    } finally {
        delete require.cache[filename];
        await fs.rm(directory, { recursive: true, force: true });
    }
});

test('bootstrap initializes the required registries, intents, configuration, and login', async () => {
    const client = { loadEvents: jest.fn().mockResolvedValue(), login: jest.fn().mockResolvedValue() };
    const constructor = jest.fn(() => client);
    const configure = jest.fn();
    jest.doMock('../managers/manager', () => ({ ManagerClient: constructor }));
    jest.doMock('dotenv', () => ({ config: configure }));
    jest.isolateModules(() => require('../bot'));
    await Promise.resolve();
    await Promise.resolve();
    for (const name of ['commands', 'events', 'buttons', 'selectMenus', 'modals', 'analogCommands', 'cronJobs']) {
        // isolateModules uses a fresh Discord module, so compare the Collection behavior.
        expect(client[name].size).toBe(0);
        expect(client[name].set).toEqual(expect.any(Function));
    }
    expect(configure).toHaveBeenCalledWith({ path: './config.env' });
    expect(constructor).toHaveBeenCalledWith({
        intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers],
        partials: [Partials.Channel, Partials.User, Partials.GuildMember, Partials.ThreadMember]
    });
    expect(client.loadEvents).toHaveBeenCalledTimes(1);
    expect(client.login).toHaveBeenCalledWith('test-token');
});
