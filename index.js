#!/usr/bin/env node
/**
 * ═════════════════════════════════════════════════════════════════
 *  MUSIC BOT — Telekaf HTML View Edition (with yt-dlp audio)
 *  Telegraf + Telekaf Rich Messages + Express HTML Music Player
 *
 *  • /start — Welcome card + inline buttons (Menu, Add to Channel, Contact Owner)
 *  • /menu — Commands page
 *  • /play <query|url> — Search yt-dlp and send audio (owner only)
 *  • /pause /resume — Pause/resume playback (owner only)
 *  • /skip — Skip to next track (owner only)
 *  • /queue — Show current queue
 *  • /current — Show currently playing track
 *  • /nowplaying — Rich music player card with HTML player link
 *  • /verify_join — Verify join instructions
 *  • Built-in keep-alive HTTP server for Render
 *
 *  Deploy deps (Render build command or Dockerfile):
 *    apt-get install -y ffmpeg
 *    npm install -g yt-dlp   (or pip install yt-dlp)
 *
 *  Setup:
 *    1. npm install
 *    2. cp .env.example .env
 *    3. npm start
 * ═════════════════════════════════════════════════════════════════
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync, execFile } = require('child_process');
const express = require('express');
const { Telegraf, RichMessage } = require('@icanseeuanywhere/telekaf');

const RH = RichMessage.RichHTMLBuilder;

// ───────────────── .env loader ─────────────────
(function loadEnv(file = '.env') {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const idx = line.indexOf('=');
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim().replace(/^[\"']|[\"']$/g, '');
    if (!(key in process.env)) process.env[key] = value;
  }
})();

// ───────────────── Config ─────────────────
const BOT_TOKEN = process.env.BOT_TOKEN || '';
const OWNER_ID = Number(process.env.OWNER_ID || 0);
const BRAND_NAME = process.env.BRAND_NAME || 'MUSIC BOT';
const BRAND_LINK = process.env.BRAND_LINK || '';
const DEV_TAG = process.env.DEV_TAG || '@DEV_AI_REMASTERED';
const BOT_USERNAME = process.env.BOT_USERNAME || '';
const PORT = Number(process.env.PORT || 3000);
const PUBLIC_URL = (process.env.PUBLIC_URL || 'https://music-bot.onrender.com').replace(/\/+$/, '');
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'music_data.json');
const DOWNLOAD_DIR = process.env.DOWNLOAD_DIR || path.join(__dirname, 'downloads');

if (!BOT_TOKEN) { console.error('❌ Missing BOT_TOKEN'); process.exit(1); }
if (!OWNER_ID) { console.error('❌ Missing OWNER_ID'); process.exit(1); }

fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

const START_TS = Date.now();
const DIVIDER = '⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯';

// Inline keyboard — Fallen Music style: Add me to your group, Help, Support + Channel, Source
const INLINE_KEYBOARD = {
  inline_keyboard: [
    [
      { text: 'Add me to your group', url: `https://t.me/${BOT_USERNAME || 'BOT_USERNAME'}?startgroup=true` }
    ],
    [
      { text: 'Help', callback_data: 'help' }
    ],
    [
      { text: 'Support', url: `tg://user?id=${OWNER_ID}` },
      { text: 'Channel', url: 'https://t.me/DevXMusic' }
    ],
    [
      { text: 'Source', url: 'https://github.com/selbgt/music-bot' }
    ]
  ]
};

const FANCY = (() => {
  const build = (up, low, dig) => {
    const map = {};
    for (let i = 0; i < 26; i++) {
      map[String.fromCharCode(65 + i)] = String.fromCodePoint(up + i);
      map[String.fromCharCode(97 + i)] = String.fromCodePoint(low + i);
    }
    for (let i = 0; i < 10; i++) map[String.fromCharCode(48 + i)] = String.fromCodePoint(dig + i);
    return map;
  };
  const fonts = {
    bold: build(0x1D400, 0x1D41A, 0x1D7CE),
    sans: build(0x1D5D4, 0x1D5EE, 0x1D7EC),
    mono: build(0x1D670, 0x1D68A, 0x1D7F6),
    script: build(0x1D4D0, 0x1D4EA, 0x1D7CE),
    fraktur: build(0x1D504, 0x1D51E, 0x1D7CE),
    double: build(0x1D538, 0x1D552, 0x1D7CE),
    bfractur: build(0x1D56C, 0x1D586, 0x1D7CE),
  };
  return (text, font = 'bold') => {
    const m = fonts[font] || fonts.sans;
    return String(text).split('').map((c) => m[c] || c).join('');
  };
})();

const htmlEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\"/g, '&quot;');

function log(type, ...msg) {
  console.log(`[${new Date().toISOString()}] [${String(type).toUpperCase()}]`, ...msg);
}

function getRuntime() {
  const d = Math.floor((Date.now() - START_TS) / 1000);
  const days = Math.floor(d / 86400);
  const hours = Math.floor((d % 86400) / 3600);
  const mins = Math.floor((d % 3600) / 60);
  return `${days}d ${hours}h ${mins}m`;
}

// ───────────────── yt-dlp helpers ─────────────────
function ytdlSearch(query) {
  try {
    const out = execSync(
      `yt-dlp --flat-playlist --print "%(title)s||%(duration_string)s||%(webpage_url)s" --max-downloads 1 "ytsearch1:${query}"`,
      { encoding: 'utf8', timeout: 30000 }
    ).trim();
    const [title, duration, url] = out.split('||');
    return { title: title || 'Unknown', duration: duration || 'Unknown', url: url || '' };
  } catch (e) {
    log('warn', 'yt-dlp search failed:', e && e.stderr ? e.stderr.toString().slice(0, 200) : e.message);
    return null;
  }
}

function ytdlDownload(url) {
  const outFile = path.join(DOWNLOAD_DIR, `%(title)s.%(ext)s`);
  try {
    execSync(
      `yt-dlp -x --audio-format mp3 --audio-quality 0 --output "${outFile}" --print "%(title)s||%(duration_string)s||%(filename)s" "${url}"`,
      { encoding: 'utf8', timeout: 120000 }
    );
    // yt-dlp prints title||duration||filename on last line
    const out = execSync(
      `yt-dlp -x --audio-format mp3 --audio-quality 0 --output "${outFile}" --print "%(title)s||%(duration_string)s||%(filename)s" "${url}"`,
      { encoding: 'utf8', timeout: 120000 }
    ).trim();
    const [title, duration, filename] = out.split('||');
    return { title: title || 'Unknown', duration: duration || 'Unknown', file: filename || '' };
  } catch (e) {
    log('warn', 'yt-dlp download failed:', e && e.stderr ? e.stderr.toString().slice(0, 200) : e.message);
    return null;
  }
}

function formatDuration(secOrStr) {
  if (typeof secOrStr === 'string' && secOrStr.includes(':')) return secOrStr;
  const s = Number(secOrStr) || 0;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem.toString().padStart(2, '0')}`;
}

// ───────────────── Music Data ─────────────────
function loadData() {
  try {
    if (!fs.existsSync(DATA_FILE)) return { queue: [], current: { index: -1, playing: false, track: null } };
    const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return { queue: raw.queue || [], current: raw.current || { index: -1, playing: false, track: null } };
  } catch (e) {
    log('error', 'Failed to load data:', e.message);
    return { queue: [], current: { index: -1, playing: false, track: null } };
  }
}

const music = loadData();

function saveData() {
  try {
    const tmp = DATA_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(music, null, 2));
    fs.renameSync(tmp, DATA_FILE);
  } catch (e) {
    log('error', 'Failed to save data:', e.message);
  }
}

// ───────────────── Rich card helpers ─────────────────
function cardShell(title, bodyHtml) {
  return (
    `<b>╭${'━'.repeat(26)}╮</b>\n   ${title}\n<b>╰${'━'.repeat(26)}╯</b>\n\n` +
    `<blockquote>${bodyHtml}</blockquote>`
  );
}

// ───────────────── Telekaf Rich Message Sender ─────────────────
async function sendRichCard(ctx, chatId, built, fallbackHtml, extra = {}, opts = {}) {
  const tg = ctx.telegram;
  const normalizedBuilt = built && typeof built.build === 'function' ? built.build() : built;
  const attempt = async (label, fn) => {
    try {
      return await fn();
    } catch (e) {
      log('warn', `${label} failed for chat ${chatId}:`, e && e.message ? e.message : e);
      return null;
    }
  };

  const richExtra = { ...extra, ...(extra.reply_markup !== undefined ? {} : { reply_markup: INLINE_KEYBOARD }) };

  if (tg.sendRichMessage) {
    const withEffect = await attempt('rich+effect', () =>
      tg.sendRichMessage(chatId, normalizedBuilt, { ...richExtra, message_effect_id: '5046509860389126442' })
    );
    if (withEffect) return withEffect;
    const plainRich = await attempt('rich', () => tg.sendRichMessage(chatId, normalizedBuilt, richExtra));
    if (plainRich) return plainRich;
  }
  const htmlMsg = await attempt('html', () =>
    tg.sendMessage(chatId, fallbackHtml, { parse_mode: 'HTML', ...extra })
  );
  if (htmlMsg) return htmlMsg;
  const plainMsg = await attempt('plain', () =>
    tg.sendMessage(chatId, fallbackHtml.replace(/<[^>]+>/g, ''), extra)
  );
  if (!plainMsg) log('error', 'Could not deliver message to chat', chatId);
  return plainMsg;
}

// ───────────────── Express App (HTML Music View + Keep-alive) ─────────────────
const app = express();
app.use(express.json());

app.get('/ping', (req, res) => res.json({ status: 'alive', uptime: getRuntime() }));
app.get('/health', (req, res) => res.json({ status: 'ok', brand: BRAND_NAME, uptime: getRuntime() }));

// HTML Music Player View
app.get('/player', (req, res) => {
  const current = music.current.track || null;
  const queue = music.queue;
  const playing = music.current.playing;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${htmlEsc(BRAND_NAME)} — Music Player</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; padding: 20px; color: #fff; }
  .container { max-width: 500px; margin: 0 auto; background: rgba(255,255,255,0.1); border-radius: 20px; padding: 30px; backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.2); }
  h1 { font-size: 2rem; margin-bottom: 20px; text-align: center; text-shadow: 2px 2px 4px rgba(0,0,0,0.3); }
  .track-card { background: rgba(0,0,0,0.2); border-radius: 15px; padding: 25px; margin-bottom: 25px; border: 1px solid rgba(255,255,255,0.1); }
  .track-info h2 { font-size: 1.3rem; margin-bottom: 5px; }
  .track-info p { color: #ccc; font-size: 0.9rem; margin-bottom: 10px; }
  .controls { display: flex; justify-content: center; gap: 15px; margin-top: 25px; }
  button { background: #fff; color: #667eea; border: none; padding: 12px 24px; border-radius: 50px; font-weight: 600; cursor: pointer; transition: all 0.3s; font-size: 0.9rem; }
  button:hover { transform: translateY(-2px); box-shadow: 0 5px 15px rgba(0,0,0,0.2); }
  button:active { transform: translateY(0); }
  button.pause { background: #e74c3c; color: #fff; }
  button.skip { background: #f39c12; color: #fff; }
  .queue { margin-top: 30px; }
  .queue h3 { margin-bottom: 15px; color: #ffd700; }
  .queue-item { background: rgba(255,255,255,0.1); border-radius: 10px; padding: 10px 15px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; }
  .queue-item:last-child { margin-bottom: 0; }
  .queue-item.active { background: rgba(255,215,0,0.2); border-left: 4px solid #ffd700; }
  .status { text-align: center; margin: 15px 0; font-size: 0.9rem; color: #ddd; }
  .status.online { color: #2ecc71; }
  .footer { text-align: center; margin-top: 30px; font-size: 0.8rem; color: #aaa; }
</style>
</head>
<body>
  <div class="container">
    <h1>🎵 ${htmlEsc(BRAND_NAME)}</h1>
    <div class="status">Server: <span class="online">● ONLINE</span> | Uptime: ${getRuntime()}</div>
    <div class="track-card">
      <div class="track-info">
        ${current ? `<h2>🎧 ${htmlEsc(current.title)}</h2><p>By: ${htmlEsc(current.artist || 'Unknown')}</p><p>Duration: ${current.duration || 'Unknown'}</p>` : '<h2>No track playing</h2><p>Use /play to add music</p>'}
      </div>
      <div class="controls">
        ${playing ? '<button class="pause" onclick="fetch(\'/pause\')">⏸ Pause</button>' : '<button onclick="fetch(\'/resume\')">▶ Resume</button>'}
        <button class="skip" onclick="fetch(\'/skip\')">⏭ Skip</button>
      </div>
    </div>
    <div class="queue">
      <h3>📋 Queue (${queue.length})</h3>
      ${queue.map((t, i) => `
        <div class="queue-item ${i === music.current.index ? 'active' : ''}">
          <span>${i + 1}. ${htmlEsc(t.title)}</span>
          <span style="font-size:0.8rem;color:#aaa">${htmlEsc(t.artist || 'Unknown')}</span>
        </div>
      `).join('') || '<p style="color:#999">Queue is empty</p>'}
    </div>
    <div class="footer">
      ${BRAND_NAME} — Telekaf Music Bot<br>
      Support: ${DEV_TAG}
    </div>
  </div>
</body>
</html>`;
  res.send(html);
});

// API endpoints for music control
app.post('/play', (req, res) => {
  const { title, artist, url, duration } = req.body || {};
  if (!title || !url) return res.status(400).json({ error: 'title and url required' });
  music.queue.push({ title, artist: artist || 'Unknown', url, duration: duration || 'Unknown', addedBy: 'api' });
  if (music.current.index === -1) {
    music.current.index = 0;
    music.current.playing = true;
    music.current.track = music.queue[0];
  }
  saveData();
  res.json({ status: 'ok', added: title, queueLength: music.queue.length });
});

app.post('/pause', (req, res) => {
  music.current.playing = false;
  saveData();
  res.json({ status: 'paused' });
});

app.post('/resume', (req, res) => {
  music.current.playing = true;
  saveData();
  res.json({ status: 'resumed' });
});

app.post('/skip', (req, res) => {
  if (music.queue.length === 0) return res.status(400).json({ error: 'queue empty' });
  music.current.index = (music.current.index + 1) % music.queue.length;
  music.current.playing = true;
  music.current.track = music.queue[music.current.index];
  saveData();
  res.json({ status: 'skipped', track: music.current.track });
});

app.get('/current', (req, res) => res.json(music.current));
app.get('/queue', (req, res) => res.json(music.queue));

const server = app.listen(PORT, '0.0.0.0', () =>
  log('success', `Music server listening on 0.0.0.0:${PORT}  (/ping, /player, /play, /pause, /skip)`)
);

// ───────────────── Telegram Bot ─────────────────
const bot = new Telegraf(BOT_TOKEN);

// Middleware: super reactions on private messages
bot.use(async (ctx, next) => {
  try {
    const msg = ctx.message;
    if (msg && msg.message_id && ctx.chat && ctx.chat.type === 'private' && !msg.from?.is_bot) {
      // silent reaction placeholder
    }
  } catch (e) { /* silent */ }
  return next();
});

// Welcome image (single image per constraints)
const WELCOME_IMAGE_URL = 'https://files.catbox.moe/ogifpu.jpg';

// Owner login — stored session for voice call assistant
let ownerSession = process.env.OWNER_SESSION || null;
let ownerApiId = process.env.OWNER_API_ID || null;
let ownerApiHash = process.env.OWNER_API_HASH || null;

// /start — Telekaf rich welcome card (Fallen Music style)
bot.start(async (ctx) => {
  try {
    const built = new RH()
      .photo(WELCOME_IMAGE_URL)
      .heading(1, `🎵 ${FANCY(BRAND_NAME.toUpperCase(), 'bold')}`)
      .paragraph(`Hey 🎵 ${FANCY(BRAND_NAME, 'bold')}!`)
      .paragraph(`This is **${BRAND_NAME}!**`)
      .paragraph(`A music player bot with some awesome and useful features.`)
      .paragraph(`Click on the help button for more info.`)
      .divider()
      .paragraph(`🤖 ${FANCY(BRAND_NAME, 'bold')}`);

    const fallback =
      `Hey 🎵 ${BRAND_NAME}!\n\n` +
      `This is ${BRAND_NAME}!\n\n` +
      `A music player bot with some awesome and useful features.\n\n` +
      `Click on the help button for more info.\n\n` +
      `🤖 ${BRAND_NAME}`;

    const msg = await sendRichCard(ctx, ctx.chat.id, built, fallback, { reply_markup: INLINE_KEYBOARD }, { celebration: true });
    if (msg && msg.message_id) {
      try {
        await ctx.telegram.setMessageReaction({ chat_id: ctx.chat.id, message_id: msg.message_id, reaction: [{ type: 'emoji', emoji: '🎵' }] });
      } catch (reErr) {
        log('warn', 'Reaction failed for /start:', reErr && reErr.message ? reErr.message : reErr);
      }
    }
  } catch (e) {
    log('warn', '/start sendRichCard failed:', e && e.message ? e.message : e);
    try {
      await ctx.reply(fallback.replace(/\*\*/g, ''), { reply_markup: INLINE_KEYBOARD });
    } catch (fbErr) {
      log('warn', '/start fallback reply failed:', fbErr && fbErr.message ? fbErr.message : fbErr);
    }
  }
});

// /login — Owner login for voice call assistant
bot.command('login', async (ctx) => {
  if (ctx.from.id !== OWNER_ID) {
    await ctx.reply('⚠️ Only the owner can use /login.');
    return;
  }
  const parts = ctx.message.text.split(/\s+/).slice(1);
  if (parts.length < 3) {
    await ctx.reply(
      `❌ **Usage:** /login <API_ID> <API_HASH> <SESSION_STRING>\n\n` +
      `Get API_ID & API_HASH from my.telegram.org/apps\n` +
      `Get SESSION_STRING from @StringFatherBot`
    );
    return;
  }
  ownerApiId = parts[0];
  ownerApiHash = parts[1];
  ownerSession = parts[2];
  await ctx.reply(
    `✅ **Owner Login Saved!**\n\n` +
    `API_ID: ${ownerApiId}\n` +
    `API_HASH: ${ownerApiHash}\n` +
    `SESSION: ${ownerSession.substring(0, 10)}...\n\n` +
    `Voice call assistant is ready.`
  );
});

// /logout — Clear owner session
bot.command('logout', async (ctx) => {
  if (ctx.from.id !== OWNER_ID) {
    await ctx.reply('⚠️ Only the owner can use /logout.');
    return;
  }
  ownerSession = null;
  ownerApiId = null;
  ownerApiHash = null;
  await ctx.reply('✅ Owner session cleared.');
});

// /assistant — Check assistant status
bot.command('assistant', async (ctx) => {
  const status = ownerSession ? '✅ Active' : '❌ Not Logged In';
  await ctx.reply(
    `🤖 **Voice Call Assistant**\n\n` +
    `Status: ${status}\n` +
    `Owner: ${OWNER_ID}\n\n` +
    `Use /login to set up assistant for voice calls.`
  );
});

// /menu — commands page
bot.command('menu', async (ctx) => {
  try {
    const built = new RH()
      .heading(2, '⌨️ COMMANDS')
      .table(
        [
          ['Command', 'What it does'],
          ['/start', 'Welcome card'],
          ['/play', 'Play music'],
          ['/pause', 'Pause current track'],
          ['/resume', 'Resume playback'],
          ['/skip', 'Skip to next track'],
          ['/queue', 'Show current queue'],
          ['/current', 'Show currently playing track'],
          ['/nowplaying', 'Open rich music player card'],
        ],
        { bordered: true, striped: true, hasHeader: true, compact: true }
      );

    const fallback =
      `<b>『 ${FANCY(BRAND_NAME.toUpperCase(), 'bold')} 』</b>\n${DIVIDER}\n\n` +
      `⌨️ <b>COMMANDS</b>\n\n` +
      `• /start — Welcome card\n` +
      `• /play — Play music\n` +
      `• /pause — Pause\n` +
      `• /resume — Resume\n` +
      `• /skip — Skip track\n` +
      `• /queue — Show queue\n` +
      `• /current — Current track\n` +
      `• /nowplaying — Open player card\n\n` +
      `🌐 HTML Player: ${PUBLIC_URL}/player`;

    const msg = await sendRichCard(ctx, ctx.chat.id, built, fallback, { reply_markup: INLINE_KEYBOARD }, { celebration: false });
    try {
      await ctx.telegram.setMessageReaction({ chat_id: ctx.chat.id, message_id: msg.message_id, reaction: [{ type: 'emoji', emoji: '⌨️' }] });
    } catch (reErr) {
      log('warn', 'Reaction failed for /menu:', reErr && reErr.message ? reErr.message : reErr);
    }
  } catch (e) {
    log('warn', '/menu command failed:', e && e.message ? e.message : e);
    try {
      await ctx.reply('⚠️ Menu failed to load. Try again.', { parse_mode: 'HTML' });
    } catch (fbErr) {
      log('warn', '/menu fallback reply failed:', fbErr && fbErr.message ? fbErr.message : fbErr);
    }
  }
});

// Inline button: Help callback
bot.action('help', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    const helpText =
      `🎵 **${BRAND_NAME} — Help**\n\n` +
      `**Commands:**\n` +
      `• /play <song> — Play audio in voice chat\n` +
      `• /vplay <song> — Play video in voice chat\n` +
      `• /skip — Skip current track\n` +
      `• /stop — Stop & leave voice chat\n` +
      `• /pause — Pause playback\n` +
      `• /resume — Resume playback\n` +
      `• /queue — Show current queue\n` +
      `• /current — Show currently playing track\n` +
      `• /nowplaying — Open rich music player card\n` +
      `• /menu — Show this commands page\n\n` +
      `🤖 **${BRAND_NAME}**`;

    await ctx.editMessageText(helpText, { parse_mode: 'Markdown', reply_markup: INLINE_KEYBOARD });
  } catch (e) {
    log('warn', 'Help callback failed:', e && e.message ? e.message : e);
    try {
      await ctx.answerCbQuery('⚠️ Help failed to load.');
    } catch (_) { /* silent */ }
  }
});

// Inline button: Menu callback
bot.action('menu', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    const menuText =
      `⌨️ **${BRAND_NAME} — Commands**\n\n` +
      `• /start — Welcome card\n` +
      `• /play — Play music\n` +
      `• /vplay — Play video\n` +
      `• /pause — Pause current track\n` +
      `• /resume — Resume playback\n` +
      `• /skip — Skip to next track\n` +
      `• /stop — Stop & leave voice chat\n` +
      `• /queue — Show current queue\n` +
      `• /current — Show currently playing track\n` +
      `• /nowplaying — Open rich music player card\n\n` +
      `🌐 HTML Player: ${PUBLIC_URL}/player\n\n` +
      `🤖 **${BRAND_NAME}**`;

    await ctx.editMessageText(menuText, { parse_mode: 'Markdown', reply_markup: INLINE_KEYBOARD });
  } catch (e) {
    log('warn', 'Menu callback failed:', e && e.message ? e.message : e);
    try {
      await ctx.answerCbQuery('⚠️ Menu failed to load.');
    } catch (_) { /* silent */ }
  }
});

// /play — search yt-dlp and send audio
bot.command('play', async (ctx) => {
  if (ctx.from.id !== OWNER_ID) {
    await ctx.reply('⚠️ Only the owner can add music.');
    return;
  }
  const text = ctx.message.text;
  const parts = text.split(/\s+/).slice(1);
  const query = parts.join(' ').trim();

  if (!query && !ctx.message.reply_to_message) {
    const built = new RH()
      .heading(2, '⚠️ USAGE')
      .paragraph(`Send: <code>/play Song Name</code> or <code>/play https://youtube.com/...</code>\nOr reply to an audio file with <code>/play</code>`);
    const fallback = `⚠️ USAGE\n\nSend: /play Song Name or /play https://youtube.com/...\nOr reply to an audio file with /play`;
    await sendRichCard(ctx, ctx.chat.id, built, fallback, {}, { celebration: false });
    return;
  }

  let title = 'Unknown', artist = 'Unknown', url = '', duration = 'Unknown', filePath = '';

  if (ctx.message.reply_to_message && ctx.message.reply_to_message.audio) {
    const audio = ctx.message.reply_to_message.audio;
    title = audio.title || audio.file_name || 'Unknown';
    artist = audio.performer || 'Unknown';
    duration = formatDuration(audio.duration);
    // file_id for replaying later
    url = `tg://audio/${audio.file_id}`;
    filePath = `tg://audio/${audio.file_id}`;
  } else if (query.startsWith('http://') || query.startsWith('https://')) {
    // Direct URL — download via yt-dlp
    const status = await ctx.reply('⬇️ Downloading audio…');
    const result = ytdlDownload(query);
    if (!result) {
      await ctx.editMessageText('❌ Failed to download audio. Check the URL.');
      return;
    }
    title = result.title;
    duration = result.duration;
    url = query;
    filePath = result.file || '';
    await ctx.deleteMessage().catch(() => {});
  } else {
    // Search query
    const status = await ctx.reply('🔍 Searching…');
    const result = ytdlSearch(query);
    if (!result) {
      await ctx.editMessageText('❌ No results found.');
      return;
    }
    title = result.title;
    duration = result.duration;
    url = result.url;
    // Download the found URL
    const status2 = await ctx.reply('⬇️ Downloading audio…');
    const downloaded = ytdlDownload(url);
    if (downloaded) {
      title = downloaded.title;
      duration = downloaded.duration;
      filePath = downloaded.file || '';
    }
    await ctx.deleteMessage().catch(() => {});
    await ctx.deleteMessage(status2.message_id).catch(() => {});
  }

  music.queue.push({ title, artist, url, duration, filePath, addedBy: ctx.from.first_name || 'User' });
  if (music.current.index === -1) {
    music.current.index = 0;
    music.current.playing = true;
    music.current.track = music.queue[0];
  }
  saveData();

  const built = new RH()
    .heading(2, '✅ TRACK ADDED')
    .paragraph(`<b>${htmlEsc(title)}</b> by <b>${htmlEsc(artist)}</b>`)
    .paragraph(`Duration: <code>${duration}</code>`)
    .paragraph(`Position in queue: <code>${music.queue.length}</code>`);
  const fallback =
    `<b>『 ${FANCY(BRAND_NAME.toUpperCase(), 'bold')} 』</b>\n${DIVIDER}\n\n` +
    `✅ <b>TRACK ADDED</b>\n\n` +
    `${title} by ${artist}\nDuration: ${duration}\nPosition: ${music.queue.length}`;
  await sendRichCard(ctx, ctx.chat.id, built, fallback, {}, { celebration: false });
});

// /pause
bot.command('pause', async (ctx) => {
  if (ctx.from.id !== OWNER_ID) return;
  music.current.playing = false;
  saveData();
  await ctx.reply('⏸ Paused.');
});

// /resume
bot.command('resume', async (ctx) => {
  if (ctx.from.id !== OWNER_ID) return;
  music.current.playing = true;
  saveData();
  await ctx.reply('▶ Resumed.');
});

// /skip
bot.command('skip', async (ctx) => {
  if (ctx.from.id !== OWNER_ID) return;
  if (music.queue.length === 0) { await ctx.reply('⚠️ Queue is empty.'); return; }
  music.current.index = (music.current.index + 1) % music.queue.length;
  music.current.playing = true;
  music.current.track = music.queue[music.current.index];
  saveData();
  await ctx.reply(`⏭ Skipped to: ${music.current.track.title}`);
});

// /queue
bot.command('queue', async (ctx) => {
  if (music.queue.length === 0) {
    await ctx.reply('📋 Queue is empty.');
    return;
  }
  const lines = music.queue.map((t, i) =>
    `${i === music.current.index ? '🎧' : '  '} ${i + 1}. ${htmlEsc(t.title)} — ${htmlEsc(t.artist || 'Unknown')} (${t.duration})`
  ).join('\n');
  await ctx.reply(`📋 <b>QUEUE</b>\n\n${lines}`, { parse_mode: 'HTML' });
});

// /current
bot.command('current', async (ctx) => {
  if (!music.current.track) {
    await ctx.reply('⚠️ No track playing.');
    return;
  }
  const t = music.current.track;
  await ctx.reply(`🎧 <b>NOW PLAYING</b>\n\n${t.title}\nBy: ${t.artist || 'Unknown'}\nDuration: ${t.duration}\nStatus: ${music.current.playing ? '▶ Playing' : '⏸ Paused'}`, { parse_mode: 'HTML' });
});

// /nowplaying — rich card with HTML player link
bot.command('nowplaying', async (ctx) => {
  if (!music.current.track) {
    const built = new RH().heading(2, '⚠️ NO TRACK').paragraph('No music is currently playing.');
    const fallback = `⚠️ NO TRACK\n\nNo music is currently playing.`;
    await sendRichCard(ctx, ctx.chat.id, built, fallback, {}, { celebration: false });
    return;
  }
  const t = music.current.track;
  const built = new RH()
    .heading(2, '🎧 NOW PLAYING')
    .paragraph(`<b>${htmlEsc(t.title)}</b>`)
    .paragraph(`By: <b>${htmlEsc(t.artist || 'Unknown')}</b>`)
    .paragraph(`Duration: ${t.duration}`)
    .paragraph(`Status: ${music.current.playing ? '▶ Playing' : '⏸ Paused'}`)
    .divider()
    .paragraph(`🌐 <a href="${PUBLIC_URL}/player">Open HTML Player</a>`);
  const fallback =
    `<b>『 ${FANCY(BRAND_NAME.toUpperCase(), 'bold')} 』</b>\n${DIVIDER}\n\n` +
    `🎧 <b>NOW PLAYING</b>\n\n` +
    `${t.title}\nBy: ${t.artist || 'Unknown'}\nDuration: ${t.duration}\nStatus: ${music.current.playing ? '▶ Playing' : '⏸ Paused'}\n\n` +
    `🌐 HTML Player: ${PUBLIC_URL}/player`;
  await sendRichCard(ctx, ctx.chat.id, built, fallback, {}, { celebration: false });
});

// /verify_join command
bot.command('verify_join', async (ctx) => {
  const built = new RH()
    .heading(2, '✅ VERIFY JOIN')
    .paragraph('To verify and join:')
    .paragraph('1. Send a join request to the channel')
    .paragraph('2. Wait for admin approval')
    .paragraph('3. Use /current to see what is playing');
  const fallback = `✅ VERIFY JOIN\n\n1. Send a join request to the channel\n2. Wait for admin approval\n3. Use /current to see what is playing`;
  await sendRichCard(ctx, ctx.chat.id, built, fallback, {}, { celebration: false });
});

// ───────────────── Launch ─────────────────
async function launch() {
  try {
    // Fetch bot username for inline keyboard deep links
    try {
      const me = await bot.telegram.getMe();
      if (me.username && !BOT_USERNAME) {
        INLINE_KEYBOARD.inline_keyboard[0][1].url = `https://t.me/${me.username}?startchannel=new`;
      }
    } catch (e) {
      log('warn', 'Could not fetch bot username for deep links:', e.message);
    }

    await bot.launch({ drop_pending_updates: false });
    log('success', `Music bot is polling… (brand: ${BRAND_NAME})`);
  } catch (e) {
    log('error', 'Launch failed:', e.message);
  }
}

launch();

process.once('SIGINT', () => { log('warn', 'SIGINT — shutting down'); bot.stop('SIGINT'); server.close(() => process.exit(0)); });
process.once('SIGTERM', () => { log('warn', 'SIGTERM — shutting down'); bot.stop('SIGTERM'); server.close(() => process.exit(0)); });

process.on('unhandledRejection', (reason) => { log('error', 'Unhandled rejection:', reason && reason.message ? reason.message : reason); });
process.on('uncaughtException', (err) => { log('error', 'Uncaught exception:', err && err.message ? err.message : err); });

if (require.main === module) {
  // already launched above
}
