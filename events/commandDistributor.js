/*
 * Copyright (c) 2025 Finn Wolf
 * All rights reserved.
 */

const { BaseInteraction, Client } = require("discord.js")
const { PanelManager } = require("../classes/panelManager")
const { BoosterManager } = require("./../classes/boosterManager")
const { CacheManager } = require("./../classes/cacheManager")
const { EconomyManager } = require("./../classes/economyManager")
const { LogManager } = require("./../classes/logManager")
const { DataBaseInterface } = require("./../classes/dataBaseInterface")
const { TranslationManager } = require("./../classes/translationManager")
const { GiftCodeManager } = require("./../classes/giftCodeManager")
const { EmojiManager } = require("./../classes/emojiManager")

const database = new DataBaseInterface()
const boosterManager = new BoosterManager()
const cacheManager = new CacheManager()
const economyManager = new EconomyManager()
const logManager = new LogManager()
const giftCodeManager = new GiftCodeManager()
const emojiManager = new EmojiManager();
const panel = new PanelManager(process.env.PTERODACTYL_API_URL, process.env.PTERODACTYL_API_KEY, process.env.PTERODACTYL_ACCOUNT_API_KEY)

const { MessageFlags } = require('discord.js');
const collectorButtons = new Set([
    'discord-blackjack-hitbtn', 'discord-blackjack-splitbtn', 'discord-blackjack-standbtn',
    'discord-blackjack-ddownbtn', 'discord-blackjack-cancelbtn',
    'pdm-bj-hit', 'pdm-bj-split', 'pdm-bj-stand', 'pdm-bj-double', 'pdm-bj-cancel',
    'A', 'B', 'C', 'D', 'overrideFalse', 'overrideTrue'
]);

module.exports = {
    name: 'interactionCreate',
    once: false,
    async execute(interaction, client) {
        if (!interaction.inGuild()) return;
        let handler;
        const id = interaction.commandName || interaction.customId;
        if (interaction.isChatInputCommand()) {
            handler = client.commands.get(id);
        } else if (interaction.isButton()) {
            if (collectorButtons.has(id)) return;
            handler = client.buttons.get(id);
        } else if (interaction.isStringSelectMenu()) {
            if (id === 'singleUseCodeSelect') return;
            handler = client.selectMenus.get(id);
        } else if (interaction.isModalSubmit()) {
            handler = client.modals.get(id);
        } else return;

        try {
            if (!handler || typeof handler.execute !== 'function') {
                await interaction.reply({ content: 'This action is no longer available. Please reopen the menu.', flags: MessageFlags.Ephemeral });
                return;
            }
            const translationManager = new TranslationManager(interaction.user.id);
            const t = key => translationManager.getTranslation(key);
            await handler.execute(interaction, client, panel, boosterManager, cacheManager,
                economyManager, logManager, database, t, giftCodeManager, emojiManager);
        } catch (error) {
            console.error(`Interaction "${id}" failed:`, error);
            try {
                const response = { content: 'Something went wrong. Please try again.' };
                if (interaction.deferred) await interaction.editReply({ ...response, embeds: [], components: [] });
                else if (interaction.replied) await interaction.followUp({ ...response, flags: MessageFlags.Ephemeral });
                else await interaction.reply({ ...response, flags: MessageFlags.Ephemeral });
            } catch (replyError) {
                console.error(`Could not report failure for "${id}":`, replyError);
            }
        }
    }
};
