/*
 * Copyright (c) 2025 Finn Wolf
 * All rights reserved.
 */

const { TranslationManager } = require("../../classes/translationManager")
const { PanelManager } = require("../../classes/panelManager")
const { BoosterManager } = require("../../classes/boosterManager")
const { CacheManager } = require("../../classes/cacheManager")
const { EconomyManager } = require("../../classes/economyManager")
const { LogManager } = require("../../classes/logManager")
const { DataBaseInterface } = require("../../classes/dataBaseInterface")
const { BaseInteraction, Client, EmbedBuilder, ActionRowBuilder, ButtonBuilder, MessageFlags } = require("discord.js")
const { EmojiManager } = require("../../classes/emojiManager")


module.exports = {
    customId: "trivia",
    /**
     *
     * @param {BaseInteraction} interaction 
     * @param {Client} client
     * @param {PanelManager} panel 
     * @param {BoosterManager} boosterManager 
     * @param {CacheManager} cacheManager 
     * @param {EconomyManager} economyManager 
     * @param {LogManager} logManager 
     * @param {DataBaseInterface} databaseInterface
     * @param {TranslationManager} t
     * @param {GiftCodeManager} giftCodeManager
     * @param {EmojiManager} emojiManager
     */
    async execute(interaction, client, panel, boosterManager, cacheManager, economyManager, logManager, databaseInterface, t, giftCodeManager, emojiManager) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const user = interaction.user;
    const fetchedUser = await user.fetch(true);
    const { accentColor } = fetchedUser;
    const guild = interaction.guild;
    const serverIconURL = guild ? guild.iconURL({ dynamic: true }) : undefined;

        const difficultyEmbed = new EmbedBuilder()
            .setTitle(`${await emojiManager.getEmoji("emoji_logo")} ${await t("minigames_events.difficulty_label")}`)
            .setDescription(`>>> ${await emojiManager.getEmoji("emoji_arrow_down_right")} ${await t("minigames_events.difficulty_text")}`)
            .setColor(accentColor ? accentColor : 0xe6b04d)
            .setFooter({ text: process.env.FOOTER_TEXT, iconURL: serverIconURL })
            .setTimestamp()

        await interaction.editReply({
            embeds: [difficultyEmbed],
            components: [
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                    .setCustomId("triviaPlayerEasy")
                    .setLabel(`${await t("trivia.easy_button")}`)
                    .setStyle("Success"),

                    new ButtonBuilder()
                    .setCustomId("triviaPlayerMedium")
                    .setLabel(`${await t("trivia.medium_button")}`)
                    .setStyle("Primary"),

                    new ButtonBuilder()
                    .setCustomId("triviaPlayerHard")
                    .setLabel(`${await t("trivia.hard_button")}`)
                    .setStyle("Danger")
                )
            ],
            flags: MessageFlags.Ephemeral
        });
    }
}