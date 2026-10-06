const { installHandlerMocks } = require('./helpers/handlerHarness');
installHandlerMocks();
const { SeasonPassManager } = require('../classes/seasonpassmanager');
afterEach(() => jest.useRealTimers());

test.each([
    [0, 'xp', 50], [0.299, 'xp', 50], [0.3, 'coins', 25], [0.999, 'coins', 25]
])('season rewards follow the XP/coin boundary at %s and scale with level', async (chance, type, amount) => {
    jest.spyOn(Math, 'random').mockReturnValueOnce(chance).mockReturnValueOnce(0.5);
    expect(await new SeasonPassManager().generateRandomSeasonPassItem(2, 5)).toEqual([{ type, amount }]);
});
test('zero-level rewards stay at zero', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.9);
    expect(await new SeasonPassManager().generateRandomSeasonPassItem(2, 0)).toEqual([{ type: 'coins', amount: 0 }]);
});
test('season generation creates dated daily rewards and defaults to 30 days', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-02-01T00:00:00Z'));
    jest.spyOn(Math, 'random').mockReturnValue(0);
    const manager = new SeasonPassManager();
    jest.spyOn(manager, 'generateRandomSeasonPassItem').mockResolvedValue([{ type: 'xp', amount: 10 }]);
    const season = await manager.generateSeasonPass();
    expect(season).toHaveLength(30);
    expect(season[0]).toEqual({ date: Date.now(), items: [{ type: 'xp', amount: 10 }] });
    expect(season[29].date - season[0].date).toBe(29 * 86400000);
    expect(manager.generateRandomSeasonPassItem).toHaveBeenNthCalledWith(30, 1, 29);
    expect(await manager.generateSeasonPass(2)).toHaveLength(2);
    expect(await manager.generateSeasonPass(0)).toEqual([]);
});
test('reward images render the selected icon and reward amount', async () => {
    const Canvas = require('@napi-rs/canvas');
    const image = await new SeasonPassManager().generateSeasonPassImage('coins', 25);
    expect(Buffer.isBuffer(image)).toBe(true);
    expect(Canvas.createCanvas).toHaveBeenCalledWith(50, 150);
    expect(Canvas.loadImage).toHaveBeenCalledWith('files/coins.png');
    expect(Canvas.createCanvas.mock.results[0].value.getContext().fillText).toHaveBeenCalledWith('25', 25, 75);
});

// These methods are empty production TODOs, with no behavior to assert yet.
test.todo('define and implement season-pass XP persistence and level-completion behavior');
