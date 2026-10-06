const { installHandlerMocks, makeScene, replyData } = require('./helpers/handlerHarness');
installHandlerMocks();
let scene;
const initialAdmins = process.env.ADMIN_LIST;
beforeEach(() => {
    process.env.ADMIN_LIST = initialAdmins;
    scene = makeScene();
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, arrayBuffer: async () => Buffer.from('avatar') });
});
afterAll(() => { process.env.ADMIN_LIST = initialAdmins; });

test.each([true, false])('ping returns the gateway latency with guild context=%s', async guild => {
    if (!guild) { scene.interaction.guild = null; scene.user.accentColor = null; }
    await scene.execute('commands/ping.js');
    const embed = replyData(scene).embeds[0];
    expect(embed.title).toContain('Pong');
    expect(embed.fields[0].value).toBe('42ms');
    expect(embed.color).toBe(guild ? 0x123456 : 0xe6b04d);
});
test('coin conversion shows the total economy balance', async () => {
    await scene.execute('commands/coinConversion.js');
    expect(replyData(scene).embeds[0].description).toContain('2500');
    expect(scene.economy.getTotalCoinAmount).toHaveBeenCalled();
});
test.each([0, 3, 20])('leaderboard renders the highest balance first for %s users', async count => {
    scene.economy.getTopUsers.mockResolvedValue(Array.from({ length: count }, (_, index) => ({ id: String(index), value: { balance: index * 10 + 5 } })));
    await scene.execute('commands/coinLeaderboard.js');
    const fields = replyData(scene).embeds[0].fields || [];
    if (count) {
        expect(fields[0].value).toContain(`<@${count - 1}>`);
        expect(fields[0].value).toContain(`#1:`);
        expect(fields.length).toBeLessThanOrEqual(25);
    } else expect(fields).toEqual([]);
});
test('language menu exposes all six language choices', async () => {
    await scene.execute('commands/language.js');
    expect(replyData(scene).components.flatMap(row => row.components.map(button => button.custom_id))).toEqual(['de', 'en', 'fr', 'es', 'nl', 'pl']);
});
test('minigames menu offers guessing, blackjack and trivia', async () => {
    await scene.execute('commands/minigames.js');
    expect(replyData(scene).components[0].components.map(button => button.custom_id)).toEqual(['zahlenRaten', 'blackjack', 'trivia']);
});

test.each(['minigames', 'shop', 'redeem', 'serverManager'])('%s rejects a user without an account', async file => {
    scene.database.getObject.mockImplementation(async key => key === scene.user.id ? null : []);
    await scene.execute(`commands/${file}.js`);
    expect(scene.interaction.editReply).toHaveBeenCalledTimes(1);
    expect(scene.economy.addCoins).not.toHaveBeenCalled();
    expect(scene.panel.getAllServers).not.toHaveBeenCalled();
});

test.each([['addCoins', 'addCoins'], ['removeCoins', 'removeCoins']])('administrator %s updates the selected user', async (file, method) => {
    await scene.execute(`commands/${file}.js`);
    expect(scene.economy[method]).toHaveBeenCalledWith(scene.recipient.id, 10);
    expect(replyData(scene).embeds[0].description).toContain(`<@${scene.recipient.id}>`);
});
test.each(['addCoins', 'removeCoins', 'mailSwitcher', 'giftcodeManager', 'shopManager', 'setServerRuntime'])('%s denies a non-administrator without writes', async file => {
    process.env.ADMIN_LIST = '[]';
    await scene.execute(`commands/${file}.js`);
    expect(scene.t).toHaveBeenCalledWith('errors.no_admin_text');
    expect(scene.economy.addCoins).not.toHaveBeenCalled();
    expect(scene.economy.removeCoins).not.toHaveBeenCalled();
    expect(scene.database.changeUserMail).not.toHaveBeenCalled();
    expect(scene.panel.setServerRuntime).not.toHaveBeenCalled();
});
test.each(['addCoins', 'removeCoins', 'mailSwitcher'])('%s rejects a recipient without an account', async file => {
    scene.database.getObject.mockResolvedValue(null);
    await scene.execute(`commands/${file}.js`);
    expect(scene.economy.addCoins).not.toHaveBeenCalled();
    expect(scene.economy.removeCoins).not.toHaveBeenCalled();
    expect(scene.database.changeUserMail).not.toHaveBeenCalled();
});
test('mail change writes only the chosen local account', async () => {
    scene.options.mail = 'new@test.invalid';
    await scene.execute('commands/mailSwitcher.js');
    expect(scene.database.changeUserMail).toHaveBeenCalledWith(scene.recipient.id, 'new@test.invalid');
});

test.each(['self', 'recipient'])('balance renders an attachment for %s', async target => {
    scene.options.user = target === 'self' ? null : scene.recipient;
    await scene.execute('commands/balance.js');
    const payload = scene.interaction.editReply.mock.calls.at(-1)[0];
    expect(payload.files[0].name).toBe('canvas.png');
    expect(replyData(scene).embeds[0].image.url).toBe('attachment://canvas.png');
});
test.each(['self', 'recipient'])('balance rejects missing %s account data', async target => {
    scene.options.user = target === 'self' ? null : scene.recipient;
    scene.database.getObject.mockResolvedValue(null);
    await scene.execute('commands/balance.js');
    expect(scene.interaction.editReply.mock.calls.at(-1)[0].files).toBeUndefined();
    expect(scene.t).toHaveBeenCalledWith(target === 'self' ? 'coins.no_account_text' : 'coins.no_account_send_text');
});

test.each([true, false])('counting channel validates text support (%s)', async textBased => {
    scene.channel.isTextBased.mockReturnValue(textBased);
    await scene.execute('commands/countingChannel.js');
    if (textBased) {
        expect(scene.database.setObject).toHaveBeenCalledWith('countingChannel', scene.channel.id);
        expect(scene.channel.send).toHaveBeenCalledTimes(2);
    } else {
        expect(scene.database.setObject).not.toHaveBeenCalled();
        expect(scene.channel.send).not.toHaveBeenCalled();
    }
});

test.each([null, [], [{ type: 'server', data: { name: 'Small server', price: 20, description: 'Starter' } }]])('shop renders empty and populated inventories (%s)', async items => {
    scene.database.getObject.mockImplementation(async key => key === 'shop_items_servers' ? items : scene.userRecord);
    await scene.execute('commands/shop.js');
    const payload = replyData(scene);
    if (items?.length) {
        expect(payload.components[0].components[0].options[0].value).toBe('0');
        expect(payload.embeds[0].fields[0].value).toContain('20 Coins');
    } else expect(payload.embeds[0].fields[0].value).toBe('no_items_text');
});
test('shop management always offers creation and lists existing items', async () => {
    scene.database.getObject.mockImplementation(async key => key === 'shop_items_servers' ? [{ type: 'server', data: { name: 'Small server', price: 20, description: 'Starter' } }] : scene.userRecord);
    await scene.execute('commands/shopManager.js');
    expect(replyData(scene).components[0].components[0].options.map(option => option.value)).toEqual(['addShopItem', '0']);
});
test.each([0, 1, 30])('gift code management keeps %s codes within Discord component limits', async count => {
    scene.database.getObject.mockResolvedValue(Array.from({ length: count }, (_, index) => ({ code: `CODE${index}`, value: 10 })));
    await scene.execute('commands/giftcodeManager.js');
    const options = replyData(scene).components[0].components[0].options;
    expect(options[0].value).toBe('addCode');
    expect(options).toHaveLength(Math.min(count, 24) + 1);
});

test.each(['single', 'reusable', 'already-used', 'unknown'])('redemption handles %s codes', async mode => {
    const gift = { code: 'WELCOME', value: '50', singleUse: mode === 'single' ? 'true' : 'false', usedBy: mode === 'already-used' ? [scene.user.id] : [] };
    scene.database.getObject.mockImplementation(async key => key === 'gift_codes_list' ? [gift] : scene.userRecord);
    if (mode === 'unknown') scene.options.code = 'MISSING';
    await scene.execute('commands/redeem.js');
    if (['single', 'reusable'].includes(mode)) {
        expect(scene.economy.addCoins).toHaveBeenCalledWith(scene.user.id, 50);
        if (mode === 'single') expect(scene.gifts.deleteGiftCode).toHaveBeenCalledWith('WELCOME');
        else expect(scene.gifts.addUsed).toHaveBeenCalledWith(scene.user.id, 'WELCOME');
    } else {
        expect(scene.economy.addCoins).not.toHaveBeenCalled();
        expect(scene.gifts.deleteGiftCode).not.toHaveBeenCalled();
    }
});
test.each([0, -10, NaN, Infinity])('coin transfer rejects invalid amount %s before balance writes', async amount => {
    scene.options.amount = amount;
    await scene.execute('commands/coinTransfer.js');
    expect(scene.economy.removeCoins).not.toHaveBeenCalled();
    expect(scene.economy.addCoins).not.toHaveBeenCalled();
    expect(scene.economy.transferCoins).not.toHaveBeenCalled();
    expect(scene.t).toHaveBeenCalledWith('transfer_coins.lower_than_zero_text');
});
test.each(['sender', 'recipient'])('coin transfer rejects a missing %s account', async missing => {
    scene.database.getObject.mockImplementation(async id => id === (missing === 'sender' ? scene.user.id : scene.recipient.id) ? null : scene.userRecord);
    await scene.execute('commands/coinTransfer.js');
    expect(scene.recipient.send).not.toHaveBeenCalled();
    expect(scene.economy.transferCoins).not.toHaveBeenCalled();
});
test.each([false, true])('valid transfer conserves coins and tolerates blocked DMs (%s)', async blocked => {
    const balances = { [scene.user.id]: 1000, [scene.recipient.id]: 0 };
    scene.economy.removeCoins.mockImplementation(async (id, amount) => { balances[id] -= amount; });
    scene.economy.addCoins.mockImplementation(async (id, amount) => { balances[id] += amount; });
    scene.economy.transferCoins.mockImplementation(async (from, to, amount) => {
        balances[from] -= amount; balances[to] += amount; return { ok: true };
    });
    if (blocked) { scene.user.send.mockRejectedValue(new Error('DMs disabled')); scene.recipient.send.mockRejectedValue(new Error('DMs disabled')); }
    await scene.execute('commands/coinTransfer.js');
    expect(balances).toEqual({ [scene.user.id]: 990, [scene.recipient.id]: 10 });
    expect(replyData(scene).embeds[0].fields[0].name).toContain('10');
});

test.each([[], null])('server manager reports accounts with no servers (%s)', async servers => {
    scene.panel.getAllServers.mockResolvedValue(servers);
    await scene.execute('commands/serverManager.js');
    expect(scene.t).toHaveBeenCalledWith('server_manager.no_servers_text');
});
test.each(['suspension', 'deletion', 'error'])('server manager renders the %s runtime state', async type => {
    scene.panel.getServerRuntime.mockResolvedValue({ status: type !== 'error', type, data: { date_running_out: { date: '2026-02-01' }, deletion_date: { date: '2026-02-03' } } });
    await scene.execute('commands/serverManager.js');
    expect(replyData(scene).components[0].components[0].options[0].value).toBe('0');
});
test('runtime assignment rejects servers that are not owned by a local user', async () => {
    scene.options.uuid = 'server-uuid';
    scene.panel.getAccumulatedUserServers.mockResolvedValue([]);
    await scene.execute('commands/setServerRuntime.js');
    expect(scene.panel.setServerRuntime).not.toHaveBeenCalled();
    expect(scene.t).toHaveBeenCalledWith('override_runtime.error');
});
test('runtime assignment sets an unconfigured server immediately', async () => {
    scene.options.uuid = 'server-uuid';
    scene.panel.getAccumulatedUserServers.mockResolvedValue(['server-uuid']);
    scene.panel.getServerRuntime.mockResolvedValue({ status: false });
    await scene.execute('commands/setServerRuntime.js');
    expect(scene.panel.setServerRuntime).toHaveBeenCalledWith('server-uuid', 5, scene.user.id, 20);
});
test('an existing runtime requires a user-filtered confirmation', async () => {
    scene.options.uuid = 'server-uuid';
    scene.panel.getAccumulatedUserServers.mockResolvedValue(['server-uuid']);
    await scene.execute('commands/setServerRuntime.js');
    expect(scene.panel.setServerRuntime).not.toHaveBeenCalled();
    const buttons = replyData(scene).components[0].components.map(button => button.custom_id);
    expect(buttons).toEqual(['overrideTrue', 'overrideFalse']);
    expect(scene.collectors[0].options.filter({ user: { id: 'another-user' }, message: scene.message })).toBe(false);
});
