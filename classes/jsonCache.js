const fs = require('node:fs/promises');
const path = require('node:path');
const files = new Map();
function readJson(filename) {
    const absolute = path.resolve(__dirname, '..', 'translations', filename);
    if (!files.has(absolute)) {
        const pending = fs.readFile(absolute, 'utf8').then(JSON.parse).catch(error => {
            if (files.get(absolute) === pending) files.delete(absolute);
            throw error;
        });
        files.set(absolute, pending);
    }
    return files.get(absolute);
}
function clearJsonCache() { files.clear(); }
module.exports = { readJson, clearJsonCache };
