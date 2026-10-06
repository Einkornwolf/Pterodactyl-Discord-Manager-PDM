const { installHandlerMocks, makeScene, replyData } = require('./helpers/handlerHarness');
installHandlerMocks();
let scene;
beforeEach(() => { scene = makeScene(); });

test.each([['startServer', 'start'], ['stopServer', 'stop']])('%s acts on the selected owned server', async (file, signal) => {
    await scene.execute(`buttons/serverManager/${file}.js`);
    expect(scene.panel.powerEventServer).toHaveBeenCalledWith('short', signal);
    expect(replyData(scene).embeds[0].description).toContain(`${signal}_server_text`);
});
test('reinstall targets the selected server', async () => {
    await scene.execute('buttons/serverManager/reinstallServer.js');
    expect(scene.panel.reinstallServer).toHaveBeenCalledWith('short');
});
test('delete removes both the server and all of its runtime entries', async () => {
    await scene.execute('buttons/serverManager/deleteServer.js');
    expect(scene.panel.deleteServer).toHaveBeenCalledWith(7);
    expect(scene.panel.removeServerSuspensionList).toHaveBeenCalledWith('server-uuid');
    expect(scene.panel.removeServerDeletionList).toHaveBeenCalledWith('server-uuid');
});
test.each(['startServer', 'stopServer', 'reinstallServer', 'deleteServer', 'extendServer', 'renameServer', 'serverInfo'])('%s rejects a server not owned by the user', async file => {
    scene.panel.getAllServers.mockResolvedValue([]);
    await scene.execute(`buttons/serverManager/${file}.js`);
    expect(scene.t).toHaveBeenCalledWith('server_manager_events.server_not_found_text');
    expect(scene.panel.powerEventServer).not.toHaveBeenCalled();
    expect(scene.panel.deleteServer).not.toHaveBeenCalled();
    expect(scene.panel.reinstallServer).not.toHaveBeenCalled();
    expect(scene.economy.removeCoins).not.toHaveBeenCalled();
    expect(scene.interaction.showModal).not.toHaveBeenCalled();
});
test.each(['startServer', 'stopServer', 'reinstallServer', 'deleteServer', 'extendServer', 'renameServer', 'serverInfo'])('%s rejects a server still installing', async file => {
    scene.panel.getInstallStatus.mockResolvedValue(false);
    await scene.execute(`buttons/serverManager/${file}.js`);
    expect(scene.t).toHaveBeenCalledWith('server_manager_events.server_not_found_text');
    expect(scene.panel.powerEventServer).not.toHaveBeenCalled();
    expect(scene.panel.deleteServer).not.toHaveBeenCalled();
    expect(scene.economy.removeCoins).not.toHaveBeenCalled();
});
test('rename opens the server-name form', async () => {
    await scene.execute('buttons/serverManager/renameServer.js');
    const modal = scene.interaction.showModal.mock.calls[0][0].toJSON();
    expect(modal.custom_id).toBe('renameModal');
    expect(modal.components[0].components[0].custom_id).toBe('serverRenameText');
});
test('rename form submission resolves ownership before renaming', async () => {
    await scene.execute('modals/renameModal.js');
    expect(scene.panel.getAllServers).toHaveBeenCalledWith('user@test.invalid');
    expect(scene.panel.renameServer).toHaveBeenCalledWith('short', 'New server name');
    expect(replyData(scene).embeds[0].fields[0].value).toContain('New server name');
});
test.each(['suspension', 'deletion'])('runtime renewal charges the configured price for a %s entry', async type => {
    const runtime = { uuid: 'server-uuid', price: 20, runtime: 5 };
    scene.panel.getRuntimeList.mockResolvedValue(type === 'suspension' ? [runtime] : []);
    scene.panel.getDeletionList.mockResolvedValue(type === 'deletion' ? [runtime] : []);
    await scene.execute('buttons/serverManager/extendServer.js');
    expect(scene.economy.removeCoins).toHaveBeenCalledWith(scene.user.id, 15);
    expect(scene.panel.extendRuntime).toHaveBeenCalledWith('short', 5);
    if (type === 'deletion') expect(scene.panel.unSuspendServer).toHaveBeenCalledWith(7);
    else expect(scene.panel.unSuspendServer).not.toHaveBeenCalled();
    expect(replyData(scene).embeds[0].fields[1].value).toContain('15');
});
test.each(['no-price', 'insufficient-funds'])('runtime renewal refuses %s', async reason => {
    scene.panel.getRuntimeList.mockResolvedValue([{ uuid: 'server-uuid', price: reason === 'no-price' ? 0 : 2000, runtime: 5 }]);
    await scene.execute('buttons/serverManager/extendServer.js');
    expect(scene.economy.removeCoins).not.toHaveBeenCalled();
    expect(scene.panel.extendRuntime).not.toHaveBeenCalled();
});
test('server info renders configuration and live resources', async () => {
    await scene.execute('buttons/serverManager/serverInfo.js');
    const fields = replyData(scene).embeds[0].fields;
    expect(fields.find(field => field.name.endsWith('name')).value).toContain('Test server');
    expect(fields.find(field => field.name.endsWith('ram_usage')).value).toContain('512');
    expect(fields.find(field => field.name.endsWith('cpu_usage')).value).toContain('50');
});

test.each(['suspension', 'deletion', 'error'])('server selection renders the %s state and action controls', async type => {
    scene.interaction.values = ['0'];
    scene.panel.getServerRuntime.mockResolvedValue({ status: type !== 'error', type, data: {
        price: 20, runtime: 5, date_running_out: { date: '2026-02-01' }, deletion_date: { date: '2026-02-03' }
    } });
    await scene.execute('select/serverManager/serverSelect.js');
    const payload = replyData(scene);
    expect(payload.embeds[0].fields[3].value).toContain('server-uuid');
    const buttons = payload.components.flatMap(row => row.components);
    expect(buttons.map(button => button.custom_id)).toEqual(['startServer', 'stopServer', 'reinstallServer', 'renameServer', 'serverInfo', 'deleteServer', 'extendServer']);
    expect(buttons.at(-1).disabled).toBe(type === 'error');
});
test.each(['missing', 'installing'])('server selection rejects %s resources', async reason => {
    scene.interaction.values = reason === 'missing' ? ['8'] : ['0'];
    scene.panel.liveServerRessourceUsage.mockResolvedValue(undefined);
    await scene.execute('select/serverManager/serverSelect.js');
    expect(scene.t).toHaveBeenCalledWith('server_manager_events.server_not_found_text');
    expect(replyData(scene).components).toBeUndefined();
});
test('a suspended server can be shown while its resource endpoint is unavailable', async () => {
    scene.server.attributes.suspended = true;
    scene.interaction.values = ['0'];
    scene.panel.liveServerRessourceUsage.mockResolvedValue(undefined);
    await scene.execute('select/serverManager/serverSelect.js');
    expect(replyData(scene).embeds[0].fields.find(field => field.name.endsWith('ram_usage')).value).toContain('N/A');
});

function servers(count) {
    return Array.from({ length: count }, (_, index) => ({ attributes: { ...scene.server.attributes, name: `Server ${index}`, identifier: `short-${index}`, uuid: `uuid-${index}` } }));
}
test('the first server page offers navigation when more than 25 servers exist', async () => {
    scene.panel.getAllServers.mockResolvedValue(servers(26));
    await scene.execute('commands/serverManager.js');
    const payload = replyData(scene);
    expect(payload.components[0].components[0].options).toHaveLength(25);
    expect(payload.components[1].components[0].custom_id).toBe('nextServerPage');
});
test.each([26, 60])('next page displays the correct server range for %s servers', async count => {
    scene.panel.getAllServers.mockResolvedValue(servers(count));
    await scene.execute('buttons/serverManagerPagination/nextServerPage.js');
    const payload = replyData(scene);
    const options = payload.components[0].components[0].options;
    expect(options[0].value).toBe('25');
    expect(options).toHaveLength(Math.min(count - 25, 25));
    expect(payload.embeds[0].footer.text).toBe('2');
    expect(payload.components[1].components.map(button => button.custom_id)).toEqual(count > 50 ? ['previousServerPage', 'nextServerPage'] : ['previousServerPage']);
});
test('previous page returns to the first server range', async () => {
    scene.message.embeds[0].footer.text = '2';
    scene.panel.getAllServers.mockResolvedValue(servers(26));
    await scene.execute('buttons/serverManagerPagination/previousServerPage.js');
    const payload = replyData(scene);
    expect(payload.embeds[0].footer.text).toBe('1');
    expect(payload.components[0].components[0].options[0].value).toBe('0');
    expect(payload.components[1].components.map(button => button.custom_id)).toEqual(['nextServerPage']);
});

test('runtime cancellation has no panel effects', async () => {
    await scene.execute('buttons/runtimeOverride/cancel.js');
    expect(scene.t).toHaveBeenCalledWith('override_runtime.cancelled');
    expect(scene.panel.setServerRuntime).not.toHaveBeenCalled();
});
test('runtime confirmation replaces both old runtime lists for the owning user', async () => {
    await scene.execute('buttons/runtimeOverride/continue.js', 'server-uuid', 'short', 10, 40);
    expect(scene.panel.removeServerSuspensionList).toHaveBeenCalledWith('server-uuid');
    expect(scene.panel.removeServerDeletionList).toHaveBeenCalledWith('server-uuid');
    expect(scene.panel.setServerRuntime).toHaveBeenCalledWith('server-uuid', 10, scene.user.id, 40);
});
