jest.mock('../classes/dataBaseInterface', () => ({
    DataBaseInterface: jest.fn(() => new (require('./helpers/memoryDatabase').MemoryDatabase)())
}));
jest.mock('../classes/axios', () => ({
    Axios: jest.fn(() => ({ get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() }))
}));
jest.mock('../classes/passwordGenerator', () => ({
    Password: jest.fn(() => ({ generatePassword: jest.fn().mockResolvedValue('generated-password') }))
}));

const { PanelManager } = require('../classes/panelManager');
const { Axios } = require('../classes/axios');
const { DataBaseInterface } = require('../classes/dataBaseInterface');
const database = DataBaseInterface.mock.results[0].value;
const userId = '111111111111111111';
const user = { attributes: { id: 7, email: 'user@test.invalid', username: 'user', first_name: 'Test', last_name: 'User', relationships: { servers: { data: [] } } } };
let panel;

beforeEach(() => {
    database.records.clear();
    jest.clearAllMocks();
    panel = new PanelManager('https://panel.test', 'app-key', 'client-key');
});
afterEach(() => jest.useRealTimers());

test('account lookup matches the full email and reports absence', async () => {
    panel.axios.get.mockResolvedValue({ data: { data: [user] } });
    await expect(panel.checkAccount(user.attributes.email)).resolves.toEqual(user);
    await expect(panel.checkAccount('other@test.invalid')).resolves.toBeUndefined();
    const [url, credentialType] = panel.axios.get.mock.calls[0];
    expect(decodeURIComponent(url)).toContain('filter[email]=user@test.invalid');
    expect(credentialType).toBe('application');
});

test.each(['explicit-password', undefined])('creates a user with an explicit or generated password (%s)', async password => {
    panel.axios.post.mockResolvedValue({ data: { id: 7 } });
    await panel.addUser('user@test.invalid', 'user', 'Test', 'User', password);
    expect(panel.axios.post).toHaveBeenCalledWith('/api/application/users', {
        email: 'user@test.invalid', username: 'user', first_name: 'Test', last_name: 'User', password: password || 'generated-password'
    }, 'application');
});

test('removes a matching user and does nothing for a missing account', async () => {
    jest.spyOn(panel, 'checkAccount').mockResolvedValueOnce(user).mockResolvedValueOnce(undefined);
    panel.axios.delete.mockResolvedValue({ data: 'deleted' });
    await panel.removeUser(user.attributes.email);
    await panel.removeUser('missing@test.invalid');
    expect(panel.axios.delete.mock.calls).toEqual([['/api/application/users/7', 'application']]);
});

test.each(['explicit-password', undefined])('password reset preserves account fields (%s)', async password => {
    jest.spyOn(panel, 'checkAccount').mockResolvedValue(user);
    panel.axios.patch.mockResolvedValue({ data: 'updated' });
    await expect(panel.resetUserPassword(user.attributes.email, password)).resolves.toEqual({
        data: { data: 'updated' }, passkey: password || 'generated-password'
    });
    expect(panel.axios.patch).toHaveBeenCalledWith('/api/application/users/7', expect.objectContaining({
        username: 'user', first_name: 'Test', last_name: 'User', password: password || 'generated-password'
    }), 'application');
});

test.each([
    ['getPanelNodes', [], '/api/application/nodes?per_page=10000&include=servers'],
    ['getAllocations', [3], '/api/application/nodes/3/allocations?per_page=10000'],
    ['getNestData', [], '/api/application/nests?per_page=10000&include=eggs']
])('%s returns the panel collection', async (method, args, url) => {
    panel.axios.get.mockResolvedValue({ data: { data: [{ attributes: { id: 1 } }] } });
    await expect(panel[method](...args)).resolves.toEqual([{ attributes: { id: 1 } }]);
    expect(panel.axios.get).toHaveBeenCalledWith(url, 'application');
});

test('loads egg configuration with its variables and script', async () => {
    panel.axios.get.mockResolvedValue({ data: { attributes: { id: 5 } } });
    await expect(panel.getEggData(5, 2)).resolves.toEqual({ attributes: { id: 5 } });
    expect(panel.axios.get).toHaveBeenCalledWith('/api/application/nests/2/eggs/5?per_page=10000&include=config,script,variables', 'application');
});

function prepareServerCreation() {
    jest.spyOn(panel, 'checkAccount').mockResolvedValue(user);
    jest.spyOn(panel, 'getPanelNodes').mockResolvedValue([
        { attributes: { id: 1, relationships: { servers: { data: ['occupied', 'occupied'] } } } },
        { attributes: { id: 2, relationships: { servers: { data: [] } } } }
    ]);
    jest.spyOn(panel, 'getAllocations').mockResolvedValue([
        { attributes: { id: 10, assigned: true } }, { attributes: { id: 11, assigned: false } }
    ]);
    jest.spyOn(panel, 'getNestData').mockResolvedValue([{ attributes: { relationships: { eggs: { data: [
        { attributes: { id: 5, nest: 2, startup: 'start' } }
    ] } } } }]);
    jest.spyOn(panel, 'getEggData').mockResolvedValue({ attributes: {
        docker_image: 'image:test', relationships: { variables: { data: [
            { attributes: { rules: 'required|string', env_variable: 'REQUIRED', default_value: 'yes' } },
            { attributes: { rules: 'nullable', env_variable: 'OPTIONAL', default_value: 'no' } }
        ] } }
    } });
    panel.axios.post.mockResolvedValue({ data: { id: 15 } });
}
const create = () => panel.createServer(user.attributes.email, 'Test server', 5, 1024, 0, 2048, 500, 100, 2, 3);

test('server creation selects the least busy node, a free allocation and required environment', async () => {
    prepareServerCreation();
    await expect(create()).resolves.toEqual({ data: { id: 15 } });
    expect(panel.getAllocations).toHaveBeenCalledWith(2);
    expect(panel.axios.post).toHaveBeenCalledWith('/api/application/servers', {
        name: 'Test server', user: 7, egg: 5, docker_image: 'image:test', startup: 'start', environment: { REQUIRED: 'yes' },
        limits: { memory: 1024, swap: 0, disk: 2048, io: 500, cpu: 100 }, feature_limits: { databases: 2, backups: 3 }, allocation: { default: 11 }
    }, 'application');
});

test.each([
    ['checkAccount', null, 'user not found'], ['getPanelNodes', [], 'no node data'],
    ['getAllocations', null, 'no allocations'], ['getAllocations', [], 'no free allocations'],
    ['getNestData', [], 'chosenNestData not found'], ['getEggData', null, 'complexEggData missing']
])('server creation rejects unusable %s data (%s)', async (method, value, error) => {
    prepareServerCreation();
    panel[method].mockResolvedValue(value);
    await expect(create()).rejects.toThrow(error);
    expect(panel.axios.post).not.toHaveBeenCalled();
});

test.each([502, 503, 504])('retries transient HTTP %s failures with backoff', async status => {
    jest.useFakeTimers();
    const task = jest.fn().mockRejectedValueOnce({ response: { status } }).mockResolvedValue('ready');
    const result = panel._withRetries(task);
    await jest.advanceTimersByTimeAsync(1000);
    await expect(result).resolves.toBe('ready');
    expect(task).toHaveBeenCalledTimes(2);
});
test('does not retry validation failures', async () => {
    const error = Object.assign(new Error('bad request'), { response: { status: 400 } });
    const task = jest.fn().mockRejectedValue(error);
    await expect(panel._withRetries(task)).rejects.toBe(error);
    expect(task).toHaveBeenCalledTimes(1);
});
test('stops after the retry limit', async () => {
    jest.useFakeTimers();
    const error = Object.assign(new Error('unavailable'), { response: { status: 503 } });
    const task = jest.fn().mockRejectedValue(error);
    const assertion = expect(panel._withRetries(task)).rejects.toBe(error);
    await jest.advanceTimersByTimeAsync(3000);
    await assertion;
    expect(task).toHaveBeenCalledTimes(3);
});

test.each([
    ['deleteServer', [7], 'delete', '/api/application/servers/7', undefined, 'application'],
    ['powerEventServer', ['short', 'start'], 'post', '/api/client/servers/short/power', { signal: 'start' }, 'client'],
    ['reinstallServer', ['short'], 'post', '/api/client/servers/short/settings/reinstall', {}, 'client'],
    ['renameServer', ['short', 'New name'], 'post', '/api/client/servers/short/settings/rename', { name: 'New name' }, 'client'],
    ['suspendServer', [7], 'post', '/api/application/servers/7/suspend', {}, 'application'],
    ['unSuspendServer', [7], 'post', '/api/application/servers/7/unsuspend', {}, 'application'],
    ['getServerInfo', ['short'], 'get', '/api/client/servers/short', undefined, 'client']
])('%s sends the correct API request', async (method, args, verb, url, body, scope) => {
    panel.axios[verb].mockResolvedValue({ data: { result: true } });
    await expect(panel[method](...args)).resolves.toEqual({ result: true });
    expect(panel.axios[verb]).toHaveBeenCalledWith(...(body === undefined ? [url, scope] : [url, body, scope]));
    panel.axios[verb].mockRejectedValue(new Error('panel down'));
    await expect(panel[method](...args)).rejects.toThrow('panel down');
});

test('lists account servers and treats a missing account as absent', async () => {
    jest.spyOn(panel, 'checkAccount').mockResolvedValueOnce(user).mockResolvedValueOnce(undefined);
    await expect(panel.getAllServers(user.attributes.email)).resolves.toEqual([]);
    await expect(panel.getAllServers('missing')).resolves.toBeNull();
});
test('resource reads distinguish available resources from installation/API failures', async () => {
    panel.axios.get.mockResolvedValue({ data: { state: 'running' } });
    await expect(panel.getInstallStatus('short')).resolves.toBe(true);
    await expect(panel.liveServerRessourceUsage('short')).resolves.toEqual({ state: 'running' });
    panel.axios.get.mockRejectedValue(new Error('installing'));
    await expect(panel.getInstallStatus('short')).resolves.toBe(false);
    await expect(panel.liveServerRessourceUsage('short')).resolves.toBeUndefined();
});
test.each([['getServerId', 7], ['getServerIdentifier', 'short']])('%s resolves UUIDs and reports unknown servers', async (method, expected) => {
    panel.axios.get.mockResolvedValue({ data: { data: [{ attributes: { uuid: 'uuid', id: 7, identifier: 'short' } }] } });
    await expect(panel[method]('uuid')).resolves.toBe(expected);
    await expect(panel[method]('unknown')).resolves.toBeNull();
});

const runtime = () => ({ uuid: 'uuid', user_id: userId, runtime: 5, price: 20, date_created: { date: '2026-01-01T00:00:00Z' }, date_running_out: { date: '2026-01-06T00:00:00Z' } });
test('stores server runtimes and computes their expiry in days', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00Z'));
    await panel.setServerRuntime('uuid', 5, userId, 20);
    const list = await panel.getRuntimeList();
    expect(list[0]).toMatchObject({ uuid: 'uuid', user_id: userId, runtime: 5, price: 20 });
    expect(new Date(list[0].date_running_out.date).toISOString()).toBe('2026-01-06T00:00:00.000Z');
});
test('runtime and deletion lists can be replaced, read and pruned independently', async () => {
    await expect(panel.getRuntimeList()).resolves.toBeNull();
    await expect(panel.getDeletionList()).resolves.toBeNull();
    await expect(panel.removeServerDeletionList('missing')).resolves.toBeNull();
    await panel.setRuntimeList([runtime(), { ...runtime(), uuid: 'other' }]);
    await panel.setDeletionList([{ ...runtime(), uuid: 'deleted' }]);
    await panel.removeServerSuspensionList('uuid');
    expect((await panel.getRuntimeList()).map(server => server.uuid)).toEqual(['other']);
    await panel.removeServerDeletionList('deleted');
    await expect(panel.getDeletionList()).resolves.toEqual([]);
});
test('suspension data becomes deletion data with the configured grace period', async () => {
    await panel.setRuntimeList([runtime()]);
    await panel.addServerDeletion('uuid', 5, userId, 20);
    const list = await panel.getDeletionList();
    expect(new Date(list[0].deletion_date.date).toISOString()).toBe('2026-01-08T00:00:00.000Z');
    expect(list[0].date_created).toEqual(runtime().date_created);
});
test.each(['suspension', 'deletion', 'error'])('looks up a server runtime in the %s state', async state => {
    jest.spyOn(panel, 'getServerInfo').mockResolvedValue({ attributes: { uuid: 'uuid' } });
    await panel.setRuntimeList(state === 'suspension' ? [runtime()] : []);
    await panel.setDeletionList(state === 'deletion' ? [runtime()] : []);
    await expect(panel.getServerRuntime('short')).resolves.toMatchObject({ status: state !== 'error', type: state });
});
test.each(['suspension', 'deletion'])('extends a server from its %s list', async state => {
    jest.spyOn(panel, 'getServerInfo').mockResolvedValue({ attributes: { uuid: 'uuid' } });
    await panel.setRuntimeList(state === 'suspension' ? [runtime()] : []);
    await panel.setDeletionList(state === 'deletion' ? [{ ...runtime(), deletion_date: { date: '2026-01-08T00:00:00Z' } }] : []);
    await panel.extendRuntime('short', 2);
    const list = await panel.getRuntimeList();
    expect(list).toHaveLength(1);
    expect(new Date(list[0].date_running_out.date).toISOString()).toBe(state === 'suspension' ? '2026-01-08T00:00:00.000Z' : '2026-01-10T00:00:00.000Z');
    await expect(panel.getDeletionList()).resolves.toEqual([]);
});
test('deleting all servers removes their runtime metadata and handles empty accounts', async () => {
    jest.spyOn(panel, 'getAllServers').mockResolvedValueOnce([{ attributes: { id: 7, uuid: 'uuid' } }]).mockResolvedValueOnce(null);
    jest.spyOn(panel, 'deleteServer').mockResolvedValue('deleted');
    await panel.setRuntimeList([runtime()]);
    await panel.setDeletionList([runtime()]);
    await panel.deleteAllServers('user@test.invalid');
    await panel.deleteAllServers('missing@test.invalid');
    expect(panel.deleteServer).toHaveBeenCalledTimes(1);
    await expect(panel.getRuntimeList()).resolves.toEqual([]);
    await expect(panel.getDeletionList()).resolves.toEqual([]);
});
test('accumulated servers include only accounts present in the local user database', async () => {
    database.records.set(userId, { e_mail: 'user@test.invalid' });
    database.records.set('configuration', { e_mail: 'ignored@test.invalid' });
    panel.axios.get.mockResolvedValue({ data: { data: ['user@test.invalid', 'other@test.invalid'].map((email, index) => ({
        attributes: { uuid: `uuid-${index}`, relationships: { user: { attributes: { email } } } }
    })) } });
    await expect(panel.getAccumulatedUserServers()).resolves.toEqual(['uuid-0']);
});
test('maps server ownership back to the local Discord ID', async () => {
    database.records.set(userId, { e_mail: 'user@test.invalid' });
    jest.spyOn(panel, 'getServerId').mockResolvedValue(7);
    panel.axios.get.mockResolvedValue({ data: { attributes: { relationships: { user: { attributes: { email: 'user@test.invalid' } } } } } });
    await expect(panel.getUserIDfromUUID('uuid')).resolves.toBe(userId);
});
test.each([null, {}, { email: 'user@test.invalid' }])('resolves a client API key only when account data contains an email (%s)', async account => {
    Axios.mockImplementationOnce(() => ({ get: jest.fn().mockResolvedValue(account && { data: { attributes: account } }) }));
    await expect(panel.getUserEmailFromAPIKey('key')).resolves.toBe(account?.email || null);
});
test('an invalid client API key returns no account', async () => {
    Axios.mockImplementationOnce(() => ({ get: jest.fn().mockRejectedValue(new Error('unauthorized')) }));
    await expect(panel.getUserEmailFromAPIKey('invalid')).resolves.toBeNull();
});
test('local account lookup is case insensitive and excludes configuration records', async () => {
    await expect(panel.checkLocalAccount('user@test.invalid')).resolves.toBe(false);
    database.records.set(userId, { e_mail: 'USER@test.invalid' });
    database.records.set('configuration', { e_mail: 'other@test.invalid' });
    await expect(panel.checkLocalAccount('user@test.invalid')).resolves.toBe(true);
    await expect(panel.checkLocalAccount('other@test.invalid')).resolves.toBe(false);
    await expect(panel.checkLocalAccount(null)).resolves.toBe(false);
});
