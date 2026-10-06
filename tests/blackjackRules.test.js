const { makeScene } = require('./helpers/handlerHarness');
const { playGame, handValue, handToString } = require('../lib/blackjackEngine');
const cards = ranks => ranks ? ranks.split(' ').map(rank => ({ rank, suit: '♠️' })) : [];

test.each([
    ['', 0], ['2 3 4', 9], ['J Q', 20], ['K A', 21], ['A 6', 17],
    ['A A 9', 21], ['A A A K', 13], ['A K K', 21], ['K Q 5', 25]
])('hand value accounts for face cards and flexible aces: %s', (ranks, total) => {
    expect(handValue(cards(ranks))).toBe(total);
});
test('hand display retains rank, suit, and card order', () => {
    expect(handToString([{ rank: 'A', suit: '♥️' }, { rank: '10', suit: '♣️' }])).toBe('A♥️ 10♣️');
});

// Control shuffle choices for a reproducible draw order using the real deck/shuffle.
function rigDraws(ranks) {
    const deck = ['♠️', '♥️', '♦️', '♣️'].flatMap(suit => ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'].map(rank => ({ rank, suit })));
    const choices = [];
    for (let index = 51; index > 0; index--) {
        const drawIndex = 51 - index;
        const target = drawIndex < ranks.length ? deck.findIndex((card, position) => position <= index && card.rank === ranks[drawIndex]) : index;
        if (target < 0) throw new Error(`Impossible test deck: ${ranks}`);
        choices.push((target + 0.5) / (index + 1));
        [deck[index], deck[target]] = [deck[target], deck[index]];
    }
    jest.spyOn(Math, 'random').mockImplementation(() => choices.shift() ?? 0.5);
}
async function begin(ranks, options = {}) {
    rigDraws(ranks);
    const scene = makeScene();
    const result = playGame(scene.interaction, { bet: 10, t: scene.t, ...options });
    for (let index = 0; index < 100; index++) await Promise.resolve();
    return { scene, result, collector: scene.collectors[0] };
}
async function act(game, action) {
    const interaction = makeScene().interaction;
    interaction.customId = `pdm-bj-${action}`;
    await game.collector.run('collect', interaction);
    return interaction;
}

test.each([
    [['K', 'Q', '10', '8'], 'WIN'], [['10', '8', 'K', 'Q'], 'LOSE'],
    [['K', '8', '10', '8'], 'PUSH'], [['K', 'Q', '10', '2', 'K'], 'WIN'],
    [['A', 'K', '10', '8'], 'WIN']
])('standing settles %j as %s and removes the controls', async (ranks, outcome) => {
    const game = await begin(ranks);
    expect(game.collector.options.filter({ user: game.scene.user })).toBe(true);
    expect(game.collector.options.filter({ user: game.scene.recipient })).toBe(false);
    const action = await act(game, 'stand');
    expect((await game.result).outcomes).toEqual([outcome]);
    expect(action.update.mock.calls[0][0].components).toEqual([]);
    expect(game.scene.message.edit.mock.calls[0][0].components).toEqual([]);
});
test.each([
    [['10', '8', 'A', 'K'], 'LOSE', false], [['A', 'Q', 'A', 'K'], 'PUSH', true]
])('a dealer natural settles immediately: %s', async (ranks, outcome, natural) => {
    const game = await begin(ranks);
    expect(await game.result).toMatchObject({ result: outcome, outcomes: [outcome], naturals: [natural], dealerNatural: true, multipliers: [1] });
    expect(game.collector).toBeUndefined();
});
test('hitting can improve the player hand before standing', async () => {
    const game = await begin(['4', '5', 'K', '8', 'K']);
    const action = await act(game, 'hit');
    expect(action.update.mock.calls[0][0].embeds[0].toJSON().fields[0].value).toContain('Total: 19');
    expect(game.collector.ended).toBe(false);
    await act(game, 'stand');
    expect((await game.result).result).toBe('WIN');
});
test('a player bust ends the hand as a loss', async () => {
    const game = await begin(['K', '9', 'K', '8', '5']);
    await act(game, 'hit');
    expect(game.collector.stop).toHaveBeenCalledWith('bust');
    expect((await game.result).outcomes).toEqual(['LOSE']);
});
test.each([['K', 'WIN'], ['2', 'LOSE']])('doubling draws one card and records double the stake: %s', async (draw, outcome) => {
    const game = await begin(['4', '5', 'K', '8', draw]);
    expect(game.scene.interaction.editReply.mock.calls[0][0].components[0].toJSON().components.map(button => button.custom_id)).toContain('pdm-bj-double');
    await act(game, 'double');
    expect(await game.result).toMatchObject({ outcomes: [outcome], multipliers: [2] });
});
test('splitting creates separately settled hands and advances through both', async () => {
    const game = await begin(['8', '8', 'K', '8', 'K', '2']);
    await act(game, 'split');
    await act(game, 'stand');
    expect(game.collector.ended).toBe(false);
    await act(game, 'stand');
    expect(await game.result).toMatchObject({ result: 'LOSE', outcomes: ['PUSH', 'LOSE'], multipliers: [1, 1], naturals: [false, false] });
});
test('a non-pair cannot split', async () => {
    const game = await begin(['8', '9', 'K', '8']);
    const action = await act(game, 'split');
    expect(action.reply).toHaveBeenCalledWith(expect.objectContaining({ content: 'split_not_allowed' }));
    await act(game, 'cancel');
    expect(await game.result).toEqual({ result: 'CANCEL' });
});
test('dealer hits soft 17 but stands on a hard 17', async () => {
    const soft = await begin(['K', '8', 'A', '6', '2']);
    await act(soft, 'stand');
    expect((await soft.result).dealer.split(' ')).toHaveLength(3);
    expect((await soft.result).result).toBe('LOSE');
    Math.random.mockRestore();
    const hard = await begin(['K', '8', 'K', '7']);
    await act(hard, 'stand');
    expect((await hard.result).dealer.split(' ')).toHaveLength(2);
});
test('timeout settles the current hand and clears its controls', async () => {
    const game = await begin(['K', '8', 'K', '7']);
    await game.collector.run('end', game.collector.collected, 'time');
    expect((await game.result).result).toBe('WIN');
    expect(game.scene.message.edit.mock.calls[0][0].components).toEqual([]);
});
test.each([undefined, async () => null, async () => { throw new Error('Missing translation'); }])('unavailable translations use usable English labels', async t => {
    const game = await begin(['K', '8', 'K', '7'], { t });
    const payload = game.scene.interaction.editReply.mock.calls[0][0];
    expect(payload.embeds[0].toJSON().title).toContain('Blackjack');
    expect(payload.components[0].toJSON().components[0].label).toContain('Hit');
    await act(game, 'stand');
    expect((await game.result).result).toBe('WIN');
});
test('a Discord update failure is contained and the game still settles', async () => {
    const game = await begin(['4', '5', 'K', '8', 'K']);
    const action = makeScene().interaction;
    action.customId = 'pdm-bj-hit';
    action.update.mockRejectedValue(new Error('Message removed'));
    await game.collector.run('collect', action);
    expect(game.collector.stop).toHaveBeenCalledWith('error');
    expect((await game.result).result).toBe('WIN');
});
