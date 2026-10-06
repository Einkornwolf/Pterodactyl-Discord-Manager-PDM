const { Collection } = require('discord.js');
const { installHandlerMocks, makeScene, replyData } = require('./helpers/handlerHarness');
installHandlerMocks();
jest.mock('../lib/blackjackEngine', () => ({ playGame: jest.fn() }));
const question = { category: 'Science', tags: ['test'], question: 'What is two plus two?', difficulty: 'easy', incorrectAnswers: ['one', 'two', 'three'], correctAnswer: 'four' };
let scene;
beforeEach(() => {
    scene = makeScene();
    jest.spyOn(Math, 'random').mockReturnValue(0.999);
    require('undici').request.mockResolvedValue({ body: { json: async () => [question] } });
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => [question] });
});
async function collectBet(file, content = '10') {
    await scene.execute(file);
    expect(scene.collectors[0].options.filter({ author: scene.user })).toBe(true);
    expect(scene.collectors[0].options.filter({ author: scene.recipient })).toBe(false);
    const message = { ...scene.message, content };
    await scene.collectors[0].run('collect', message);
}

test('trivia launcher offers all three difficulties', async () => {
    await scene.execute('buttons/minigames/triviaLauncher.js');
    expect(replyData(scene).components[0].components.map(button => button.custom_id)).toEqual(['triviaPlayerEasy', 'triviaPlayerMedium', 'triviaPlayerHard']);
});
test.each([
    ['Easy', 1.25], ['Medium', 1.5], ['Hard', 2]
])('trivia %s pays the correct reward and counts the daily amount', async (mode, factor) => {
    await collectBet(`buttons/minigames/triviaPlayer/triviaPlayer${mode}.js`);
    const questionPayload = replyData(scene);
    expect(questionPayload.embeds[0].fields.find(field => field.name.includes('question_text')).value).toContain(question.question);
    expect(questionPayload.components[0].components.map(button => button.custom_id)).toEqual(['A', 'B', 'C', 'D']);
    const answer = makeScene().interaction;
    answer.customId = 'D';
    expect(scene.collectors[1].options.filter({ user: scene.recipient })).toBe(false);
    await scene.collectors[1].run('collect', answer);
    expect(scene.economy.addCoins).toHaveBeenCalledWith(scene.user.id, (factor - 1) * 10);
    expect(scene.economy.addDailyAmount).toHaveBeenCalledWith(scene.user.id, factor * 10);
    expect(answer.editReply.mock.calls[0][0].components).toEqual([]);
});
test('a wrong trivia answer charges the stake and reveals the right answer', async () => {
    await collectBet('buttons/minigames/triviaPlayer/triviaPlayerEasy.js');
    const answer = makeScene().interaction;
    answer.customId = 'A';
    await scene.collectors[1].run('collect', answer);
    expect(scene.economy.removeCoins).toHaveBeenCalledWith(scene.user.id, 10);
    expect(scene.economy.addCoins).not.toHaveBeenCalled();
    expect(answer.editReply.mock.calls[0][0].embeds[0].toJSON().fields[0].value).toContain('four');
});
test('expired trivia clears controls without changing balances', async () => {
    await collectBet('buttons/minigames/triviaPlayer/triviaPlayerEasy.js');
    await scene.collectors[1].run('end', new Collection(), 'time');
    expect(scene.t).toHaveBeenCalledWith('trivia.expired');
    expect(replyData(scene).components).toEqual([]);
    expect(scene.economy.removeCoins).not.toHaveBeenCalled();
    expect(scene.economy.addCoins).not.toHaveBeenCalled();
});
test('a completed trivia collector does not overwrite the answer with a timeout', async () => {
    await collectBet('buttons/minigames/triviaPlayer/triviaPlayerEasy.js');
    const replies = scene.interaction.editReply.mock.calls.length;
    await scene.collectors[1].run('end', new Collection([['answer', {}]]), 'limit');
    expect(scene.interaction.editReply).toHaveBeenCalledTimes(replies);
});

test.each(['buttons/minigames/blackjack.js', 'buttons/minigames/zahlenRaten.js', 'buttons/minigames/triviaPlayer/triviaPlayerEasy.js'])('%s rejects nonpositive and nonnumeric bets', async file => {
    for (const bet of ['abc', '0', '-1']) {
        scene = makeScene();
        await collectBet(file, bet);
        expect(scene.economy.removeCoins).not.toHaveBeenCalled();
        expect(scene.economy.addCoins).not.toHaveBeenCalled();
        expect(scene.collectors).toHaveLength(1);
    }
});
test.each(['buttons/minigames/blackjack.js', 'buttons/minigames/zahlenRaten.js', 'buttons/minigames/triviaPlayer/triviaPlayerEasy.js'])('%s enforces balance and daily limits before starting', async file => {
    for (const [balance, daily] of [[1, 0], [1000, 300], [1000, 299]]) {
        scene = makeScene();
        scene.economy.getUserBalance.mockResolvedValue(balance);
        scene.economy.getUserDaily.mockResolvedValue(daily);
        await collectBet(file);
        expect(scene.economy.removeCoins).not.toHaveBeenCalled();
        expect(scene.collectors).toHaveLength(1);
    }
});
test.each(['buttons/minigames/blackjack.js', 'buttons/minigames/zahlenRaten.js'])('%s enforces the maximum 150-coin stake', async file => {
    await collectBet(file, '151');
    expect(scene.economy.removeCoins).not.toHaveBeenCalled();
});
test.each([
    [['WIN'], [1], [false], 20, 10],
    [['WIN'], [1], [true], 25, 15],
    [['PUSH'], [1], [false], 10, 0],
    [['LOSE'], [1], [false], 0, 0],
    [['WIN'], [2], [false], 40, 20],
    [['WIN', 'LOSE'], [1, 1], [false, false], 20, 0]
])('blackjack settles %j at multipliers %j', async (outcomes, multipliers, naturals, payout, profit) => {
    require('../lib/blackjackEngine').playGame.mockResolvedValue({ result: outcomes[0], outcomes, multipliers, naturals, dealerNatural: false });
    await collectBet('buttons/minigames/blackjack.js');
    const stake = multipliers.reduce((sum, value) => sum + 10 * value, 0);
    expect(scene.economy.removeCoins.mock.calls.reduce((sum, call) => sum + call[1], 0)).toBe(stake);
    expect(scene.economy.addCoins.mock.calls.reduce((sum, call) => sum + call[1], 0)).toBe(payout);
    if (payout) expect(scene.economy.addDailyAmount).toHaveBeenCalledWith(scene.user.id, profit);
    expect(scene.interaction.followUp.mock.calls[0][0].components[0].toJSON().components[0].custom_id).toBe('blackjack');
    expect(scene.t).not.toHaveBeenCalledWith('minigames.result_error');
});
test('blackjack cancellation refunds the original stake', async () => {
    require('../lib/blackjackEngine').playGame.mockResolvedValue({ result: 'CANCEL' });
    await collectBet('buttons/minigames/blackjack.js');
    expect(scene.economy.removeCoins).toHaveBeenCalledWith(scene.user.id, 10);
    expect(scene.economy.addCoins).toHaveBeenCalledWith(scene.user.id, 10);
    expect(scene.economy.addDailyAmount).not.toHaveBeenCalled();
});
test('a blackjack engine error is reported to the player', async () => {
    require('../lib/blackjackEngine').playGame.mockRejectedValue(new Error('Game unavailable'));
    await collectBet('buttons/minigames/blackjack.js');
    expect(scene.t).toHaveBeenCalledWith('minigames.result_error');
    expect(scene.log.logString).toHaveBeenCalledWith(expect.stringContaining('Game unavailable'));
});

test.each([0, 2, 5])('a correct numeric guess %s wins twice the stake', async guess => {
    Math.random.mockReturnValue((guess + 0.1) / 6);
    await collectBet('buttons/minigames/zahlenRaten.js');
    await scene.collectors[1].run('collect', { ...scene.message, content: String(guess) });
    expect(scene.economy.removeCoins).toHaveBeenCalledWith(scene.user.id, 10);
    expect(scene.economy.addCoins).toHaveBeenCalledWith(scene.user.id, 20);
    expect(scene.economy.addDailyAmount).toHaveBeenCalledWith(scene.user.id, 20);
});
test.each(['abc', '', ' ', '-1', '6', '2.5', '2'])('an invalid or incorrect guess %s loses only the stake', async guess => {
    Math.random.mockReturnValue(0);
    await collectBet('buttons/minigames/zahlenRaten.js');
    await scene.collectors[1].run('collect', { ...scene.message, content: guess });
    expect(scene.economy.removeCoins).toHaveBeenCalledTimes(1);
    expect(scene.economy.addCoins).not.toHaveBeenCalled();
    expect(scene.t).toHaveBeenCalledWith('minigames_events.guess_the_number_loose_text');
});
test('simultaneous number games retain their own winning numbers', async () => {
    Math.random.mockReturnValue(0);
    await collectBet('buttons/minigames/zahlenRaten.js');
    const first = scene;
    scene = makeScene();
    Math.random.mockReturnValue(0.999);
    await collectBet('buttons/minigames/zahlenRaten.js');
    await first.collectors[1].run('collect', { ...first.message, content: '0' });
    await scene.collectors[1].run('collect', { ...scene.message, content: '5' });
    expect(first.economy.addCoins).toHaveBeenCalledWith(first.user.id, 20);
    expect(scene.economy.addCoins).toHaveBeenCalledWith(scene.user.id, 20);
});
