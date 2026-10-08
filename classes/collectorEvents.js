const { MessageFlags } = require('discord.js');
function onAsync(collector, event, handler) {
    collector.on(event, (...args) => {
        Promise.resolve().then(() => handler(...args)).catch(async error => {
            console.error(`Collector ${event} failed:`, error);
            const interaction = args[0];
            if (typeof interaction?.isRepliable !== 'function' || !interaction.isRepliable()) return;
            try {
                const content = 'Something went wrong. Please try again.';
                if (interaction.deferred) await interaction.editReply({ content, embeds: [], components: [] });
                else if (interaction.replied) await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
                else await interaction.reply({ content, flags: MessageFlags.Ephemeral });
            } catch (replyError) { console.error('Could not report collector failure:', replyError); }
        });
    });
}
module.exports = { onAsync };
