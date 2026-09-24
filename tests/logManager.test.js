const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { LogManager } = require('../classes/logManager');

test('logs to a newly created directory and propagates file errors', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pdm-log-'));
    try {
        const log = new LogManager(path.join(directory, 'subdir', 'log.txt'));
        expect(await log.checkForLogFile()).toBe(false);
        await log.logString('transfer completed');
        expect(await log.checkForLogFile()).toBe(true);
        expect(fs.readFileSync(path.join(directory, 'subdir', 'log.txt'), 'utf8')).toContain('transfer completed');
        const invalid = new LogManager(directory);
        await expect(invalid.logString('unwritable')).rejects.toThrow();
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});
