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
const { EmojiManager } = require("./../classes/emojiManager")
const { BaseInteraction, Client, EmbedBuilder, ActionRowBuilder, SlashCommandBuilder, ButtonBuilder, MessageFlags } = require("discord.js")

module.exports = {
  data: new SlashCommandBuilder()
    .setName("language")
    .setDescription("Choose your desired bot language"),
  /**
   * Lets users change their language
   * 
   * @param {BaseInteraction} interaction 
   * @param {Client} client 
   * @param {PanelManager} panel 
   * @param {BoosterManager} boosterManager 
   * @param {CacheManager} cacheManager 
   * @param {EconomyManager} economyManager 
   * @param {LogManager} logManager 
   * @param {TranslationManager} t
   * @param {EmojiManager} emojiManager
   * @returns 
   */
  async execute(interaction, client, panel, boosterManager, cacheManager, economyManager, logManager, databaseInterface, t, giftCodeManager, emojiManager) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral })
    let { guild, user } = interaction, fetchedUser = await user.fetch(true), { accentColor } = fetchedUser
    const serverIconURL = guild ? guild.iconURL({ dynamic: true }) : undefined
    
    //Reply to User and send Buttons
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle(`${await emojiManager.getEmoji("emoji_logo")} ${await t("language.language_label")}`)
          .setDescription(`${await emojiManager.getEmoji("emoji_arrow_down_right")} **${await t("language.language_text")}**`)
          .setColor(accentColor ? accentColor : 0xe6b04d)
          .setFooter({ text: process.env.FOOTER_TEXT, iconURL: serverIconURL })
          .setTimestamp()
      ],
      components: [
        new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setStyle("Success")
              .setLabel("🇩🇪 German")
              .setDisabled(false)
              .setCustomId("de"),
            new ButtonBuilder()
              .setStyle("Success")
              .setLabel("🇬🇧 English")
              .setDisabled(false)
              .setCustomId("en"),
            new ButtonBuilder()
              .setStyle("Success")
              .setLabel("🇫🇷 French")
              .setDisabled(false)
              .setCustomId("fr"),
            new ButtonBuilder()
              .setStyle("Success")
              .setLabel("🇪🇸 Spanish")
              .setDisabled(false)
              .setCustomId("es"),
            new ButtonBuilder()
              .setStyle("Success")
              .setLabel("🇳🇱 Dutch")
              .setDisabled(false)
              .setCustomId("nl"),
          ),
        new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setStyle("Success")
              .setLabel("🇵🇱 Polish")
              .setDisabled(false)
              .setCustomId("pl"),
          )
      ],
      flags: MessageFlags.Ephemeral
    });
  },
};