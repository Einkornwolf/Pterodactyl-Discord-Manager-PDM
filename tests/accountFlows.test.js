const { installHandlerMocks, makeScene, replyData } = require('./helpers/handlerHarness');
installHandlerMocks();
test.each([true, false])('account overview renders an existing or unregistered account: %s', async exists => {
    const overview = makeScene();
    if (!exists) overview.database.getObject.mockResolvedValue(null);
    await overview.execute('commands/accountManager.js');
    const payload = replyData(overview);
    expect(payload.components[0].components[0].options).toHaveLength(5);
    expect(payload.embeds[0].fields[1].value).toContain(exists ? 'user@test.invalid' : 'no_account');
    expect(payload.embeds[0].fields[3].value).toContain(exists ? '1000' : '0');
});
const { TranslationManager } = require('../classes/translationManager');
let scene;
beforeEach(() => { scene = makeScene(); });

test.each(['createAccount', 'deleteAccount', 'resetPassword', 'claimBoosterReward', 'linkAccount'])('account selector dispatches %s with all dependencies', async selection => {
    const target = { execute: jest.fn().mockResolvedValue() };
    scene.client.selectMenus.set(selection, target);
    scene.interaction.values = [selection];
    await scene.execute('select/accountManager/accountSelect.js');
    expect(target.execute).toHaveBeenCalledWith(...scene.args());
});
test('an unknown account selection has no side effects', async () => {
    scene.interaction.values = ['unknown'];
    await scene.execute('select/accountManager/accountSelect.js');
    expect(scene.interaction.reply).not.toHaveBeenCalled();
});

test.each([['createAccount', 'creationModal', ['usereMail', 'userName']], ['linkAccount', 'linkModal', ['userAPI']]])('%s opens the correct form for a new user', async (file, id, fields) => {
    scene.database.getObject.mockResolvedValue(null);
    await scene.execute(`select/accountManager/${file}.js`);
    const modal = scene.interaction.showModal.mock.calls[0][0].toJSON();
    expect(modal.custom_id).toBe(id);
    expect(modal.components.map(row => row.components[0].custom_id)).toEqual(fields);
});
test.each(['createAccount', 'linkAccount'])('%s rejects a user with an existing account', async file => {
    await scene.execute(`select/accountManager/${file}.js`);
    expect(scene.interaction.showModal).not.toHaveBeenCalled();
    expect(replyData(scene).embeds[0].description).toContain('already_has_account_text');
});

test('password reset changes the panel account and replies privately with its new password', async () => {
    await scene.execute('select/accountManager/resetPassword.js');
    expect(scene.panel.resetUserPassword).toHaveBeenCalledWith(scene.userRecord.e_mail);
    expect(replyData(scene).embeds[0].description).toContain('new-password');
    expect(scene.interaction.deferReply).toHaveBeenCalledWith({ flags: 64 });
});
test.each(['resetPassword', 'deleteAccount', 'claimBoosterReward'])('%s rejects a missing account', async file => {
    scene.database.getObject.mockResolvedValue(null);
    await scene.execute(`select/accountManager/${file}.js`);
    expect(scene.panel.resetUserPassword).not.toHaveBeenCalled();
    expect(scene.panel.deleteAllServers).not.toHaveBeenCalled();
    expect(scene.economy.addCoins).not.toHaveBeenCalled();
    expect(scene.interaction.editReply).toHaveBeenCalledTimes(1);
});
test.each(['delete', 'cancel'])('account deletion requires the literal confirmation (%s)', async confirmation => {
    await scene.execute('select/accountManager/deleteAccount.js');
    const collector = scene.collectors[0];
    expect(collector.options.filter({ author: { id: 'another-user' } })).toBe(false);
    expect(collector.options.filter({ author: scene.user })).toBe(true);
    await collector.run('collect', { content: confirmation, delete: jest.fn().mockResolvedValue() });
    if (confirmation === 'delete') {
        expect(scene.panel.deleteAllServers).toHaveBeenCalledWith(scene.userRecord.e_mail);
        expect(scene.database.deleteUser).toHaveBeenCalledWith(scene.user.id);
        expect(scene.panel.removeUser).toHaveBeenCalledWith(scene.userRecord.e_mail);
    } else {
        expect(scene.database.deleteUser).not.toHaveBeenCalled();
        expect(replyData(scene).embeds[0].description).toContain('deletion_fail_text');
    }
});
test('a valid booster receives the reward only after eligibility checks', async () => {
    await scene.execute('select/accountManager/claimBoosterReward.js');
    expect(scene.economy.addCoins).toHaveBeenCalledWith(scene.user.id, 150);
    expect(scene.boosters.setBoosterStatus).toHaveBeenCalledWith(scene.user.id, true);
});
test.each(['not-a-booster', 'already-claimed'])('booster rewards reject %s', async reason => {
    if (reason === 'not-a-booster') scene.interaction.member.premiumSince = undefined;
    else scene.boosters.getBoosterStatus.mockResolvedValue(true);
    await scene.execute('select/accountManager/claimBoosterReward.js');
    expect(scene.economy.addCoins).not.toHaveBeenCalled();
    expect(scene.boosters.setBoosterStatus).not.toHaveBeenCalled();
});

test('account creation uses submitted credentials and returns a private panel link', async () => {
    await scene.execute('modals/creationModal.js');
    expect(scene.panel.addUser).toHaveBeenCalledWith('user@test.invalid', 'TestUser', 'TestUser', 'TestUser');
    expect(scene.database.setUser).toHaveBeenCalledWith(scene.user.id, 'user@test.invalid', 'TestUser');
    expect(replyData(scene).embeds[0].fields[0].value).toContain('new-password');
    expect(replyData(scene).embeds[0].url).toBe('https://panel.test');
});
test('a rejected panel creation rolls back the local account', async () => {
    scene.panel.addUser.mockRejectedValue({ response: { status: 422 } });
    await scene.execute('modals/creationModal.js');
    expect(scene.database.deleteUser).toHaveBeenCalledWith(scene.user.id);
    expect(replyData(scene).embeds[0].description).toContain('account_creation_fail_text');
});
test('linking a verified panel account stores its identity', async () => {
    await scene.execute('modals/linkModal.js');
    expect(scene.panel.getUserEmailFromAPIKey).toHaveBeenCalledWith('test-key');
    expect(scene.database.setUser).toHaveBeenCalledWith(scene.user.id, 'user@test.invalid', 'TestUser');
    expect(replyData(scene).embeds[0].description).toContain('link_success');
});
test.each(['invalid-key', 'missing-name', 'already-linked'])('linking rejects %s without creating an account', async failure => {
    if (failure === 'invalid-key') scene.panel.getUserEmailFromAPIKey.mockResolvedValue(null);
    if (failure === 'missing-name') scene.panel.checkAccount.mockResolvedValue({ attributes: { username: null } });
    if (failure === 'already-linked') scene.panel.checkLocalAccount.mockResolvedValue(true);
    await scene.execute('modals/linkModal.js');
    expect(scene.database.setUser).not.toHaveBeenCalled();
    expect(replyData(scene).embeds[0].description).toContain('account_link_fail_text');
});

test.each([['de', 'de-DE'], ['en', 'en-US'], ['es', 'es-ES'], ['fr', 'fr-FR'], ['nl', 'nl-NL'], ['pl', 'pl-PL']])('language button %s stores %s', async (button, language) => {
    await scene.execute(`buttons/language/${button}.js`);
    const translation = TranslationManager.mock.results.at(-1).value;
    expect(TranslationManager).toHaveBeenLastCalledWith(scene.user.id);
    expect(translation.saveUserLanguage).toHaveBeenCalledWith(language);
    expect(replyData(scene).embeds[0].description).toContain(language);
});
