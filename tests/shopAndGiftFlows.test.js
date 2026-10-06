const { installHandlerMocks, makeScene, replyData } = require('./helpers/handlerHarness');
installHandlerMocks();
let scene;
const item = {
    name: 'Small server', type: 'server', description: 'A starter server', price: '100', runtime: '30',
    egg_id: '5', server_databases: '1', server_cpu: '100', server_ram: '1024', server_disk: '2048',
    server_swap: '0', server_backups: '2'
};
beforeEach(() => {
    scene = makeScene();
    scene.interaction.values = ['0'];
    scene.database.getObject.mockImplementation(async key => key === 'shop_items_servers' ? [{ type: 'server', data: { ...item } }] : key === 'gift_codes_list' ? [{ code: 'WELCOME', value: '50' }] : scene.userRecord);
    scene.panel.getNestData.mockResolvedValue([{ attributes: { id: 2, relationships: { eggs: { data: [{ attributes: { id: 5 } }] } } } }]);
    scene.panel.getEggData.mockResolvedValue({ attributes: { docker_image: 'image:test', startup: 'start', relationships: { variables: { data: [
        { attributes: { rules: 'required|string', env_variable: 'REQUIRED', default_value: 'yes' } },
        { attributes: { rules: 'nullable|string', env_variable: 'OPTIONAL', default_value: '' } }
    ] } } } });
    scene.panel.createServer.mockResolvedValue({ status: 201, data: { attributes: { uuid: 'new-server' } } });
    scene.cache.getCachedData.mockResolvedValue({ ...item });
});
afterEach(() => jest.useRealTimers());

describe('shop purchase', () => {
    test.each([200, 201])('charges only after a successful %s creation and schedules its runtime', async status => {
        scene.panel.createServer.mockResolvedValue({ status, data: { attributes: { uuid: 'new-server' } } });
        await scene.execute('select/shop/createSelectedItem.js');
        expect(scene.panel.createServer).toHaveBeenCalledWith('user@test.invalid', `Small server ${scene.user.id}`, '5', '1024', '0', '2048', 500, '100', '1', '2');
        expect(scene.economy.removeCoins).toHaveBeenCalledWith(scene.user.id, '100');
        expect(scene.panel.setServerRuntime).toHaveBeenCalledWith('new-server', '30', scene.user.id, '100');
        expect(scene.economy.removeCoins.mock.invocationCallOrder[0]).toBeGreaterThan(scene.panel.createServer.mock.invocationCallOrder[0]);
        expect(replyData(scene).embeds[0].description).toContain('server_created_text');
    });
    test('a permanent item does not receive an expiry', async () => {
        scene.database.getObject.mockImplementation(async key => key === 'shop_items_servers' ? [{ data: { ...item, runtime: '' } }] : scene.userRecord);
        await scene.execute('select/shop/createSelectedItem.js');
        expect(scene.economy.removeCoins).toHaveBeenCalled();
        expect(scene.panel.setServerRuntime).not.toHaveBeenCalled();
    });
    test.each([null, {}, []])('rejects an absent or invalid shop: %j', async shop => {
        scene.database.getObject.mockResolvedValue(shop);
        await scene.execute('select/shop/createSelectedItem.js');
        expect(scene.t).toHaveBeenCalledWith('shop_select.no_shop_items');
        expect(scene.panel.createServer).not.toHaveBeenCalled();
        expect(scene.economy.removeCoins).not.toHaveBeenCalled();
    });
    test.each(['bad', '-1', '3'])('rejects invalid selection %s', async selection => {
        scene.interaction.values = [selection];
        await scene.execute('select/shop/createSelectedItem.js');
        expect(scene.t).toHaveBeenCalledWith('shop_select.invalid_selection');
        expect(scene.economy.removeCoins).not.toHaveBeenCalled();
    });
    test('rejects a malformed item', async () => {
        scene.database.getObject.mockResolvedValue([{}]);
        await scene.execute('select/shop/createSelectedItem.js');
        expect(scene.t).toHaveBeenCalledWith('shop_select.configuration');
        expect(scene.panel.createServer).not.toHaveBeenCalled();
    });
    test('requires a linked panel account', async () => {
        scene.userRecord.e_mail = undefined;
        await scene.execute('select/shop/createSelectedItem.js');
        expect(scene.t).toHaveBeenCalledWith('shop.no_account_text');
        expect(scene.panel.createServer).not.toHaveBeenCalled();
    });
    test('requires a configured egg that exists on the panel', async () => {
        scene.panel.getNestData.mockResolvedValue([]);
        await scene.execute('select/shop/createSelectedItem.js');
        expect(scene.t).toHaveBeenCalledWith('shop_select.configuration');
        expect(scene.economy.removeCoins).not.toHaveBeenCalled();
    });
    test.each([0, null, 99])('does not purchase with insufficient balance %s', async balance => {
        scene.economy.getUserBalance.mockResolvedValue(balance);
        await scene.execute('select/shop/createSelectedItem.js');
        expect(scene.t).toHaveBeenCalledWith('shop_select.not_enough_coins.text');
        expect(scene.panel.createServer).not.toHaveBeenCalled();
        expect(scene.economy.removeCoins).not.toHaveBeenCalled();
    });
    test.each([undefined, { status: 500, data: { attributes: { uuid: 'unused' } } }])('does not charge for a failed creation response', async response => {
        scene.panel.createServer.mockResolvedValue(response);
        await scene.execute('select/shop/createSelectedItem.js');
        expect(scene.t).toHaveBeenCalledWith('shop_select.server_not_created_text');
        expect(scene.economy.removeCoins).not.toHaveBeenCalled();
        expect(scene.panel.setServerRuntime).not.toHaveBeenCalled();
    });
    test('does not retry a non-timeout panel error or charge the user', async () => {
        scene.panel.createServer.mockRejectedValue(Object.assign(new Error('Invalid allocation'), { response: { status: 422 } }));
        await scene.execute('select/shop/createSelectedItem.js');
        expect(scene.panel.createServer).toHaveBeenCalledTimes(1);
        expect(scene.economy.removeCoins).not.toHaveBeenCalled();
    });
    test.each([true, false])('limits gateway timeout retries and charges only on recovery: %s', async recover => {
        jest.useFakeTimers();
        const error = Object.assign(new Error('Gateway timeout'), { response: { status: 504 } });
        scene.panel.createServer.mockReset().mockRejectedValueOnce(error).mockRejectedValueOnce(error);
        if (recover) scene.panel.createServer.mockResolvedValueOnce({ status: 201, data: { attributes: { uuid: 'new-server' } } });
        else scene.panel.createServer.mockRejectedValueOnce(error);
        const purchase = scene.execute('select/shop/createSelectedItem.js');
        await jest.runAllTimersAsync();
        await purchase;
        expect(scene.panel.createServer).toHaveBeenCalledTimes(3);
        expect(scene.economy.removeCoins).toHaveBeenCalledTimes(recover ? 1 : 0);
    });
});

describe('shop configuration', () => {
    test.each(['buttons/shopManager/addShopItem.js', 'select/shopManager/addShopItem.js'])('%s offers the metadata form', async file => {
        await scene.execute(file);
        const modal = scene.interaction.showModal.mock.calls[0][0].toJSON();
        expect(modal.custom_id).toBe('addShopItemModal');
        expect(modal.components.flatMap(row => row.components).map(input => input.custom_id)).toEqual(['itemName', 'itemPrice', 'itemDescription', 'itemRuntime']);
    });
    test.each(['buttons/shopManager/addShopItem.js', 'select/shopManager/addShopItem.js'])('%s enforces the menu capacity', async file => {
        scene.database.getObject.mockResolvedValue(Array.from({ length: 24 }, () => ({ data: item })));
        await scene.execute(file);
        expect(scene.interaction.showModal).not.toHaveBeenCalled();
        expect(scene.interaction.editReply).toHaveBeenCalled();
    });
    test('metadata submission caches the item and offers confirmation', async () => {
        Object.assign(scene.inputs, { itemName: item.name, itemPrice: '100', itemDescription: item.description, itemRuntime: '30' });
        await scene.execute('modals/addShopItemModal.js');
        expect(scene.cache.cacheData).toHaveBeenCalledWith(scene.user.id, { name: item.name, price: '100', description: item.description, runtime: '30', type: 'server' });
        expect(replyData(scene).components[0].components.map(button => button.custom_id)).toEqual(['addShopItemConfirm', 'addShopItemCancel']);
    });
    test.each(['-1', 'abc', '1.5'])('rejects an invalid item price %s', async price => {
        scene.inputs.itemPrice = price;
        await scene.execute('modals/addShopItemModal.js');
        expect(scene.t).toHaveBeenCalledWith('add_item_modal_second.price_no_number_text');
        expect(replyData(scene).components).toBeUndefined();
    });
    test.each([
        ['addShopItemConfirm', 'addServerItemModal', ['serverEggId', 'serverDatabases']],
        ['addServerItemConfirm', 'addServerItemDataModal', ['serverCpu', 'serverRam', 'serverDisk', 'serverSwap', 'serverBackups']]
    ])('%s continues with the expected input form', async (file, customId, inputs) => {
        await scene.execute(`buttons/shopManager/${file}.js`);
        const modal = scene.interaction.showModal.mock.calls[0][0].toJSON();
        expect(modal.custom_id).toBe(customId);
        expect(modal.components.flatMap(row => row.components).map(input => input.custom_id)).toEqual(inputs);
    });
    test.each(['addShopItemConfirm', 'addServerItemConfirm', 'addShopItemDataConfirm'])('%s refuses an expired configuration session', async file => {
        scene.cache.getCachedData.mockResolvedValue(undefined);
        await scene.execute(`buttons/shopManager/${file}.js`);
        expect(scene.t).toHaveBeenCalledWith('add_item_modal_confirm.no_saved_data_text');
        expect(scene.interaction.showModal).not.toHaveBeenCalled();
        expect(scene.database.addShopItem).not.toHaveBeenCalled();
    });
    test('egg submission preserves metadata and adds the egg and database quota', async () => {
        Object.assign(scene.inputs, { serverEggId: '5', serverDatabases: '1' });
        await scene.execute('modals/addServerItemModal.js');
        expect(scene.cache.cacheData).toHaveBeenCalledWith(scene.user.id, expect.objectContaining({ name: item.name, price: '100', egg_id: '5', server_databases: '1' }));
        expect(replyData(scene).components[0].components[0].custom_id).toBe('addServerItemConfirm');
    });
    test('resource submission preserves prior settings and adds all quotas', async () => {
        Object.assign(scene.inputs, { serverCpu: '100', serverRam: '1024', serverDisk: '2048', serverSwap: '0', serverBackups: '2' });
        await scene.execute('modals/addServerItemDataModal.js');
        expect(scene.cache.cacheData).toHaveBeenCalledWith(scene.user.id, expect.objectContaining({ name: item.name, egg_id: '5', server_cpu: '100', server_ram: '1024', server_disk: '2048', server_swap: '0', server_backups: '2' }));
        expect(replyData(scene).components[0].components[0].custom_id).toBe('addShopItemDataConfirm');
    });
    test('final confirmation persists a valid item and consumes the session', async () => {
        await scene.execute('buttons/shopManager/addShopItemDataConfirm.js');
        expect(scene.database.addShopItem).toHaveBeenCalledWith('server', item);
        expect(scene.cache.clearCache).toHaveBeenCalledWith(scene.user.id);
    });
    test.each(['server_cpu', 'server_ram', 'server_disk', 'server_swap', 'server_backups', 'egg_id'])('invalid %s cannot create an item', async field => {
        scene.cache.getCachedData.mockResolvedValue({ ...item, [field]: 'not-a-number' });
        await scene.execute('buttons/shopManager/addShopItemDataConfirm.js');
        expect(scene.database.addShopItem).not.toHaveBeenCalled();
        expect(scene.t).toHaveBeenCalledWith('shop_select.configuration');
    });
    test('a missing egg cannot create an item', async () => {
        scene.panel.getNestData.mockResolvedValue([]);
        await scene.execute('buttons/shopManager/addShopItemDataConfirm.js');
        expect(scene.database.addShopItem).not.toHaveBeenCalled();
    });
    test('cancel clears the current configuration without adding an item', async () => {
        await scene.execute('buttons/shopManager/addShopItemCancel.js');
        expect(scene.cache.clearCache).toHaveBeenCalledWith(scene.user.id);
        expect(scene.database.addShopItem).not.toHaveBeenCalled();
    });
    test('selection displays resource quotas and only required environment variables', async () => {
        await scene.execute('select/shopManager/shopItemSelect.js');
        const fields = replyData(scene).embeds[0].fields;
        expect(fields[5].value).toContain('{"REQUIRED":"yes"}');
        expect(fields[5].value).not.toContain('OPTIONAL');
        expect(fields[7].value).toContain('100');
        expect(replyData(scene).components[0].components[0].custom_id).toBe('deleteShopItem');
    });
    test('selection rejects a deleted item', async () => {
        scene.interaction.values = ['8'];
        await scene.execute('select/shopManager/shopItemSelect.js');
        expect(scene.t).toHaveBeenCalledWith('shop_manager_select.item_not_found_text');
    });
    test('the add-item selection forwards its dependencies', async () => {
        scene.interaction.values = ['addShopItem'];
        const target = { execute: jest.fn().mockResolvedValue() };
        scene.client.selectMenus.set('addShopItem', target);
        await scene.execute('select/shopManager/shopItemSelect.js');
        expect(target.execute).toHaveBeenCalledWith(...scene.args());
    });
    test('deletion uses the displayed item index and disables the action', async () => {
        scene.message.embeds[0].data.fields[0].value = '```2```';
        await scene.execute('buttons/shopManager/deleteShopItem.js');
        expect(scene.database.removeShopItem).toHaveBeenCalledWith('2');
        expect(scene.interaction.update.mock.calls[0][0].components[0].toJSON().components[0].disabled).toBe(true);
    });
    test('an uninitialized shop manager offers adding the first item', async () => {
        scene.database.getObject.mockImplementation(async key => key === 'shop_items_servers' ? null : scene.userRecord);
        await scene.execute('commands/shopManager.js');
        expect(scene.interaction.editReply).toHaveBeenCalledTimes(1);
        expect(replyData(scene).components[0].components[0].options.map(option => option.value)).toEqual(['addShopItem']);
    });
});

describe('gift-code configuration', () => {
    test('displays the selected code and identifies it for deletion', async () => {
        await scene.execute('select/giftCodeManager/giftCodeSelect.js');
        expect(replyData(scene).embeds[0].footer.text).toBe('WELCOME');
        expect(replyData(scene).components[0].components[0].custom_id).toBe('deleteCodeButton');
    });
    test('the add selection opens the code form', async () => {
        scene.interaction.values = ['addCode'];
        scene.client.selectMenus.set('addCodeItem', require('../select/giftCodeManager/addGiftCode'));
        await scene.execute('select/giftCodeManager/giftCodeSelect.js');
        expect(scene.interaction.showModal.mock.calls[0][0].toJSON().custom_id).toBe('addCodeItemModal');
    });
    test('a full code menu refuses another code', async () => {
        scene.database.getObject.mockResolvedValue(Array.from({ length: 24 }, () => ({ code: 'FULL' })));
        await scene.execute('select/giftCodeManager/addGiftCode.js');
        expect(scene.interaction.showModal).not.toHaveBeenCalled();
    });
    test.each(['true', 'false'])('creates a code using the selected single-use setting %s', async singleUse => {
        Object.assign(scene.inputs, { itemCode: 'PROMO', itemValue: '75' });
        await scene.execute('modals/addCodeItemModal.js');
        expect(scene.collectors[0].options.filter({ user: scene.user, customId: 'singleUseCodeSelect' })).toBe(true);
        expect(scene.collectors[0].options.filter({ user: scene.recipient, customId: 'singleUseCodeSelect' })).toBe(false);
        const selection = makeScene().interaction;
        selection.customId = 'singleUseCodeSelect';
        selection.values = [singleUse];
        await scene.collectors[0].run('collect', selection);
        expect(scene.gifts.createGiftCode).toHaveBeenCalledWith('PROMO', '75', singleUse);
        expect(selection.editReply.mock.calls[0][0].components).toEqual([]);
    });
    test.each([true, false])('code deletion reports whether the code exists: %s', async exists => {
        scene.message.embeds[0].data.footer.text = 'WELCOME';
        scene.gifts.deleteGiftCode.mockResolvedValue(exists);
        await scene.execute('buttons/giftCodeManager/giftCodeDelete.js');
        expect(scene.gifts.deleteGiftCode).toHaveBeenCalledWith('WELCOME');
        expect(scene.t).toHaveBeenCalledWith(exists ? 'giftcode_manager.deleted_text' : 'giftcode_manager.code_not_found');
    });
});
