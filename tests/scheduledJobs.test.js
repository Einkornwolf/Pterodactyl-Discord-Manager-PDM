const { installHandlerMocks, makeScene } = require('./helpers/handlerHarness');
installHandlerMocks();
jest.mock('cron', () => ({ CronJob: jest.fn().mockImplementation((schedule, tick, complete, start, timeZone) => ({ schedule, tick, timeZone, start: jest.fn() })) }));
jest.mock('../classes/logManager', () => ({ LogManager: jest.fn().mockImplementation(() => ({ logString: jest.fn().mockResolvedValue() })) }));
let scene;
beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-02-10T00:00:00Z'));
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    scene = makeScene();
});
afterEach(() => jest.useRealTimers());

async function runtimeTick() {
    await require('../cronJobs/dailyRuntime').execute(scene.client, scene.panel, scene.database, scene.emoji);
    const job = require('cron').CronJob.mock.results.at(-1).value;
    await job.tick();
    return job;
}
const runtime = (date, uuid = 'server-uuid') => ({ uuid, runtime: 30, price: 100, user_id: '111111111111111111', date_running_out: { date } });
const deletion = (date, uuid = 'server-uuid') => ({ uuid, deletion_date: { date } });

test('daily reward reset is scheduled at Amsterdam midnight and resets all users', async () => {
    await require('../cronJobs/dailyReset').execute(scene.client, scene.economy);
    const job = require('cron').CronJob.mock.results.at(-1).value;
    expect(job.schedule).toBe('0 0 0 * * *');
    expect(job.timeZone).toBe('Europe/Amsterdam');
    expect(job.start).toHaveBeenCalledTimes(1);
    expect(scene.economy.resetAllDailyAmounts).not.toHaveBeenCalled();
    await job.tick();
    expect(scene.economy.resetAllDailyAmounts).toHaveBeenCalledTimes(1);
});
test.each([null, []])('empty runtime lists cause no panel or user actions: %j', async list => {
    scene.panel.getRuntimeList.mockResolvedValue(list);
    scene.panel.getDeletionList.mockResolvedValue(list);
    const job = await runtimeTick();
    expect(job.timeZone).toBe('Europe/Amsterdam');
    expect(scene.panel.deleteServer).not.toHaveBeenCalled();
    expect(scene.panel.suspendServer).not.toHaveBeenCalled();
    expect(scene.user.send).not.toHaveBeenCalled();
});
test('future expiries outside the reminder window are left alone', async () => {
    scene.panel.getRuntimeList.mockResolvedValue([runtime('2026-03-01')]);
    scene.panel.getDeletionList.mockResolvedValue([deletion('2026-03-01')]);
    await runtimeTick();
    expect(scene.panel.deleteServer).not.toHaveBeenCalled();
    expect(scene.panel.suspendServer).not.toHaveBeenCalled();
    expect(scene.user.send).not.toHaveBeenCalled();
});
test.each([false, true])('an upcoming expiry sends a reminder and tolerates closed DMs: %s', async closed => {
    scene.panel.getRuntimeList.mockResolvedValue([runtime('2026-02-12')]);
    if (closed) scene.user.send.mockRejectedValue(new Error('Cannot send messages to this user'));
    await expect(runtimeTick()).resolves.toBeDefined();
    expect(scene.user.send).toHaveBeenCalledTimes(1);
    const embed = scene.user.send.mock.calls[0][0].embeds[0].toJSON();
    expect(embed.fields[0].value).toContain('Test server');
    expect(embed.fields[1].value).toContain(`${new Date('2026-02-12').setHours(0, 0, 0, 0) / 1000}`);
    expect(scene.panel.suspendServer).not.toHaveBeenCalled();
});
test('expired runtime suspends the server and schedules deletion with its renewal settings', async () => {
    scene.panel.getRuntimeList.mockResolvedValue([runtime('2026-02-01')]);
    await runtimeTick();
    expect(scene.panel.suspendServer).toHaveBeenCalledWith(7);
    expect(scene.panel.addServerDeletion).toHaveBeenCalledWith('server-uuid', 30, scene.user.id, 100);
    expect(scene.panel.removeServerSuspensionList).toHaveBeenCalledWith('server-uuid');
    expect(scene.panel.deleteServer).not.toHaveBeenCalled();
});
test('expired deletion removes the server and both list entries', async () => {
    scene.panel.getDeletionList.mockResolvedValue([deletion('2026-02-10')]);
    await runtimeTick();
    expect(scene.panel.deleteServer).toHaveBeenCalledWith(7);
    expect(scene.panel.removeServerDeletionList).toHaveBeenCalledWith('server-uuid');
    expect(scene.panel.removeServerSuspensionList).toHaveBeenCalledWith('server-uuid');
});
test.each(['reminder', 'suspension', 'deletion'])('a server removed outside PDM is cleaned up during %s', async phase => {
    scene.panel.getServerIdentifier.mockResolvedValue(null);
    if (phase === 'deletion') scene.panel.getDeletionList.mockResolvedValue([deletion('2026-02-01')]);
    else scene.panel.getRuntimeList.mockResolvedValue([runtime(phase === 'reminder' ? '2026-02-12' : '2026-02-01')]);
    await runtimeTick();
    expect(scene.panel.removeServerSuspensionList).toHaveBeenCalledWith('server-uuid');
    expect(scene.panel.removeServerDeletionList).toHaveBeenCalledWith('server-uuid');
    expect(scene.panel.deleteServer).not.toHaveBeenCalled();
    expect(scene.panel.suspendServer).not.toHaveBeenCalled();
    expect(scene.user.send).not.toHaveBeenCalled();
});
