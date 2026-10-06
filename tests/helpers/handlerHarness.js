const { Collection } = require('discord.js');

function installHandlerMocks() {
    jest.doMock('../../classes/dataBaseInterface', () => ({
        DataBaseInterface: require('./memoryDatabase').MemoryDatabase
    }));
    jest.doMock('../../classes/translationManager', () => ({
        TranslationManager: jest.fn().mockImplementation(() => ({
            getTranslation: jest.fn(async key => key.split('.').at(-1).slice(0, 35)),
            saveUserLanguage: jest.fn().mockResolvedValue(),
            deleteUserLanguage: jest.fn().mockResolvedValue(),
            getUserLanguage: jest.fn().mockResolvedValue('en-US')
        }))
    }));
    jest.doMock('@napi-rs/canvas', () => {
        const context = {
            fillRect: jest.fn(), strokeRect: jest.fn(), fillText: jest.fn(), drawImage: jest.fn(),
            beginPath: jest.fn(), closePath: jest.fn(), arc: jest.fn(), clip: jest.fn(), save: jest.fn(), restore: jest.fn(),
            moveTo: jest.fn(), lineTo: jest.fn(), stroke: jest.fn(), fill: jest.fn(),
            measureText: jest.fn(text => ({ width: String(text).length * 5 })),
            createLinearGradient: jest.fn(() => ({ addColorStop: jest.fn() }))
        };
        return {
            createCanvas: jest.fn((width, height) => ({ width, height, getContext: () => context, toBuffer: () => Buffer.from('test-image') })),
            loadImage: jest.fn().mockResolvedValue({ width: 100, height: 100 })
        };
    });
    jest.doMock('undici', () => ({
        request: jest.fn().mockResolvedValue({ body: { arrayBuffer: async () => Buffer.from('avatar') } })
    }));
}

function makeCollector(options = {}) {
    const callbacks = new Map();
    const collector = {
        options, callbacks, collected: new Collection(), ended: false,
        on: jest.fn((name, callback) => {
            const listeners = callbacks.get(name) || [];
            listeners.push(callback);
            callbacks.set(name, listeners);
            return collector;
        }),
        async run(name, ...args) {
            for (const callback of callbacks.get(name) || []) await callback(...args);
            // Some production listeners dispatch a caught promise without returning it.
            for (let index = 0; index < 30; index++) await Promise.resolve();
        },
        stop: jest.fn(reason => {
            collector.ended = true;
            collector.completion = collector.run('end', collector.collected, reason);
            return collector.completion;
        })
    };
    return collector;
}

function makeUser(id = '111111111111111111') {
    const user = {
        id, tag: 'TestUser#0001', username: 'TestUser', bot: false, accentColor: 0x123456,
        displayAvatarURL: jest.fn(() => 'https://example.test/avatar.png'), avatarURL: jest.fn(() => 'https://example.test/avatar.png'),
        send: jest.fn().mockResolvedValue(), fetch: jest.fn()
    };
    user.fetch.mockResolvedValue(user);
    return user;
}

function makeScene() {
    const collectors = [];
    const user = makeUser();
    const recipient = makeUser('333333333333333333');
    const channel = {
        id: '444444444444444444', name: 'test-channel', isTextBased: jest.fn(() => true), send: jest.fn(), messages: { fetch: jest.fn().mockResolvedValue(new Collection()) },
        createMessageCollector: jest.fn(options => {
            const collector = makeCollector(options); collectors.push(collector); return collector;
        }),
        createMessageComponentCollector: jest.fn(options => {
            const collector = makeCollector(options); collectors.push(collector); return collector;
        })
    };
    const message = {
        id: '555555555555555555', author: user, content: 'delete', channel, guildId: process.env.BOT_SINGLE_SERVER_ID,
        inGuild: jest.fn(() => true), channelId: channel.id,
        delete: jest.fn().mockResolvedValue(), edit: jest.fn().mockResolvedValue(), react: jest.fn().mockResolvedValue(),
        embeds: [{ fields: Array.from({ length: 12 }, (_, index) => ({ name: `Field ${index}`, value: '```js\nserver-uuid```' })) }],
        components: [],
        createMessageComponentCollector: jest.fn(options => {
            const collector = makeCollector(options); collectors.push(collector); return collector;
        })
    };
    message.embeds[0].title = 'Server #0';
    message.embeds[0].footer = { text: '1' };
    message.embeds[0].data = { fields: message.embeds[0].fields, title: 'Server #0', footer: { text: '1' } };
    channel.send.mockResolvedValue(message);
    const client = {
        user: makeUser('666666666666666666'), ws: { ping: 42 }, channels: { fetch: jest.fn().mockResolvedValue(channel), cache: new Collection([[channel.id, channel]]) },
        users: { fetch: jest.fn().mockResolvedValue(user), cache: new Collection([[user.id, user]]) },
        commands: new Collection(), buttons: new Collection(), selectMenus: new Collection(), modals: new Collection(),
        events: new Collection(), analogCommands: new Collection(), cronJobs: new Collection()
    };
    const options = { amount: 10, user: recipient, message: 'Thanks', code: 'WELCOME', runtime: 5, price: 20, identifier: 'short', channel };
    const inputs = { usereMail: 'user@test.invalid', userName: 'TestUser', userAPI: 'test-key', serverRenameText: 'New server name' };
    const guild = { id: process.env.BOT_SINGLE_SERVER_ID, iconURL: jest.fn(() => 'https://example.test/guild.png'), members: { fetch: jest.fn().mockResolvedValue({ user }) } };
    const interaction = {
        user, client, guild, guildId: guild.id, channel, message, member: { user, premiumSince: new Date('2026-01-01') },
        values: ['short'], customId: 'test', commandName: 'test', deferred: false, replied: false,
        options: Object.fromEntries(['getUser', 'getString', 'getNumber', 'getInteger', 'getChannel', 'getBoolean'].map(method => [method, jest.fn(name => options[name] ?? null)])),
        fields: { getTextInputValue: jest.fn(name => inputs[name] ?? '10') },
        inGuild: jest.fn(() => true), isCommand: jest.fn(() => false), isChatInputCommand: jest.fn(() => false),
        isButton: jest.fn(() => false), isStringSelectMenu: jest.fn(() => false), isModalSubmit: jest.fn(() => false),
        deferReply: jest.fn().mockResolvedValue(), deferUpdate: jest.fn().mockResolvedValue(),
        reply: jest.fn().mockResolvedValue(message), editReply: jest.fn().mockResolvedValue(message),
        update: jest.fn().mockResolvedValue(message), fetchReply: jest.fn().mockResolvedValue(message),
        deleteReply: jest.fn().mockResolvedValue(), followUp: jest.fn().mockResolvedValue(message), showModal: jest.fn().mockResolvedValue()
    };
    const userRecord = { e_mail: 'user@test.invalid', name: 'TestUser', balance: 1000, daily: 0, booster: false };
    const server = { attributes: {
        id: 7, uuid: 'server-uuid', identifier: 'short', name: 'Test server', description: 'Test server', suspended: false,
        node: 2, allocation: 11, egg: 5, user: 7, created_at: '2026-01-01', updated_at: '2026-01-02',
        limits: { memory: 1024, disk: 2048, cpu: 100, swap: 0, io: 500 },
        container: { image: 'image:test', startup_command: 'start', environment: { P_SERVER_LOCATION: 'test-location' } }
    } };
    const database = Object.fromEntries(['getObject', 'setUser', 'deleteUser', 'changeUserMail', 'setUserValue', 'setObject', 'deleteObject', 'setShop', 'addShopItem', 'removeShopItem', 'fetchAll'].map(method => [method, jest.fn().mockResolvedValue()]));
    database.getObject.mockImplementation(async key => {
        if (key === 'gift_codes_list') return [{ code: 'WELCOME', value: '50', singleUse: 'false', usedBy: [] }];
        if (key === 'shop_items_servers') return [];
        return { ...userRecord };
    });
    database.fetchAll.mockResolvedValue([{ id: user.id, value: { ...userRecord } }]);
    const panel = Object.fromEntries([
        'checkAccount', 'addUser', 'removeUser', 'resetUserPassword', 'getPanelNodes', 'getNestData', 'getEggData', 'createServer',
        'deleteServer', 'getAllServers', 'getInstallStatus', 'liveServerRessourceUsage', 'getServerInfo', 'powerEventServer',
        'reinstallServer', 'renameServer', 'getServerId', 'getServerIdentifier', 'suspendServer', 'unSuspendServer',
        'setServerRuntime', 'setRuntimeList', 'getRuntimeList', 'removeServerSuspensionList', 'addServerDeletion',
        'setDeletionList', 'getDeletionList', 'removeServerDeletionList', 'getServerRuntime', 'extendRuntime',
        'deleteAllServers', 'getAccumulatedUserServers', 'getUserIDfromUUID', 'getUserEmailFromAPIKey', 'checkLocalAccount'
    ].map(method => [method, jest.fn().mockResolvedValue()]));
    panel.checkAccount.mockResolvedValue({ attributes: { id: 7, username: 'TestUser', email: userRecord.e_mail } });
    panel.addUser.mockResolvedValue({ config: { data: JSON.stringify({ password: 'new-password' }) } });
    panel.resetUserPassword.mockResolvedValue({ passkey: 'new-password' });
    panel.getAllServers.mockResolvedValue([server]);
    panel.getServerInfo.mockResolvedValue(server);
    panel.getServerId.mockResolvedValue(7);
    panel.getServerIdentifier.mockResolvedValue('short');
    panel.getInstallStatus.mockResolvedValue(true);
    panel.getUserEmailFromAPIKey.mockResolvedValue(userRecord.e_mail);
    panel.checkLocalAccount.mockResolvedValue(false);
    panel.getUserIDfromUUID.mockResolvedValue(user.id);
    panel.getRuntimeList.mockResolvedValue([]);
    panel.getDeletionList.mockResolvedValue([]);
    panel.getServerRuntime.mockResolvedValue({ status: true, type: 'suspension', data: { user_id: user.id, uuid: 'server-uuid', price: 20, runtime: 5, date_running_out: { date: '2026-02-01' } } });
    panel.liveServerRessourceUsage.mockResolvedValue({ attributes: { current_state: 'running', resources: { memory_bytes: 512 * 1024 * 1024, disk_bytes: 1024 * 1024 * 1024, cpu_absolute: 50, uptime: 120000, network_rx_bytes: 100, network_tx_bytes: 200 } } });
    const economy = Object.fromEntries(['addCoins', 'setCoins', 'removeCoins', 'getUserBalance', 'getTotalCoinAmount', 'getTopUsers', 'addDailyAmount', 'setDailyAmount', 'removeDailyAmount', 'getUserDaily', 'resetAllDailyAmounts', 'transferCoins'].map(method => [method, jest.fn().mockResolvedValue()]));
    economy.getUserBalance.mockResolvedValue(1000);
    economy.getUserDaily.mockResolvedValue(0);
    economy.getTotalCoinAmount.mockResolvedValue(2500);
    economy.getTopUsers.mockResolvedValue([{ id: user.id, value: userRecord }]);
    economy.transferCoins.mockResolvedValue({ ok: true, amount: 10 });
    const cache = { cacheData: jest.fn().mockResolvedValue(), getCachedData: jest.fn().mockResolvedValue({}), clearCache: jest.fn().mockResolvedValue() };
    const boosters = { getBoosterStatus: jest.fn().mockResolvedValue(false), setBoosterStatus: jest.fn().mockResolvedValue() };
    const log = { logString: jest.fn().mockResolvedValue() };
    const gifts = { createGiftCode: jest.fn().mockResolvedValue(), deleteGiftCode: jest.fn().mockResolvedValue(true), addUsed: jest.fn().mockResolvedValue() };
    const emoji = { getEmoji: jest.fn().mockResolvedValue('✅'), parseEmoji: jest.fn(value => value) };
    const t = jest.fn(async key => key.split('.').at(-1).slice(0, 35));
    const scene = { interaction, client, panel, boosters, cache, economy, log, database, t, gifts, emoji, user, recipient, channel, message, collectors, options, inputs, userRecord, server };
    scene.args = () => [scene.interaction, scene.client, scene.panel, scene.boosters, scene.cache, scene.economy, scene.log, scene.database, scene.t, scene.gifts, scene.emoji];
    scene.execute = (file, ...extra) => require(`../../${file}`).execute(...scene.args(), ...extra);
    return scene;
}

function replyData(scene) {
    const payload = scene.interaction.editReply.mock.calls.at(-1)?.[0] || scene.interaction.reply.mock.calls.at(-1)?.[0] || scene.interaction.update.mock.calls.at(-1)?.[0];
    return { ...payload, embeds: payload?.embeds?.map(embed => embed.toJSON()), components: payload?.components?.map(component => component.toJSON()) };
}

module.exports = { installHandlerMocks, makeScene, makeCollector, makeUser, replyData };
