/*
 * Copyright (c) 2025 Finn Wolf
 * All rights reserved.
 */

const fs = require('node:fs/promises');
const path = require('node:path');

class LogManager {
    constructor(filePath = 'log/log.txt') {
        const logFile = path.resolve(filePath);

        this.getLogTimestamp = async function () {
            const date = new Date();
            const pad = number => String(number).padStart(2, '0');
            const offset = -date.getTimezoneOffset();
            const sign = offset < 0 ? '-' : '+';
            return `[${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
                `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())} UTC${sign}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}]`;
        };

        this.checkForLogFile = async function () {
            try { await fs.access(logFile); return true; }
            catch (error) {
                if (error.code === 'ENOENT') return false;
                throw error;
            }
        };

        this.createLogFile = async function () {
            await fs.mkdir(path.dirname(logFile), { recursive: true });
            await fs.appendFile(logFile, '');
            return true;
        };

        this.logString = async function (data = '') {
            await fs.mkdir(path.dirname(logFile), { recursive: true });
            await fs.appendFile(logFile, `${await this.getLogTimestamp()} ${data}\n`);
        };
    }
}

module.exports = { LogManager };
