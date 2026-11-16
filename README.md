# 🎵 Music Bot (Telekaf HTML View)

Telegram music bot built with **Telegraf** + **Telekaf Rich Messages** + **Express** HTML player view.

## Features

| Feature | Description |
|---------|-------------|
| `/start` | Premium welcome card (telekaf rich message) |
| `/menu` | Commands page |
| `/play` | Add & play music (owner only) |
| `/pause` | Pause current track (owner only) |
| `/resume` | Resume playback (owner only) |
| `/skip` | Skip to next track (owner only) |
| `/queue` | Show current queue |
| `/current` | Show currently playing track |
| `/nowplaying` | Rich music player card with HTML player link |
| `/verify_join` | Verify join instructions |

## 🌐 HTML Player

Visit `${PUBLIC_URL}/player` for a full-screen music player UI with:
- Now playing info
- Pause / Resume / Skip controls
- Queue listing
- Server status & uptime

## Setup

```bash
git clone https://github.com/YOUR_USERNAME/music-bot.git
cd music-bot
npm install
cp .env.example .env
# Edit .env with your BOT_TOKEN and OWNER_ID
npm start
```

## Deploy on Render

1. Connect this repo to Render
2. Add env vars: `BOT_TOKEN`, `OWNER_ID`, `BRAND_NAME`, `PUBLIC_URL`, `DEV_TAG`
3. Deploy — bot starts polling automatically

## Tech Stack

- [Telegraf](https://telegraf.js.org/) — Telegram bot framework
- [@icanseeuanywhere/telekaf](https://github.com/icanseeuanywhere/telekaf) — Rich Messages
- [Express](https://expressjs.com/) — HTTP server + HTML player view

## Support

👤 `@DEV_AI_REMASTERED`
