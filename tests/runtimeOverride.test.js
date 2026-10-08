jest.mock('../classes/dataBaseInterface', () => ({ DataBaseInterface: class {} }));
jest.mock('../buttons/runtimeOverride/continue', () => ({ execute: jest.fn().mockResolvedValue() }));
jest.mock('../buttons/runtimeOverride/cancel', () => ({ execute: jest.fn().mockResolvedValue() }));
const { EventEmitter } = require('node:events');
const command = require('../commands/setServerRuntime');
const confirm = require('../buttons/runtimeOverride/continue');
const cancel = require('../buttons/runtimeOverride/cancel');
const admin = '123456789012345678';
afterEach(() => { delete process.env.ADMIN_LIST; delete process.env.FOOTER_TEXT; jest.clearAllMocks(); });
test.each(['overrideTrue', 'overrideFalse'])('bound collector routes %s with the complete context', async customId => {
    process.env.ADMIN_LIST = admin; process.env.FOOTER_TEXT = 'Test';
    const collector = new EventEmitter();
    const message = { createMessageComponentCollector: jest.fn(() => collector) };
    const interaction = {
        user: { id: admin, fetch: async () => ({ accentColor: null }) }, guild: null,
        options: { getString: () => 'server-uuid', getInteger: () => 30, getNumber: () => 100 },
        deferReply: jest.fn(), editReply: jest.fn(async () => message),
        channel: { createMessageComponentCollector: jest.fn() }
    };
    const panel = { getAccumulatedUserServers: async () => ['server-uuid'], getServerIdentifier: async () => 'short', getServerRuntime: async () => ({ status: true }) };
    const emoji = { getEmoji: async () => '✅', parseEmoji: value => value };
    const t = async key => key;
    const context = [{}, panel, {}, {}, {}, {}, {}, t, { gift: true }, emoji];
    await command.execute(interaction, ...context);
    expect(interaction.channel.createMessageComponentCollector).not.toHaveBeenCalled();
    const filter = message.createMessageComponentCollector.mock.calls[0][0].filter;
    expect(filter({ user: { id: admin }, customId })).toBe(true);
    expect(filter({ user: { id: admin }, customId: 'unrelated' })).toBe(false);
    const click = { user: { id: admin }, customId };
    collector.emit('collect', click);
    await new Promise(setImmediate);
    if (customId === 'overrideTrue') expect(confirm.execute).toHaveBeenCalledWith(click, ...context, 'server-uuid', 'short', 30, 100);
    else expect(cancel.execute).toHaveBeenCalledWith(click, ...context);
});
