jest.mock('../classes/dataBaseInterface', () => ({ DataBaseInterface: jest.fn() }));
const { PanelManager } = require('../classes/panelManager');
const account = id => ({ attributes: { id, username: `user${id}`, first_name: 'First', last_name: 'Last' } });
test('concurrent resets keep each password attached to its account', async () => {
    const panel = new PanelManager('https://example.invalid', 'fake', 'fake');
    panel.checkAccount = jest.fn(async email => account(email === 'a' ? 1 : 2));
    panel.axios.patch = jest.fn(async () => ({}));
    const results = await Promise.all([panel.resetUserPassword('a', 'fake-A'), panel.resetUserPassword('b', 'fake-B')]);
    expect(panel.axios.patch).toHaveBeenCalledWith('/api/application/users/1', expect.objectContaining({ email: 'a', password: 'fake-A' }), 'application');
    expect(panel.axios.patch).toHaveBeenCalledWith('/api/application/users/2', expect.objectContaining({ email: 'b', password: 'fake-B' }), 'application');
    expect(results.map(result => result.passkey)).toEqual(['fake-A', 'fake-B']);
});
test('concurrent server creation preserves the owner and egg configuration', async () => {
    const panel = new PanelManager('https://example.invalid', 'fake', 'fake');
    panel.checkAccount = jest.fn(async email => account(email === 'a' ? 1 : 2));
    panel.getPanelNodes = jest.fn(async () => [{ attributes: { id: 1, relationships: { servers: { data: [] } } } }]);
    panel.getAllocations = jest.fn(async () => [{ attributes: { id: 10, assigned: false } }]);
    panel.getNestData = jest.fn(async () => [{ attributes: { relationships: { eggs: { data: [1, 2].map(id => ({ attributes: { id, nest: 1, startup: `start${id}` } })) } } } }]);
    panel.getEggData = jest.fn(async id => ({ attributes: { docker_image: `image${id}`, relationships: { variables: { data: [] } } } }));
    panel.axios.post = jest.fn(async (url, data) => data);
    const results = await Promise.all([panel.createServer('a', 'A', 1), panel.createServer('b', 'B', 2)]);
    expect(results[0]).toMatchObject({ name: 'A', user: 1, egg: 1, docker_image: 'image1', startup: 'start1' });
    expect(results[1]).toMatchObject({ name: 'B', user: 2, egg: 2, docker_image: 'image2', startup: 'start2' });
});
