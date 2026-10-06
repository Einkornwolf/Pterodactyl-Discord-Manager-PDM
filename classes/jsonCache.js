/*
 * Copyright (c) 2025 Finn Wolf
 * All rights reserved.
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const files = new Map();

/**
 * Read and cache a JSON file. Relative paths are resolved from the working directory.
 *
 * @param {string} filePath Absolute or relative path to the JSON file.
 * @returns {Promise<*>} The parsed JSON shared by concurrent callers.
 */
function readJson(filePath) {
    const absolutePath = path.resolve(filePath);

    if (!files.has(absolutePath)) {
        const pending = fs.readFile(absolutePath, 'utf8')
            .then(JSON.parse)
            .catch(error => {
                // Retry failed reads without deleting a newer entry after invalidation.
                if (files.get(absolutePath) === pending) {
                    files.delete(absolutePath);
                }
                throw error;
            });

        files.set(absolutePath, pending);
    }

    return files.get(absolutePath);
}

// Clear all cached files so the next request reads their current contents.
function clearJsonCache() {
    files.clear();
}

module.exports = { readJson, clearJsonCache };
