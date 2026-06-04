import { existsSync } from 'fs';
if (existsSync('.env')) {
  const { config } = await import('dotenv');
  config();
}
import { Client, GatewayIntentBits, EmbedBuilder, MessageFlags } from 'discord.js';

const {
  DISCORD_BOT_TOKEN,
  API_BASE_URL,
  BOT_API_TOKEN,
  ADMIN_DISCORD_IDS = '',
} = process.env;

if (!DISCORD_BOT_TOKEN || !API_BASE_URL || !BOT_API_TOKEN) {
  console.error('Missing env vars. See .env.example');
  process.exit(1);
}

const ALLOWED_ROLE_ID = '1498812095926501447';
const ADMIN_IDS = new Set(ADMIN_DISCORD_IDS.split(',').map(s => s.trim()).filter(Boolean));

// ---------- API helper ----------
async function api(action, params = {}) {
  const res = await fetch(`${API_BASE_URL}/api/public/bot/admin`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${BOT_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action, ...params }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.detail || data?.error || `HTTP ${res.status}`);
  return data;
}

async function lookup(discordId) {
  const res = await fetch(`${API_BASE_URL}/api/public/bot/lookup`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${BOT_API_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ discord_id: String(discordId) }),
  });
  return res.ok ? res.json() : { found: false, is_admin: false };
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// ---------- helpers ----------
function parseDuration(input) {
  if (!input) return 0;
  const s = String(input).trim().toLowerCase();
  // Accept formats like 30s, 10m, 2h, 1d, or combined "1h30m"
  const re = /(\d+)\s*(s|sec|secs|seconds|m|min|mins|minutes|h|hr|hrs|hours|d|day|days)/g;
  let total = 0, match, matched = false;
  while ((match = re.exec(s)) !== null) {
    matched = true;
    const n = parseInt(match[1], 10);
    const u = match[2];
    if (u.startsWith('s')) total += n * 1000;
    else if (u.startsWith('m') && !u.startsWith('mo')) total += n * 60_000;
    else if (u.startsWith('h')) total += n * 3_600_000;
    else if (u.startsWith('d')) total += n * 86_400_000;
  }
  if (!matched && /^\d+$/.test(s)) total = parseInt(s, 10) * 1000; // bare number = seconds
  return total;
}

function fmtDuration(ms) {
  if (ms <= 0) return '0s';
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return [d && `${d}d`, h && `${h}h`, m && `${m}m`, s && `${s}s`].filter(Boolean).join(' ') || '0s';
}

// ---------- admin resolution ----------
async function resolveAdmin(discordId, member) {
  if (ADMIN_IDS.has(discordId)) {
    return { ok: true, profile: { id: 'env-bypass', username: member?.user?.username ?? 'discord-admin' } };
  }
  const info = await lookup(discordId);
  if (!info.found) {
    return { ok: false, reason: 'Your Discord account is not linked to a lacosta account.\nAdd your Discord ID to `ADMIN_DISCORD_IDS` in `.env` to bypass linking.' };
  }
  if (!info.is_admin) {
    return { ok: false, reason: 'You are not an admin on lacosta.' };
  }
  return { ok: true, profile: { id: info.user.id, username: info.user.username } };
}

async function findTarget(interaction) {
  const username = interaction.options.getString('username');
  if (username) {
    const { target } = await api('find_target', { username });
    return { row: target, display: username, mention: target?.discord_id ? `<@${target.discord_id}>` : `\`${username}\`` };
  }
  const user = interaction.options.getUser('user');
  if (!user) return { row: null, display: null, mention: null };
  const { target } = await api('find_target', { discord_id: user.id });
  return { row: target, display: user.username, mention: `<@${user.id}>` };
}

// ---------- command handlers ----------
async function handleCredits(interaction, admin) {
  const amount = interaction.options.getInteger('amount', true);
  const t = await findTarget(interaction);
  if (!t.row) return interaction.editReply(`❌ Target user not found (provide \`username\` or a linked @user).`);

  try {
    await api('adjust_credits', { target_id: t.row.id, delta: amount });
  } catch (e) {
    return interaction.editReply(`❌ Failed: ${e.message}`);
  }

  const embed = new EmbedBuilder()
    .setColor(amount >= 0 ? 0xff69b4 : 0xef4444)
    .setTitle(amount >= 0 ? '💎 Credits granted' : '⚠️ Credits removed')
    .setDescription(`${t.mention} (\`${t.row.username}\`) ${amount >= 0 ? '+' : ''}${amount} credits`)
    .setFooter({ text: `by ${admin.profile.username}` })
    .setTimestamp();
  await interaction.editReply({ embeds: [embed] });
}

async function handleWhitelist(interaction, admin) {
  const rank = interaction.options.getString('role', true);
  if (!['free', 'gold', 'diamond'].includes(rank)) return interaction.editReply('❌ Invalid rank');

  const t = await findTarget(interaction);
  if (!t.row) return interaction.editReply(`❌ Target user not found (provide \`username\` or a linked @user).`);

  try {
    await api('set_rank', { target_id: t.row.id, rank });
  } catch (e) {
    return interaction.editReply(`❌ Failed: ${e.message}`);
  }

  const embed = new EmbedBuilder()
    .setColor(rank === 'diamond' ? 0x60a5fa : rank === 'gold' ? 0xfbbf24 : 0x6b7280)
    .setTitle(rank === 'free' ? '🗑️ Rank removed' : `${rank === 'diamond' ? '💎' : '👑'} Rank granted`)
    .setDescription(`${t.mention} (\`${t.row.username}\`) → **${rank}**${rank !== 'free' ? ' for 30 days' : ''}`)
    .setFooter({ text: `by ${admin.profile.username}` })
    .setTimestamp();
  await interaction.editReply({ embeds: [embed] });
}

async function drawAndAwardGiveaway({ reward, winners, amount, admin }) {
  const r = await api('list_eligible', { exclude_id: admin.profile.id !== 'env-bypass' ? admin.profile.id : null });
  const pool = r.users ?? [];
  if (pool.length === 0) return { picked: [], failures: [] };

  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const picked = pool.slice(0, Math.min(winners, pool.length));

  const failures = [];
  for (const w of picked) {
    try {
      if (reward === 'credits') {
        await api('adjust_credits', { target_id: w.id, delta: amount });
      } else {
        await api('set_rank', { target_id: w.id, rank: reward });
      }
    } catch (e) {
      failures.push(`${w.username}: ${e.message}`);
    }
  }
  return { picked, failures };
}

async function handleGiveaway(interaction, admin) {
  const reward = interaction.options.getString('reward', true);
  const winners = interaction.options.getInteger('winners', true);
  const amount = interaction.options.getInteger('amount');
  const durationStr = interaction.options.getString('duration');

  if (reward === 'credits' && (!Number.isInteger(amount) || amount < 1)) {
    return interaction.editReply('❌ For reward=credits you must provide `amount`.');
  }

  const durationMs = parseDuration(durationStr);
  const rewardLabel = reward === 'credits' ? `**${amount} credits**` : `**${reward}** rank (30d)`;

  // ===== Instant giveaway (no timer) =====
  if (durationMs <= 0) {
    let res;
    try {
      res = await drawAndAwardGiveaway({ reward, winners, amount, admin });
    } catch (e) {
      return interaction.editReply(`❌ Failed: ${e.message}`);
    }
    if (res.picked.length === 0) return interaction.editReply('❌ No eligible users.');

    const winnerList = res.picked
      .map(w => w.discord_id ? `<@${w.discord_id}> (\`${w.username}\`)` : `\`${w.username}\``)
      .join('\n');

    const embed = new EmbedBuilder()
      .setColor(0xec4899)
      .setTitle('🎉 Giveaway!')
      .setDescription(`Reward: ${rewardLabel}\nWinners: **${res.picked.length}**\n\n${winnerList}`)
      .setFooter({ text: `by ${admin.profile.username}` })
      .setTimestamp();

    return interaction.editReply({
      embeds: [embed],
      content: res.failures.length ? `⚠️ ${res.failures.length} failures (first: ${res.failures[0]})` : undefined,
    });
  }

  // ===== Timed giveaway =====
  const endsAt = Date.now() + durationMs;
  const endsUnix = Math.floor(endsAt / 1000);

  const announce = new EmbedBuilder()
    .setColor(0xec4899)
    .setTitle('🎉 Giveaway started!')
    .setDescription(
      `Reward: ${rewardLabel}\n` +
      `Winners: **${winners}**\n` +
      `Ends: <t:${endsUnix}:R> (<t:${endsUnix}:f>)\n\n` +
      `Winners will be drawn automatically when the timer ends.`
    )
    .setFooter({ text: `hosted by ${admin.profile.username}` })
    .setTimestamp();

  await interaction.editReply({ embeds: [announce] });

  setTimeout(async () => {
    try {
      const res = await drawAndAwardGiveaway({ reward, winners, amount, admin });
      if (res.picked.length === 0) {
        const ended = new EmbedBuilder()
          .setColor(0xef4444)
          .setTitle('🎉 Giveaway ended')
          .setDescription(`Reward: ${rewardLabel}\n\n❌ No eligible users.`)
          .setFooter({ text: `hosted by ${admin.profile.username}` })
          .setTimestamp();
        await interaction.editReply({ embeds: [ended] }).catch(() => {});
        return;
      }
      const winnerList = res.picked
        .map(w => w.discord_id ? `<@${w.discord_id}> (\`${w.username}\`)` : `\`${w.username}\``)
        .join('\n');

      const ended = new EmbedBuilder()
        .setColor(0xec4899)
        .setTitle('🎉 Giveaway ended!')
        .setDescription(
          `Reward: ${rewardLabel}\n` +
          `Duration: **${fmtDuration(durationMs)}**\n` +
          `Winners: **${res.picked.length}**\n\n${winnerList}`
        )
        .setFooter({ text: `hosted by ${admin.profile.username}` })
        .setTimestamp();

      const mentions = res.picked
        .filter(w => w.discord_id)
        .map(w => `<@${w.discord_id}>`)
        .join(' ');

      await interaction.editReply({
        embeds: [ended],
        content: [
          mentions ? `🏆 Congrats ${mentions}!` : null,
          res.failures.length ? `⚠️ ${res.failures.length} failures (first: ${res.failures[0]})` : null,
        ].filter(Boolean).join('\n') || undefined,
      }).catch(() => {});
    } catch (e) {
      console.error('Giveaway end error:', e);
      await interaction.editReply(`❌ Giveaway ended with error: ${e.message}`).catch(() => {});
    }
  }, durationMs);
}

// ---------- router ----------
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  try {
    const member = interaction.member;
    const hasRole =
      member &&
      (typeof member.roles?.cache?.has === 'function'
        ? member.roles.cache.has(ALLOWED_ROLE_ID)
        : Array.isArray(member.roles) && member.roles.includes(ALLOWED_ROLE_ID));

    if (!hasRole) {
      return interaction.reply({
        content: `🚫 You need the <@&${ALLOWED_ROLE_ID}> role to use this command.`,
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
      });
    }

    const ephemeral = interaction.commandName !== 'giveaway';
    await interaction.deferReply(ephemeral ? { flags: MessageFlags.Ephemeral } : {});

    const admin = await resolveAdmin(interaction.user.id, member);
    if (!admin.ok) return interaction.editReply(`🚫 ${admin.reason}`);

    if (interaction.commandName === 'credits')   return handleCredits(interaction, admin);
    if (interaction.commandName === 'whitelist') return handleWhitelist(interaction, admin);
    if (interaction.commandName === 'giveaway')  return handleGiveaway(interaction, admin);

    await interaction.editReply('Unknown command.');
  } catch (err) {
    console.error(err);
    const msg = `❌ Error: ${err?.message ?? 'unknown'}`;
    if (interaction.deferred || interaction.replied) await interaction.editReply(msg).catch(() => {});
    else await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral }).catch(() => {});
  }
});

client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag} | role gate: ${ALLOWED_ROLE_ID} | admin bypass IDs: ${[...ADMIN_IDS].join(',') || '(none)'}`);
});

await client.login(DISCORD_BOT_TOKEN);