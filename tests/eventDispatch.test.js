const { installHandlerMocks, makeScene } = require('./helpers/handlerHarness');
installHandlerMocks();
const mockLog = { logString: jest.fn().mockResolvedValue() };
jest.mock('../classes/logManager', () => ({ LogManager: jest.fn(() => mockLog) }));

beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
});

test.each([
    ['isCommand', 'commands'], ['isButton', 'buttons'], ['isStringSelectMenu', 'selectMenus'], ['isModalSubmit', 'modals']
])('interaction dispatcher forwards %s to its registered handler', async (predicate, collection) => {
    const scene = makeScene();
    scene.interaction[predicate].mockReturnValue(true);
    if (predicate === 'isCommand') scene.interaction.isChatInputCommand.mockReturnValue(true);
    const handler = { customId: 'test', execute: jest.fn().mockResolvedValue() };
    scene.client[collection].set('test', handler);
    await require('../events/commandDistributor').execute(scene.interaction, scene.client);
    expect(handler.execute).toHaveBeenCalledTimes(1);
    const args = handler.execute.mock.calls[0];
    expect(args).toHaveLength(11);
    expect(args.slice(0, 2)).toEqual([scene.interaction, scene.client]);
    expect(await args[8]('example.key')).toBe('key');
    expect(args[10].parseEmoji).toEqual(expect.any(Function));
});
test.each(['isCommand', 'isButton', 'isStringSelectMenu', 'isModalSubmit'])('handler errors from %s are contained', async predicate => {
    const scene = makeScene();
    scene.interaction[predicate].mockReturnValue(true);
    scene.interaction.isChatInputCommand.mockReturnValue(predicate === 'isCommand');
    const handler = { customId: 'test', execute: jest.fn().mockRejectedValue(new Error('handler failure')) };
    for (const collection of ['commands', 'buttons', 'selectMenus', 'modals']) scene.client[collection].set('test', handler);
    await expect(require('../events/commandDistributor').execute(scene.interaction, scene.client)).resolves.toBeUndefined();
    expect(handler.execute).toHaveBeenCalledTimes(1);
    expect([...console.error.mock.calls, ...console.log.mock.calls].flat().join(' ')).toContain('handler failure');
});
test('interactions outside a guild are ignored', async () => {
    const scene = makeScene();
    scene.interaction.inGuild.mockReturnValue(false);
    const handler = { execute: jest.fn() };
    scene.client.commands.set('test', handler);
    await require('../events/commandDistributor').execute(scene.interaction, scene.client);
    expect(handler.execute).not.toHaveBeenCalled();
});
test.each([
    'discord-blackjack-hitbtn', 'discord-blackjack-splitbtn', 'discord-blackjack-standbtn',
    'discord-blackjack-ddownbtn', 'discord-blackjack-cancelbtn',
    'pdm-bj-hit', 'pdm-bj-split', 'pdm-bj-stand', 'pdm-bj-double', 'pdm-bj-cancel',
    'A', 'B', 'C', 'D', 'overrideFalse', 'overrideTrue'
])('collector-owned button %s is not dispatched globally', async customId => {
    const scene = makeScene();
    scene.interaction.isButton.mockReturnValue(true);
    scene.interaction.customId = customId;
    const handler = { execute: jest.fn() };
    scene.client.buttons.set(customId, handler);
    await require('../events/commandDistributor').execute(scene.interaction, scene.client);
    expect(handler.execute).not.toHaveBeenCalled();
});
test('the gift-code confirmation select remains owned by its collector', async () => {
    const scene = makeScene();
    scene.interaction.isStringSelectMenu.mockReturnValue(true);
    scene.interaction.customId = 'singleUseCodeSelect';
    const handler = { execute: jest.fn() };
    scene.client.selectMenus.set('singleUseCodeSelect', handler);
    await require('../events/commandDistributor').execute(scene.interaction, scene.client);
    expect(handler.execute).not.toHaveBeenCalled();
});
test.each(['hello', 'pdm reload ? all', 'pdm eval ? 2 + 2', 'pdm ban ? 123'])('message routing dispatches only the matching developer command: %s', async content => {
    const scene = makeScene();
    scene.message.content = content;
    for (const name of ['currencyGiver', 'countingGame', 'reload', 'eval', 'ban']) scene.client.analogCommands.set(name, { execute: jest.fn().mockResolvedValue() });
    await require('../events/analogCreate').execute(scene.message, scene.client);
    for (const name of ['currencyGiver', 'countingGame']) expect(scene.client.analogCommands.get(name).execute).toHaveBeenCalledWith(scene.message, scene.client, expect.any(Object), expect.any(Object));
    for (const name of ['reload', 'eval', 'ban']) expect(scene.client.analogCommands.get(name).execute).toHaveBeenCalledTimes(content.includes(`pdm ${name}`) ? 1 : 0);
});
test('client readiness loads interactions before starting both scheduled jobs', async () => {
    const scene = makeScene();
    for (const name of ['Commands', 'Buttons', 'SelectMenus', 'Modals', 'AnalogCommands', 'CronJobs']) scene.client[`load${name}`] = jest.fn().mockResolvedValue();
    const reset = { execute: jest.fn().mockResolvedValue() }, runtime = { execute: jest.fn().mockResolvedValue() };
    scene.client.cronJobs.set('dailyReset', reset).set('dailyRuntime', runtime);
    await require('../events/loadInteractions').execute(scene.client);
    expect(reset.execute).toHaveBeenCalledWith(scene.client, expect.any(Object));
    expect(runtime.execute).toHaveBeenCalledWith(scene.client, expect.any(Object), expect.any(Object), expect.any(Object));
    expect(reset.execute.mock.invocationCallOrder[0]).toBeGreaterThan(scene.client.loadCronJobs.mock.invocationCallOrder[0]);
});
