const http = require('node:http');
const https = require('node:https');
const { AxiosDataGenerator } = require('../classes/axiosDataGenerator');
const { Axios } = require('../classes/axios');

describe('Pterodactyl HTTP configuration', () => {
    test('provides JSON headers, authentication, timeout and reusable agents', () => {
        const config = new AxiosDataGenerator('test-key').generateConfig();
        expect(config.timeout).toBe(15000);
        expect(config.headers).toEqual({
            'Content-Type': 'application/json', Accept: 'application/json', Authorization: 'Bearer test-key'
        });
        expect(config.httpAgent).toBeInstanceOf(http.Agent);
        expect(config.httpsAgent).toBeInstanceOf(https.Agent);
        expect(config.httpAgent.keepAlive).toBe(true);
        expect(config.httpsAgent.keepAlive).toBe(true);
        config.httpAgent.destroy();
        config.httpsAgent.destroy();
    });

    test('merges overrides without losing authentication or mutating defaults', () => {
        const agent = new http.Agent();
        const defaults = { timeout: 2000, httpAgent: agent, headers: { 'X-Default': 'yes' } };
        const config = new AxiosDataGenerator('secret', defaults).generateConfig({
            timeout: 500, headers: { 'X-Request': 'yes', Authorization: 'wrong' }
        });
        expect(config.timeout).toBe(500);
        expect(config.httpAgent).toBe(agent);
        expect(config.headers).toMatchObject({ 'X-Default': 'yes', 'X-Request': 'yes', Authorization: 'Bearer secret' });
        expect(defaults.headers).toEqual({ 'X-Default': 'yes' });
        agent.destroy();
        config.httpsAgent.destroy();
    });
});

describe.each(['get', 'post', 'delete', 'patch'])('HTTP %s', method => {
    let transport;
    let api;
    beforeEach(() => {
        transport = { [method]: jest.fn().mockResolvedValue({ data: 'response' }) };
        api = new Axios(transport, 'https://panel.test', 'application-key', 'client-key');
    });
    afterEach(() => {
        for (const config of [api.applicationConfig, api.clientConfig]) {
            config.httpAgent.destroy();
            config.httpsAgent.destroy();
        }
    });
    const args = type => ['post', 'patch'].includes(method) ? ['/endpoint', { value: 1 }, type] : ['/endpoint', type];

    test.each(['application', 'client'])('uses the %s credentials and returns the response', async type => {
        await expect(api[method](...args(type))).resolves.toEqual({ data: 'response' });
        const call = transport[method].mock.calls[0];
        expect(call[0]).toBe('https://panel.test/endpoint');
        expect(call.at(-1).headers.Authorization).toBe(`Bearer ${type}-key`);
        if (['post', 'patch'].includes(method)) expect(call[1]).toEqual({ value: 1 });
    });
    test('ignores an unsupported API type without making a request', async () => {
        await expect(api[method](...args('unknown'))).resolves.toBeNull();
        expect(transport[method]).not.toHaveBeenCalled();
    });
    test('propagates a transport failure', async () => {
        transport[method].mockRejectedValue(new Error('offline'));
        await expect(api[method](...args('client'))).rejects.toThrow('offline');
    });
});
