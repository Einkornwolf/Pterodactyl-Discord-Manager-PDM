/*
 * Copyright (c) 2025 Finn Wolf
 * All rights reserved.
 */

const { Client } = require("discord.js");

module.exports = {
  customId: "ban",
  /**
   * Developer command for evaluation of javascript
   *
   * @param {Message} message
   * @param {Client} client
   */
  async execute(message, client) {
    switch (process.env.ADMIN_LIST && process.env.ADMIN_LIST.includes(message.author.id)) {
      case false:
        return;
      case true:
        break;
    }
    let { content } = message, banData = content.slice(10)
    // Get User by Discord ID
    // Check for mention
    let member
    let mention = message.mentions.members.first()
    if (mention != undefined) {
      member = mention
    } else {
      try {

        const user = await client.users.fetch(banData)
        member = message.guild ? await message.guild.members.fetch(user.id).catch(() => null) : null
        if (!member) member = user
      } catch (error) {
        message.channel.send("Error banning user: " + error)
        return
      }
    }

    (member)
      .ban({ reason: "Banned by Ptero-Manager" })
      .then(() => {
        message.channel.send("User Banned 💀")
      })
      .catch((error) => {
        message.channel.send("Error banning user: " + error)
      });
  },
};
