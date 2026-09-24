jest.mock('../classes/dataBaseInterface', () => ({ DataBaseInterface: class {} }));
const { ManagerClient } = require('../managers/manager');
const { Collection } = require('discord.js');
test('all interaction modules load and command builders serialize on the installed discord.js', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    const client = new ManagerClient({ intents: [] });
    for (const name of ['commands', 'events', 'buttons', 'selectMenus', 'modals', 'analogCommands', 'cronJobs']) client[name] = new Collection();
    client.application = { commands: { set: jest.fn().mockResolvedValue() } };
    try {
        await client.loadCommands(); await client.loadEvents(); await client.loadButtons();
        await client.loadSelectMenus(); await client.loadModals(); await client.loadAnalogCommands(); await client.loadCronJobs();
        const commands = client.application.commands.set.mock.calls[0][0];
        expect(commands.length).toBeGreaterThan(0);
        expect(commands.every(command => typeof command.name === 'string')).toBe(true);
    } finally { await client.destroy(); log.mockRestore(); }
});
