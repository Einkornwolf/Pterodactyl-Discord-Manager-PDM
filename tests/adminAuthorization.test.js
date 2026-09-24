const { isAdmin } = require('../classes/adminAuthorization');
const admin = '123456789012345678';
const other = '223456789012345678';
afterEach(() => { delete process.env.ADMIN_LIST; delete process.env.ENABLE_DEVELOPER_EVAL; });
test.each([undefined, '', '[]', '[invalid', '[123456789012345678]', 'not-an-id'])('denies invalid allowlist %s', raw => {
    expect(isAdmin(admin, raw)).toBe(false);
});
test('matches complete IDs in comma-separated and JSON configuration', () => {
    expect(isAdmin(admin, `${other}, ${admin}`)).toBe(true);
    expect(isAdmin(admin, JSON.stringify([admin]))).toBe(true);
    expect(isAdmin(admin, `9${admin}`)).toBe(false);
    expect(isAdmin(other, admin)).toBe(false);
});
test('eval requires both explicit enablement and an authorized ID', async () => {
    const command = require('../analogCommands/developer/eval');
    const message = { author: { id: admin }, content: 'pdm eval ? 1 + 1', channel: { send: jest.fn() } };
    await command.execute(message, {});
    process.env.ADMIN_LIST = admin;
    await command.execute(message, {});
    expect(message.channel.send).not.toHaveBeenCalled();
    process.env.ENABLE_DEVELOPER_EVAL = 'true';
    message.author.id = other;
    await command.execute(message, {});
    expect(message.channel.send).not.toHaveBeenCalled();
    message.author.id = admin;
    await command.execute(message, {});
    expect(message.channel.send.mock.calls[0][0].embeds[0].data.fields[1].value).toContain('2');
});
