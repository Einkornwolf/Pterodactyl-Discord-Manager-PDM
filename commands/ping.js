/*
 * Copyright (c) 2025 Finn Wolf
 * All rights reserved.
 */

const { PanelManager } = require("../classes/panelManager")
const { TranslationManager } = require("./../classes/translationManager")
const { BoosterManager } = require("./../classes/boosterManager")
const { CacheManager } = require("./../classes/cacheManager")
const { EconomyManager } = require("./../classes/economyManager")
const { LogManager } = require("./../classes/logManager")
const { DataBaseInterface } = require("./../classes/dataBaseInterface")
const { EmojiManager } = require("./../classes/emojiManager")
const { BaseInteraction, Client, EmbedBuilder, SlashCommandBuilder, MessageFlags } = require("discord.js")

// Latenz oder Umlaufzeit
module.exports = {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Outputs the ping of the bot."),
    /**
     * Basic ping command
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
    //Reply to User
    let { guild, user } = interaction, fetchedUser = await user.fetch(true), { accentColor } = fetchedUser
    const serverIconURL = guild ? guild.iconURL({ dynamic: true }) : undefined
    
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
        .setTitle(`🏓 Pong`)
        .setColor(accentColor ? accentColor : 0xe6b04d)
        .addFields(
          {
            name: "Ping",
            value: `${interaction.client.ws.ping}ms`,
            inline: true,
          }
        )
        .setFooter({ text: process.env.FOOTER_TEXT, iconURL: serverIconURL })
        .setTimestamp()
      ],
      flags: MessageFlags.Ephemeral,
    });
  },
};
