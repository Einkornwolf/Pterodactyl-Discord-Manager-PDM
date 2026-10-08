const { EventEmitter } = require('node:events');
const { onAsync } = require('../classes/collectorEvents');
test('collector handler rejections are caught and reported to the user', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
        const collector = new EventEmitter();
        const interaction = { isRepliable: () => true, reply: jest.fn().mockResolvedValue() };
        onAsync(collector, 'collect', async () => { throw new Error('test failure'); });
        collector.emit('collect', interaction);
        await new Promise(setImmediate);
        expect(error).toHaveBeenCalled();
        expect(interaction.reply).toHaveBeenCalledTimes(1);
    } finally { error.mockRestore(); }
});
