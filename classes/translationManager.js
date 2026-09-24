/*
 * Copyright (c) 2025 Finn Wolf
 * All rights reserved.
 */

const { DataBaseInterface } = require('./dataBaseInterface');
const { readJson } = require('./jsonCache');
const database = new DataBaseInterface();
const languages = new Set(['en-US', 'de-DE', 'es-ES', 'fr-FR', 'nl-NL', 'pl-PL']);
class TranslationManager {
    constructor(userId) {
        let language;
        const fallback = () => languages.has(process.env.DEFAULT_LANGUAGE) ? process.env.DEFAULT_LANGUAGE : 'en-US';
        this.deleteUserLanguage = async () => {
            await database.deleteObject(`${userId}.language`);
            language = undefined;
        };
        this.saveUserLanguage = async code => {
            if (!languages.has(code)) throw new Error('Unsupported language');
            await database.setUserValue(userId, '.language', code);
            language = Promise.resolve(code);
        };
        this.getUserLanguage = () => {
            if (!language) language = database.getObject(userId)
                .then(user => languages.has(user?.language) ? user.language : fallback())
                .catch(error => { language = undefined; throw error; });
            return language;
        };
        this.getTranslation = async key => {
            const code = await this.getUserLanguage();
            const dictionary = await readJson(`${code}.json`);
            return dictionary[key] ?? (await readJson('en-US.json'))[key] ?? key;
        };
    }
}
module.exports = { TranslationManager };
