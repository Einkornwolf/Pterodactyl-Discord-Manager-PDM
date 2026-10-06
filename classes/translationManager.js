/*
 * Copyright (c) 2025 Finn Wolf
 * All rights reserved.
 */

const path = require('node:path');
const { DataBaseInterface } = require('./dataBaseInterface');
const { readJson } = require('./jsonCache');
const database = new DataBaseInterface();
const supportedLanguages = new Set(['en-US', 'de-DE', 'es-ES', 'fr-FR', 'nl-NL', 'pl-PL']);
const translationsDirectory = path.resolve(__dirname, '..', 'translations');

class TranslationManager {
    /**
     * Handles translation files and the user's language preference.
     *
     * @param {string} userId Discord user ID.
     */
    constructor(userId) {
        let languagePromise;

        // Use English when the configured default language is unsupported or missing.
        const getDefaultLanguage = () => {
            const defaultLanguage = process.env.DEFAULT_LANGUAGE;
            return supportedLanguages.has(defaultLanguage) ? defaultLanguage : 'en-US';
        };

        // Delete the user's language and invalidate the cached lookup.
        this.deleteUserLanguage = async () => {
            await database.deleteObject(`${userId}.language`);
            languagePromise = undefined;
        };

        // Validate and save the user's language before updating the cached lookup.
        this.saveUserLanguage = async code => {
            if (!supportedLanguages.has(code)) {
                throw new Error('Unsupported language');
            }

            await database.setUserValue(userId, '.language', code);
            languagePromise = Promise.resolve(code);
        };

        // Share one language lookup per manager; failed lookups can be retried.
        this.getUserLanguage = () => {
            if (!languagePromise) {
                languagePromise = database.getObject(userId)
                    .then(user => supportedLanguages.has(user?.language) ? user.language : getDefaultLanguage())
                    .catch(error => {
                        languagePromise = undefined;
                        throw error;
                    });
            }

            return languagePromise;
        };

        // Get the translation, falling back to English and then the key itself.
        this.getTranslation = async key => {
            const code = await this.getUserLanguage();
            const dictionary = await readJson(path.join(translationsDirectory, `${code}.json`));

            if (dictionary[key] != null) {
                return dictionary[key];
            }

            const englishDictionary = await readJson(path.join(translationsDirectory, 'en-US.json'));
            return englishDictionary[key] ?? key;
        };
    }
}

module.exports = { TranslationManager };
