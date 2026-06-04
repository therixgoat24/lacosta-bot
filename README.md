# Lacosta Discord Admin Bot

Slash commands for admins of lacosta-ai.com:
- `/credits user amount` — give or remove credits (negative amount = remove)
- `/whitelist user role` — grant `gold` / `diamond` rank for 30 days (or `free` to remove)
- `/giveaway reward winners [amount]` — pick random users and reward credits / gold / diamond

Only Discord users whose account is **linked to a lacosta profile AND has the `admin` role** can run these.

## Setup

### 1. Install
```bash
npm install
```
(Requires Node.js 18+)

### 2. Configure
Copy `.env.example` to `.env` and fill in:

- `DISCORD_BOT_TOKEN` — Discord Developer Portal → your app → Bot → Reset Token
- `DISCORD_CLIENT_ID` — Developer Portal → General Information → Application ID
- `DISCORD_GUILD_ID`  — your Discord server ID (enable Developer Mode → right-click server → Copy Server ID)
- `SUPABASE_URL` — already pre-filled
- `SUPABASE_SERVICE_ROLE_KEY` — get this from your lacosta backend (Lovable Cloud → backend settings)

### 3. Invite the bot to your server
Use this URL (replace `CLIENT_ID`):
```
https://discord.com/api/oauth2/authorize?client_id=CLIENT_ID&scope=bot+applications.commands&permissions=0
```

### 4. Register slash commands (once per change)
```bash
npm run register
```

### 5. Run the bot
```bash
npm start
```

You should see `✅ Logged in as YourBot#1234`. The commands appear in your server instantly.

## Hosting

Run anywhere with Node.js 18+: your laptop, a VPS, Railway, Fly.io, etc.
For 24/7 use a tiny VPS or Railway. The bot uses long polling (Discord Gateway) — no inbound ports needed.

## Security

- The service role key bypasses all RLS. Keep `.env` private.
- The bot re-checks admin status on every command — it doesn't trust Discord permissions alone.
