import 'dotenv/config';
import { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

const { DISCORD_BOT_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID } = process.env;
if (!DISCORD_BOT_TOKEN || !DISCORD_CLIENT_ID || !DISCORD_GUILD_ID) {
  console.error('Missing DISCORD_BOT_TOKEN / DISCORD_CLIENT_ID / DISCORD_GUILD_ID in .env');
  process.exit(1);
}

const commands = [
  new SlashCommandBuilder()
    .setName('credits')
    .setDescription('Give or remove credits from a user')
    .addIntegerOption(o => o.setName('amount').setDescription('Amount (negative to remove)').setRequired(true).setMinValue(-100000).setMaxValue(100000))
    .addStringOption(o => o.setName('username').setDescription('lacosta username (preferred)').setRequired(false))
    .addUserOption(o => o.setName('user').setDescription('Discord user (must be linked)').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('whitelist')
    .setDescription('Grant a rank to a user for 30 days')
    .addStringOption(o => o.setName('role').setDescription('Rank to grant').setRequired(true)
      .addChoices(
        { name: 'gold',    value: 'gold' },
        { name: 'diamond', value: 'diamond' },
        { name: 'free (remove)', value: 'free' },
      ))
    .addStringOption(o => o.setName('username').setDescription('lacosta username (preferred)').setRequired(false))
    .addUserOption(o => o.setName('user').setDescription('Discord user (must be linked)').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Run a random giveaway')
    .addStringOption(o => o.setName('reward').setDescription('Reward type').setRequired(true)
      .addChoices(
        { name: 'credits', value: 'credits' },
        { name: 'gold',    value: 'gold' },
        { name: 'diamond', value: 'diamond' },
      ))
    .addIntegerOption(o => o.setName('winners').setDescription('Number of winners').setRequired(true).setMinValue(1).setMaxValue(500))
    .addIntegerOption(o => o.setName('amount').setDescription('Credit amount (only for reward=credits)').setRequired(false).setMinValue(1).setMaxValue(100000))
    .addStringOption(o => o.setName('duration').setDescription('Duration e.g. 30s, 10m, 2h, 1d – leave empty for instant draw').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Post the ticket panel in this channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(DISCORD_BOT_TOKEN);
console.log('Registering guild commands…');
await rest.put(Routes.applicationGuildCommands(DISCORD_CLIENT_ID, DISCORD_GUILD_ID), { body: commands });
console.log('✅ Registered:', commands.map(c => '/' + c.name).join(', '));