jest.mock('../classes/dataBaseInterface', () => ({ DataBaseInterface: class {} }));
jest.mock('../classes/translationManager', () => ({ TranslationManager: class { async getTranslation(key) { return key; } } }));
const dispatcher = require('../events/commandDistributor');
const { MessageFlags } = require('discord.js');
let interaction, client;
beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    interaction = { inGuild: () => true, user: { id: 'test' }, commandName: 'test',
        isChatInputCommand: () => true, isButton: () => false, isStringSelectMenu: () => false, isModalSubmit: () => false,
        reply: jest.fn().mockResolvedValue(), editReply: jest.fn().mockResolvedValue(), followUp: jest.fn().mockResolvedValue() };
    client = { commands: new Map(), buttons: new Map(), selectMenus: new Map(), modals: new Map() };
});
afterEach(() => jest.restoreAllMocks());
test('stale commands receive an ephemeral response', async () => {
    await expect(dispatcher.execute(interaction, client)).resolves.toBeUndefined();
    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ flags: MessageFlags.Ephemeral }));
});
test.each(['reply', 'editReply', 'followUp'])('handler errors use %s without double acknowledgement', async method => {
    interaction.deferred = method === 'editReply'; interaction.replied = method === 'followUp';
    client.commands.set('test', { execute: jest.fn().mockRejectedValue(new Error('test')) });
    await dispatcher.execute(interaction, client);
    expect(interaction[method]).toHaveBeenCalledTimes(1);
});
test('expired response errors do not escape', async () => {
    interaction.reply.mockRejectedValue(new Error('expired'));
    await expect(dispatcher.execute(interaction, client)).resolves.toBeUndefined();
});
