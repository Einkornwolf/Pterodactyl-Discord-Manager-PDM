const { installHandlerMocks, makeScene } = require('./helpers/handlerHarness');
installHandlerMocks();
let mockEconomy;
jest.mock('../classes/economyManager', () => ({ EconomyManager: jest.fn(() => mockEconomy) }));
jest.mock('../classes/emojiManager', () => ({ EmojiManager: jest.fn(() => ({ getEmoji: jest.fn().mockResolvedValue('✅') })) }));
let scene;
beforeEach(() => {
    scene = makeScene();
    mockEconomy = scene.economy;
    scene.message.inGuild = jest.fn(() => true);
    scene.message.channelId = scene.channel.id;
    scene.message.guild = scene.interaction.guild;
    scene.message.mentions = { members: { first: jest.fn() } };
    scene.database.getObject.mockImplementation(async key => key === 'countingChannel' ? scene.channel.id : scene.userRecord);
});

test.each([[0, 1], [15, 1], [16, 2], [25, 2], [26, 3], [35, 3], [36, 4], [45, 4], [46, 5], [55, 5], [56, 6]])('message length %s earns %s coins', async (length, amount) => {
    scene.message.content = 'x'.repeat(length);
    await require('../analogCommands/currencyGiver').execute(scene.message, scene.client, scene.database, scene.economy);
    expect(scene.economy.addCoins).toHaveBeenCalledWith(scene.user.id, amount);
});
test.each(['dm', 'bot', 'unregistered'])('message rewards ignore %s messages', async reason => {
    if (reason === 'dm') scene.message.inGuild.mockReturnValue(false);
    if (reason === 'bot') scene.user.bot = true;
    if (reason === 'unregistered') scene.database.getObject.mockResolvedValue(null);
    await require('../analogCommands/currencyGiver').execute(scene.message, scene.client, scene.database, scene.economy);
    expect(scene.economy.addCoins).not.toHaveBeenCalled();
});

function freshCountingGame() {
    let handler;
    jest.isolateModules(() => { handler = require('../analogCommands/countingGame'); });
    return handler;
}
const count = handler => handler.execute(scene.message, scene.client, scene.database, scene.economy);
test.each(['dm', 'bot', 'wrong-channel', 'unregistered'])('counting ignores or rejects %s messages', async reason => {
    if (reason === 'dm') scene.message.inGuild.mockReturnValue(false);
    if (reason === 'bot') scene.user.bot = true;
    if (reason === 'wrong-channel') scene.message.channelId = 'elsewhere';
    if (reason === 'unregistered') scene.database.getObject.mockImplementation(async key => key === 'countingChannel' ? scene.channel.id : null);
    await count(freshCountingGame());
    expect(scene.economy.addCoins).not.toHaveBeenCalled();
    expect(scene.economy.removeCoins).not.toHaveBeenCalled();
    if (reason === 'unregistered') expect(scene.message.react.mock.calls.map(call => call[0])).toEqual(['🚹', '❌']);
});
test('integer counting rewards consecutive numbers from alternating users', async () => {
    const game = freshCountingGame();
    scene.message.content = '1';
    await count(game);
    scene.message.author = scene.recipient;
    scene.message.content = '2';
    await count(game);
    expect(scene.economy.addCoins.mock.calls).toEqual([[scene.user.id, 1], [scene.recipient.id, 1]]);
    expect(scene.message.react).toHaveBeenCalledWith('✅');
});
test('a repeated user is penalized and restarts the count', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    const game = freshCountingGame();
    scene.message.content = '1';
    await count(game);
    scene.message.content = '2';
    await count(game);
    expect(scene.economy.removeCoins).toHaveBeenCalledWith(scene.user.id, 2);
    expect(scene.channel.send.mock.calls[0][0].embeds[0].toJSON().title).toContain('wrong_user_title');
    scene.message.content = '1';
    await count(game);
    expect(scene.economy.addCoins).toHaveBeenCalledTimes(2);
});
test('an invalid count reports expected and given numbers before restarting', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    scene.message.content = '7';
    await count(freshCountingGame());
    expect(scene.economy.removeCoins).toHaveBeenCalledWith(scene.user.id, 2);
    const fields = scene.channel.send.mock.calls[0][0].embeds[0].toJSON().fields;
    expect(fields.map(field => field.value)).toEqual(['`1`', '`7`']);
});
test('mode changes support binary counting and binary error messages', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.9);
    const game = freshCountingGame();
    scene.message.content = '9';
    await count(game);
    expect(scene.channel.send.mock.calls[1][0].embeds[0].toJSON().title).toContain('binary');
    scene.message.content = '1';
    await count(game);
    scene.message.author = scene.recipient;
    scene.message.content = '10';
    await count(game);
    scene.message.author = scene.user;
    scene.message.content = '100';
    await count(game);
    expect(scene.economy.addCoins).toHaveBeenCalledTimes(2);
    expect(scene.channel.send.mock.calls.at(-1)[0].embeds[0].toJSON().fields[0].value).toBe('`11`');
});

test.each(['events', 'commands', 'all', 'unknown'])('developer reload handles the %s scope', async scope => {
    for (const name of ['Events', 'Commands', 'Buttons', 'SelectMenus', 'Modals', 'AnalogCommands']) scene.client[`reload${name}`] = jest.fn().mockResolvedValue();
    scene.message.content = `pdm reload ? ${scope}`;
    await require('../analogCommands/developer/reload').execute(scene.message, scene.client);
    for (const name of ['Events', 'Commands', 'Buttons', 'SelectMenus', 'Modals', 'AnalogCommands']) expect(scene.client[`reload${name}`]).toHaveBeenCalledTimes(scope === 'all' || scope === name.toLowerCase() ? 1 : 0);
    expect(scene.channel.send).toHaveBeenCalledTimes(scope === 'unknown' ? 0 : 1);
});
test.each(['reload', 'eval', 'ban'])('developer %s ignores an unauthorized user', async command => {
    scene.message.author = scene.recipient;
    await require(`../analogCommands/developer/${command}`).execute(scene.message, scene.client);
    expect(scene.channel.send).not.toHaveBeenCalled();
    expect(scene.client.users.fetch).not.toHaveBeenCalled();
});
test.each(['2 + 2', 'throw new Error("test failure")'])('developer evaluation reports controlled input: %s', async input => {
    process.env.ENABLE_DEVELOPER_EVAL = 'true';
    try {
        scene.message.content = `pdm eval ? ${input}`;
        await require('../analogCommands/developer/eval').execute(scene.message, scene.client);
        const embed = scene.channel.send.mock.calls[0][0].embeds[0].toJSON();
        expect(embed.fields[1].value).toContain(input.startsWith('throw') ? 'test failure' : '4');
    } finally { process.env.ENABLE_DEVELOPER_EVAL = 'false'; }
});
test.each(['mention', 'id'])('developer ban resolves its target from a %s', async target => {
    const member = { id: scene.recipient.id, ban: jest.fn().mockResolvedValue() };
    scene.message.content = `pdm ban ? ${scene.recipient.id}`;
    if (target === 'mention') scene.message.mentions.members.first.mockReturnValue(member);
    else { scene.client.users.fetch.mockResolvedValue(member); scene.message.guild.members.fetch.mockResolvedValue(member); }
    await require('../analogCommands/developer/ban').execute(scene.message, scene.client);
    for (let index = 0; index < 10; index++) await Promise.resolve();
    expect(member.ban).toHaveBeenCalledWith({ reason: 'Banned by Ptero-Manager' });
    expect(scene.channel.send).toHaveBeenCalledWith('User Banned 💀');
});
test.each(['lookup', 'ban'])('developer ban reports a %s failure', async phase => {
    scene.message.content = `pdm ban ? ${scene.recipient.id}`;
    if (phase === 'lookup') scene.client.users.fetch.mockRejectedValue(new Error('Missing user'));
    else scene.message.mentions.members.first.mockReturnValue({ ban: jest.fn().mockRejectedValue(new Error('Missing permissions')) });
    await require('../analogCommands/developer/ban').execute(scene.message, scene.client);
    for (let index = 0; index < 10; index++) await Promise.resolve();
    expect(scene.channel.send).toHaveBeenCalledWith(expect.stringContaining('Error banning user:'));
});
