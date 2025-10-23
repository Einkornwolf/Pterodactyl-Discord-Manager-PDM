/*
 * Copyright (c) 2025 Finn Wolf
 * All rights reserved.
 */

const { PanelManager } = require("../../classes/panelManager")
const { TranslationManager } = require("./../../classes/translationManager")
const { BoosterManager } = require("../../classes/boosterManager")
const { CacheManager } = require("../../classes/cacheManager")
const { EconomyManager } = require("../../classes/economyManager")
const { LogManager } = require("../../classes/logManager")
const { DataBaseInterface } = require("./../../classes/dataBaseInterface")
const { EmojiManager } = require("../../classes/emojiManager")
const { BaseInteraction, Client, EmbedBuilder, MessageFlags } = require("discord.js")

module.exports = {
    customId: "claimBoosterReward",
    /**
     * 
     * Account manager select menu options
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
     * @param {EmojiManager} emojiManager
     * @returns
     */
    async execute(interaction, client, panel, boosterManager, cacheManager, economyManager, logManager, databaseInterface, t, giftCodeManager, emojiManager) {
        let { user: { id, tag }, user, member: { premiumSince }, guild } = interaction, fetchedUser = await user.fetch(true), { accentColor } = fetchedUser, userData = await databaseInterface.getObject(id)
        const serverIconURL = guild ? guild.iconURL({ dynamic: true }) : undefined

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        if (!userData) {
            await interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle(`${await emojiManager.getEmoji("emoji_error")} ${await t("errors.error_label")} ${await emojiManager.getEmoji("emoji_error")}`)
                        .setDescription(`${await emojiManager.getEmoji("emoji_arrow_down_right")} **${await t("account_manager_modal.booster_no_account_text")}**`)
                        .setColor(accentColor ? accentColor : 0xe6b04d)
                        .setFooter({ text: process.env.FOOTER_TEXT, iconURL: serverIconURL })
                        .setTimestamp()
                ],
                flags: MessageFlags.Ephemeral,
            });
            //Logging
            await logManager.logString(`${tag} tried to claim booster-rewards but failed due to him not having an account.`)
            return;
        }


        //Check if User has the Booster Role
        if (premiumSince == undefined) {
            //Reply to interaction
            await interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle(`${await emojiManager.getEmoji("emoji_error")} ${await t("errors.error_label")} ${await emojiManager.getEmoji("emoji_error")}`)
                        .setDescription(`${await emojiManager.getEmoji("emoji_arrow_down_right")} **${await t("account_manager_modal.booster_no_booster")}**`)
                        .setColor(accentColor ? accentColor : 0xe6b04d)
                        .setFooter({ text: process.env.FOOTER_TEXT, iconURL: serverIconURL })
                        .setTimestamp()
                ],
                flags: MessageFlags.Ephemeral,
            });
            //Logging
            await logManager.logString(`${tag} tried to claim booster-rewards but failed due to him not being a server-booster.`)
            return;
        }


        //Check if User already executed Booster Reward
        let boosterStatus = await boosterManager.getBoosterStatus(id)
        if (boosterStatus == true) {
            await interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle(`${await emojiManager.getEmoji("emoji_error")} ${await t("errors.error_label")} ${await emojiManager.getEmoji("emoji_error")}`)
                        .setDescription(`${await emojiManager.getEmoji("emoji_arrow_down_right")} ${await t("account_manager_modal.booster_already_claimed_text")}**`)
                        .setColor(accentColor ? accentColor : 0xe6b04d)
                        .setFooter({ text: process.env.FOOTER_TEXT, iconURL: serverIconURL })
                        .setTimestamp()
                ],
                flags: MessageFlags.Ephemeral,
            });
            //Logging
            await logManager.logString(`${tag} tried to claim booster-rewards but failed due to him already having received his reward.`)
            return;
        }

        //Add 150 Coins to User
        await economyManager.addCoins(id, 150)
        await boosterManager.setBoosterStatus(id, true)
        //Reply to interaction
        await interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setTitle(`${await emojiManager.getEmoji("emoji_logo")} ${await t("account_manager_modal.booster_success_label")}`)
                    .setDescription(`${await emojiManager.getEmoji("emoji_arrow_down_right")} **${await t("account_manager_modal.booster_success_text")}**`)
                    .setColor(accentColor ? accentColor : 0xe6b04d)
                    .setFooter({ text: process.env.FOOTER_TEXT, iconURL: serverIconURL })
                    .setTimestamp()
            ],
            flags: MessageFlags.Ephemeral,
        });
        //Logging
        await logManager.logString(`${tag} succesfully claimed booster-rewards of 150 Coins`)
        return;
    }
}