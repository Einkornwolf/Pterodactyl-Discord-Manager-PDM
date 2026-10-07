const { isAdmin } = require('../classes/adminAuthorization');
const admin = '123456789012345678';
const other = '223456789012345678';
const initialEnvironment = {
    ADMIN_LIST: process.env.ADMIN_LIST,
    ENABLE_DEVELOPER_EVAL: process.env.ENABLE_DEVELOPER_EVAL
};

beforeEach(() => {
    delete process.env.ADMIN_LIST;
    delete process.env.ENABLE_DEVELOPER_EVAL;
});

afterEach(() => {
    for (const [key, value] of Object.entries(initialEnvironment)) {
        if (value === undefined) {
            delete process.env[key];
        } else {
            process.env[key] = value;
        }
    }
});

test.each([
    undefined, null, 42, [admin], '', '   ', '[]', '[invalid',
    '[123456789012345678]', JSON.stringify([admin, 42]), JSON.stringify([admin, null]),
    JSON.stringify({ admin }), 'not-an-id', `${admin},invalid`, `${admin},`,
    JSON.stringify(['1234567890123456']), JSON.stringify(['123456789012345678901'])
])('denies missing or malformed allowlist %p', adminList => {
    expect(isAdmin(admin, adminList)).toBe(false);
});

test.each([
    admin, `${other}, ${admin}`, `  ${other}, ${admin}  `,
    JSON.stringify([other, admin]), `  ${JSON.stringify([admin])}  `
])('accepts complete IDs in a valid allowlist %p', adminList => {
    expect(isAdmin(admin, adminList)).toBe(true);
});

test.each(['12345678901234567', '12345678901234567890'])('accepts the supported ID length for %s', userId => {
    expect(isAdmin(userId, JSON.stringify([userId]))).toBe(true);
});

test('never grants access through a partial ID match', () => {
    expect(isAdmin(admin, `9${admin}`)).toBe(false);
    expect(isAdmin(other, admin)).toBe(false);
});

test.each([undefined, null, Number(admin), BigInt(admin), { toString: () => admin }, '', '1234567890123456'])('rejects invalid user ID %p without coercion', userId => {
    expect(isAdmin(userId, admin)).toBe(false);
});

test('reads the current environment rather than retaining an earlier allowlist', () => {
    expect(isAdmin(admin)).toBe(false);
    process.env.ADMIN_LIST = admin;
    expect(isAdmin(admin)).toBe(true);
    process.env.ADMIN_LIST = other;
    expect(isAdmin(admin)).toBe(false);
});

function makeEvaluationMessage(userId = admin) {
    return {
        author: { id: userId },
        content: 'pdm eval ? 1 + 1',
        channel: { send: jest.fn() }
    };
}

test.each([undefined, 'false', 'TRUE', '1', ' true '])('eval remains disabled for flag %p', async enabled => {
    process.env.ADMIN_LIST = admin;
    if (enabled !== undefined) {
        process.env.ENABLE_DEVELOPER_EVAL = enabled;
    }
    const message = makeEvaluationMessage();
    await require('../analogCommands/developer/eval').execute(message, {});
    expect(message.channel.send).not.toHaveBeenCalled();
});

test.each([undefined, '[invalid', other])('enabled eval denies an unauthorized allowlist %p', async adminList => {
    process.env.ENABLE_DEVELOPER_EVAL = 'true';
    if (adminList !== undefined) {
        process.env.ADMIN_LIST = adminList;
    }
    const message = makeEvaluationMessage();
    await require('../analogCommands/developer/eval').execute(message, {});
    expect(message.channel.send).not.toHaveBeenCalled();
});

test('enabled eval permits an explicitly authorized user', async () => {
    process.env.ADMIN_LIST = admin;
    process.env.ENABLE_DEVELOPER_EVAL = 'true';
    const message = makeEvaluationMessage();
    await require('../analogCommands/developer/eval').execute(message, {});
    expect(message.channel.send).toHaveBeenCalledTimes(1);
    expect(message.channel.send.mock.calls[0][0].embeds[0].toJSON().fields[1].value).toContain('2');
});
