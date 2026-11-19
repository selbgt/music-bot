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
const https = require('https');
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

// Inline keyboard — Only ONE button outside card: Add Me To Group 🎶‼️
// Rest of buttons go inside Telekaf table (card)
const INLINE_KEYBOARD = {
  inline_keyboard: [
    [
      { text: 'Add Me To Group 🎶‼️', url: `https://t.me/${BOT_USERNAME || 'BOT_USERNAME'}?startgroup=true` }
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
    bold: build(0x1D400, 0x1D41A, 0x1D7CE),           // 𝐀𝐁𝐂
    italic: build(0x1D7D4, 0x1D7EE, 0x1D7CE),         // 𝘼𝘽𝘾
    boldItalic: build(0x1D7D4, 0x1D7EE, 0x1D7CE),     // 𝘼𝘽𝘾
    sans: build(0x1D5D4, 0x1D5EE, 0x1D7EC),           // 𝘼𝘽𝘾
    sansBold: build(0x1D7EC, 0x1D806, 0x1D7CE),       // 𝗔𝗕𝗖
    sansBoldItalic: build(0x1D7EC, 0x1D806, 0x1D7CE), // 𝘼𝘽𝘾
    script: build(0x1D4D0, 0x1D4EA, 0x1D7CE),         // 𝓐𝓑𝓒
    boldScript: build(0x1D4D0, 0x1D4EA, 0x1D7CE),     // 𝓗𝓮𝓵𝓵𝓸
    fraktur: build(0x1D504, 0x1D51E, 0x1D7CE),        // 𝔄𝔅ℭ
    double: build(0x1D538, 0x1D552, 0x1D7CE),         // 𝔸𝔹ℂ
  };
  // Constant font: sansBold (Hello style - 𝗛𝗲𝗹𝗹𝗼) everywhere
  const m = fonts.sansBold;
  return (text) => {
    return String(text).split('').map((c) => m[c] || c).join('');
  };
})();

// Plain text output — no fancy unicode fonts (mobile-safe rendering)

// Premium decorative elements — each symbol has a specific purpose
const PREMIUM = {
  musicDot: '◈',        // music playing / track points
  separator: '┆',       // line separator (divides two sections)
  bullet: '❋',          // bullet point for lists
  brandOpen: '𓆩',      // brand wrapper open
  brandClose: '𓆪',     // brand wrapper close
  decoEnd: '࿐',         // decorative end flourish
  emoji: {
    sparkle: '✨',      // shine / highlight
    star: '🌟',
    glow: '💫',
    heart: '💖',
    gift: '💝',
    pleading: '🥹',
    music: '🎵',
    headphone: '🎧',
    lightning: '⚡',
    fire: '🔥',
    crown: '👑',
    diamond: '💎',
    magic: '🪄',
  },
};

// Line separator — ┆ divides two lines/sections
const divLine = () => `${PREMIUM.emoji.sparkle} ${PREMIUM.separator} ${PREMIUM.emoji.sparkle}`;

// Wrap brand name: 𓆩Dev X Music𓆪
const brandWrap = (text) => `${PREMIUM.brandOpen}${text}${PREMIUM.brandClose}`;

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

// ───────────────── Spotify Wrapped (third-party API) ─────────────────
function spotifyWrapped(spotifyUrl) {
  return new Promise((resolve) => {
    const postData = JSON.stringify({ url: spotifyUrl });
    const options = {
      hostname: 'musicfab.io',
      port: 443,
      path: '/api/spotify',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({ raw: data, status: res.statusCode });
        }
      });
    });

    req.on('error', (e) => {
      log('warn', 'Spotify Wrapped API error:', e.message);
      resolve(null);
    });

    req.setTimeout(30000, () => {
      req.destroy();
      resolve(null);
    });

    req.end(postData);
  });
}

// ───────────────── JioSaavn search (most active/matching song) ─────────────────
function saavnSearch(query) {
  return new Promise((resolve) => {
    const encodedQuery = encodeURIComponent(query);
    const url = `https://www.jiosaavn.com/api.php?__call=search.getResults&query=${encodedQuery}&p=1&n=5&_format=json&_marker=0`;

    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const results = json.results || [];
          if (results.length === 0) return resolve(null);

          // Take the most active / top matching song (first result)
          const top = results[0];
          resolve({
            title: top.song || top.title || 'Unknown',
            artist: top.primary_artists || top.singers || 'Unknown',
            duration: top.duration || 'Unknown',
            url: top.media_url || top.perma_url || '',
            downloadUrl: top.media_url || '',
            source: 'saavn',
          });
        } catch (e) {
          log('warn', 'Saavn search parse failed:', e.message);
          resolve(null);
        }
      });
    }).on('error', (e) => {
      log('warn', 'Saavn search error:', e.message);
      resolve(null);
    }).setTimeout(15000, () => {
      resolve(null);
    });
  });
}

// ───────────────── Spotify search via musicfab ─────────────────
function spotifySearch(query) {
  return new Promise((resolve) => {
    const postData = JSON.stringify({ url: `https://open.spotify.com/search/${encodeURIComponent(query)}` });
    const options = {
      hostname: 'musicfab.io',
      port: 443,
      path: '/api/spotify',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (!json || (json.error && !json.title)) return resolve(null);
          resolve({
            title: json.title || json.song || json.name || 'Unknown',
            artist: json.artist || json.artists || json.by || 'Unknown',
            duration: json.duration || 'Unknown',
            url: json.url || json.link || json.perma_url || '',
            downloadUrl: json.download_url || json.media_url || '',
            source: 'spotify',
          });
        } catch (e) {
          resolve(null);
        }
      });
    });

    req.on('error', () => resolve(null));
    req.setTimeout(15000, () => { req.destroy(); resolve(null); });
    req.end(postData);
  });
}

// ───────────────── Unified music search — Saavn → Spotify → YouTube ─────────────────
async function musicSearch(query) {
  // Try JioSaavn first (most active matching song)
  const saavn = await saavnSearch(query);
  if (saavn && saavn.title && saavn.title !== 'Unknown') {
    log('success', `Saavn match: ${saavn.title} by ${saavn.artist}`);
    return saavn;
  }

  // Try Spotify
  const spotify = await spotifySearch(query);
  if (spotify && spotify.title && spotify.title !== 'Unknown') {
    log('success', `Spotify match: ${spotify.title} by ${spotify.artist}`);
    return spotify;
  }

  // Fallback to YouTube via yt-dlp
  const yt = ytdlSearch(query);
  if (yt) {
    log('success', `YouTube match: ${yt.title} by Unknown`);
    return { ...yt, source: 'youtube', downloadUrl: yt.url };
  }

  return null;
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

  const richExtra = { ...extra };

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

// /start — Telekaf rich welcome card (private) + group start card with uptime
bot.start(async (ctx) => {
  try {
    const isGroup = ctx.chat && (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup');
    const runtime = getRuntime();

    if (isGroup) {
      // Group start card — uptime + status + commands preview
      const built = new RH()
        .photo(WELCOME_IMAGE_URL)
        .heading(1, `${brandWrap(BRAND_NAME)} — Group Active`)
        .paragraph(`${PREMIUM.emoji.sparkle} Bot is running in this group!`)
        .paragraph(`${PREMIUM.emoji.diamond} Uptime: <code>${runtime}</code>`)
        .paragraph(`${PREMIUM.emoji.diamond} Status: <code>● ONLINE</code>`)
        .paragraph(`${PREMIUM.musicDot} Music Playing ▶️ /play <song> — Play music in voice chat`)
        .paragraph(`${PREMIUM.musicDot} Video Playing ▶️ /vplay <song> — Play video in voice chat`)
        .paragraph(divLine())
        .buttonRow([
          { text: 'Help', callback_data: 'help' },
          { text: 'Updates', url: 'https://t.me/devxbackup' },
          { text: 'Group', url: 'https://t.me/devxbackup' },
        ])
        .paragraph(divLine())
        .paragraph(brandWrap(BRAND_NAME));

      const fallback =
        `${brandWrap(BRAND_NAME)} — Group Active\n\n` +
        `${PREMIUM.emoji.sparkle} Bot is running in this group!\n` +
        `${PREMIUM.emoji.diamond} Uptime: ${runtime}\n` +
        `${PREMIUM.emoji.diamond} Status: ● ONLINE\n\n` +
        `${PREMIUM.musicDot} Music Playing ▶️ /play <song> — Play music in voice chat\n` +
        `${PREMIUM.musicDot} Video Playing ▶️ /vplay <song> — Play video in voice chat\n\n` +
        `${brandWrap(BRAND_NAME)}`;

      const msg = await sendRichCard(ctx, ctx.chat.id, built, fallback, {}, { celebration: true });
      // React to bot's own welcome card (always works in groups)
      if (msg && msg.message_id) {
        try {
          await ctx.telegram.setMessageReaction({ chat_id: ctx.chat.id, message_id: msg.message_id, reaction: [{ type: 'emoji', emoji: '💋' }] });
          log('success', '💋 reaction set on welcome card (group)');
        } catch (reErr) {
          const errMsg = reErr && reErr.response ? reErr.response.body : (reErr && reErr.message ? reErr.message : String(reErr));
          log('warn', 'Welcome card reaction failed (group):', errMsg);
        }
      }
      // Super reaction on user's /start command message (is_big = true for big reaction)
      try {
        if (ctx.message && ctx.message.message_id) {
          await ctx.telegram.setMessageReaction({ chat_id: ctx.chat.id, message_id: ctx.message.message_id, reaction: [{ type: 'emoji', emoji: '💋' }], is_big: true });
          log('success', '💋 super reaction on /start user message (group)');
        } else {
          log('warn', 'No ctx.message.message_id available (group)');
        }
      } catch (reErr) {
        const errMsg = reErr && reErr.response ? reErr.response.body : (reErr && reErr.message ? reErr.message : String(reErr));
        log('warn', 'Super reaction on /start failed (group):', errMsg);
      }
      return;
    }

    // Private welcome card
    const built = new RH()
      .photo(WELCOME_IMAGE_URL)
      .heading(1, `Welcome to ${BRAND_NAME}`)
      .paragraph(`${PREMIUM.emoji.sparkle} ${PREMIUM.emoji.music} lets you stream high-quality music and video directly in Telegram voice and video chats.`)
      .paragraph(`${PREMIUM.emoji.sparkle} Supported platforms: YouTube, Spotify, Apple Music, SoundCloud, Deezer, Twitch, and many more.`)
      .paragraph(`${PREMIUM.emoji.sparkle} Use the buttons below to add the bot to your group or explore the available commands.`)
      .paragraph(divLine())
      .buttonRow([
        { text: 'Help', callback_data: 'help' },
        { text: 'Updates', url: 'https://t.me/devxbackup' },
        { text: 'Group', url: 'https://t.me/devxbackup' },
      ])
      .paragraph(divLine())
      .paragraph(brandWrap(BRAND_NAME));

    const fallback =
      `✨ Welcome to ${BRAND_NAME}\n\n` +
      `${PREMIUM.emoji.music} lets you stream high-quality music and video directly in Telegram voice and video chats.\n\n` +
      `Supported platforms: YouTube, Spotify, Apple Music, SoundCloud, Deezer, Twitch, and many more.\n\n` +
      `Use the buttons below to add the bot to your group or explore the available commands.\n\n` +
      `${brandWrap(BRAND_NAME)}`;

    const msg = await sendRichCard(ctx, ctx.chat.id, built, fallback, { reply_markup: INLINE_KEYBOARD }, { celebration: true });
      if (msg && msg.message_id) {
        try {
          await ctx.telegram.setMessageReaction({ chat_id: ctx.chat.id, message_id: msg.message_id, reaction: [{ type: 'emoji', emoji: '💋' }] });
          log('success', '💋 reaction set on welcome card (private)');
        } catch (reErr) {
          const errMsg = reErr && reErr.response ? reErr.response.body : (reErr && reErr.message ? reErr.message : String(reErr));
          log('warn', 'Welcome card reaction failed (private):', errMsg);
        }
      }
    // Super reaction on user's /start command message (is_big = true for big reaction)
    try {
      if (ctx.message && ctx.message.message_id) {
        await ctx.telegram.setMessageReaction({ chat_id: ctx.chat.id, message_id: ctx.message.message_id, reaction: [{ type: 'emoji', emoji: '💋' }], is_big: true });
        log('success', '💋 super reaction on /start user message (private)');
      } else {
        log('warn', 'No ctx.message.message_id available (private)');
      }
    } catch (reErr) {
      const errMsg = reErr && reErr.response ? reErr.response.body : (reErr && reErr.message ? reErr.message : String(reErr));
      log('warn', 'Super reaction on /start failed (private):', errMsg);
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
    const built = new RH()
      .heading(2, `${PREMIUM.emoji.fire} ACCESS DENIED`)
      .paragraph(`${PREMIUM.emoji.sparkle} Only the owner can use /login.`)
      .paragraph(divLine());
    const fallback = `⚠️ ACCESS DENIED\n\nOnly the owner can use /login.`;
    await sendRichCard(ctx, ctx.chat.id, built, fallback, {}, { celebration: false });
    return;
  }
  const parts = ctx.message.text.split(/\s+/).slice(1);
  if (parts.length < 3) {
    const built = new RH()
      .heading(2, `${PREMIUM.emoji.fire} USAGE`)
      .paragraph(`${PREMIUM.emoji.sparkle} Send: <code>/login <API_ID> <API_HASH> <SESSION_STRING></code>`)
      .paragraph(`${PREMIUM.emoji.music} Get API_ID & API_HASH from my.telegram.org/apps`)
      .paragraph(`${PREMIUM.emoji.diamond} Get SESSION_STRING from @StringFatherBot`)
      .paragraph(divLine());
    const fallback = `❌ USAGE\n\nSend: /login <API_ID> <API_HASH> <SESSION_STRING>\n\nGet API_ID & API_HASH from my.telegram.org/apps\nGet SESSION_STRING from @StringFatherBot`;
    await sendRichCard(ctx, ctx.chat.id, built, fallback, {}, { celebration: false });
    return;
  }
  ownerApiId = parts[0];
  ownerApiHash = parts[1];
  ownerSession = parts[2];
  const built = new RH()
    .heading(2, `${PREMIUM.emoji.gift} OWNER LOGIN SAVED`)
    .paragraph(`${PREMIUM.emoji.diamond} API_ID: <code>${htmlEsc(ownerApiId)}</code>`)
    .paragraph(`${PREMIUM.emoji.diamond} API_HASH: <code>${htmlEsc(ownerApiHash)}</code>`)
    .paragraph(`${PREMIUM.emoji.diamond} SESSION: <code>${htmlEsc(ownerSession.substring(0, 10))}...</code>`)
    .paragraph(`${PREMIUM.emoji.magic} Voice call assistant is ready.`)
    .paragraph(divLine());
  const fallback = `✅ OWNER LOGIN SAVED\n\nAPI_ID: ${ownerApiId}\nAPI_HASH: ${ownerApiHash}\nSESSION: ${ownerSession.substring(0, 10)}...\nVoice call assistant is ready.`;
  await sendRichCard(ctx, ctx.chat.id, built, fallback, {}, { celebration: false });
});

// /logout — Clear owner session
bot.command('logout', async (ctx) => {
  if (ctx.from.id !== OWNER_ID) {
    const built = new RH()
      .heading(2, `${PREMIUM.emoji.fire} ACCESS DENIED`)
      .paragraph(`${PREMIUM.emoji.sparkle} Only the owner can use /logout.`)
      .paragraph(divLine());
    const fallback = `⚠️ ACCESS DENIED\n\nOnly the owner can use /logout.`;
    await sendRichCard(ctx, ctx.chat.id, built, fallback, {}, { celebration: false });
    return;
  }
  ownerSession = null;
  ownerApiId = null;
  ownerApiHash = null;
  const built = new RH()
    .heading(2, `${PREMIUM.emoji.gift} SESSION CLEARED`)
    .paragraph(`${PREMIUM.emoji.sparkle} Owner session cleared successfully.`)
    .paragraph(divLine());
  const fallback = `✅ SESSION CLEARED\n\nOwner session cleared successfully.`;
  await sendRichCard(ctx, ctx.chat.id, built, fallback, {}, { celebration: false });
});

// /assistant — Check assistant status
bot.command('assistant', async (ctx) => {
  const status = ownerSession ? `${PREMIUM.emoji.heart} Active` : `${PREMIUM.emoji.fire} Not Logged In`;
  const built = new RH()
    .heading(2, `${PREMIUM.emoji.headphone} VOICE CALL ASSISTANT`)
    .paragraph(`${PREMIUM.emoji.diamond} Status: ${status}`)
    .paragraph(`${PREMIUM.emoji.diamond} Owner: <code>${OWNER_ID}</code>`)
    .paragraph(`${PREMIUM.emoji.lightning} Use /login to set up assistant for voice calls.`)
    .paragraph(divLine());
  const fallback = `🤖 VOICE CALL ASSISTANT\n\nStatus: ${status}\nOwner: ${OWNER_ID}\nUse /login to set up assistant for voice calls.`;
  await sendRichCard(ctx, ctx.chat.id, built, fallback, {}, { celebration: false });
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
      `<b>『 ${brandWrap(BRAND_NAME.toUpperCase())} 』</b>\n${DIVIDER}\n\n` +
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

    const msg = await sendRichCard(ctx, ctx.chat.id, built, fallback, {}, { celebration: false });
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

// Inline button: Help callback — shows Telekaf HTML rich card menu
bot.action('help', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    const built = new RH()
      .photo(WELCOME_IMAGE_URL)
      .heading(2, `${PREMIUM.emoji.music} ${BRAND_NAME} — Help`)
      .table(
        [
          ['Command', 'Description'],
          ['/play', 'Play music in voice chat'],
          ['/vplay', 'Play video in voice chat'],
          ['/pause', 'Pause current track'],
          ['/resume', 'Resume playback'],
          ['/skip', 'Skip to next track'],
          ['/stop', 'Stop & leave voice chat'],
          ['/queue', 'Show current queue'],
          ['/current', 'Show currently playing track'],
          ['/nowplaying', 'Open rich music player card'],
          ['/menu', 'Show commands page'],
        ],
        { bordered: true, striped: true, hasHeader: true, compact: true }
      )
      .paragraph(divLine())
      .paragraph(`${PREMIUM.emoji.heart} ${BRAND_NAME}`);
    const fallback =
      `🎵 ${BRAND_NAME} — Help\n\n` +
      `Commands:\n` +
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
      `🤖 ${BRAND_NAME}`;
    await sendRichCard(ctx, ctx.chat.id, built, fallback, {}, { celebration: false });
  } catch (e) {
    log('warn', 'Help callback failed:', e && e.message ? e.message : e);
    try {
      await ctx.answerCbQuery('⚠️ Help failed to load.');
    } catch (_) { /* silent */ }
  }
});

// Inline button: Menu callback — shows Telekaf HTML rich card
bot.action('menu', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    const built = new RH()
      .photo(WELCOME_IMAGE_URL)
      .heading(2, `${PREMIUM.emoji.headphone} ${BRAND_NAME} — Commands`)
      .paragraph(`${PREMIUM.emoji.sparkle} /start — Welcome card`)
      .paragraph(`${PREMIUM.emoji.music} /play — Play music`)
      .paragraph(`${PREMIUM.emoji.headphone} /vplay — Play video`)
      .paragraph(`${PREMIUM.emoji.pleading} /pause — Pause current track`)
      .paragraph(`${PREMIUM.emoji.lightning} /resume — Resume playback`)
      .paragraph(`${PREMIUM.emoji.star} /skip — Skip to next track`)
      .paragraph(`${PREMIUM.emoji.fire} /stop — Stop & leave voice chat`)
      .paragraph(`${PREMIUM.emoji.diamond} /queue — Show current queue`)
      .paragraph(`${PREMIUM.emoji.gift} /current — Show currently playing track`)
      .paragraph(`${PREMIUM.emoji.magic} /nowplaying — Open rich music player card`)
      .paragraph(divLine())
      .paragraph(`🌐 <a href="${PUBLIC_URL}/player">Open HTML Player</a>`)
      .paragraph(brandWrap(BRAND_NAME));
    const fallback =
      `⌨️ ${BRAND_NAME} — Commands\n\n` +
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
      `🤖 ${BRAND_NAME}`;
    await sendRichCard(ctx, ctx.chat.id, built, fallback, {}, { celebration: false });
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
    const built = new RH()
      .heading(2, `${PREMIUM.emoji.fire} ACCESS DENIED`)
      .paragraph(`${PREMIUM.emoji.sparkle} Only the owner can add music.`)
      .paragraph(divLine());
    const fallback = `⚠️ ACCESS DENIED\n\nOnly the owner can add music.`;
    await sendRichCard(ctx, ctx.chat.id, built, fallback, {}, { celebration: false });
    return;
  }
  const text = ctx.message.text;
  const parts = text.split(/\s+/).slice(1);
  const query = parts.join(' ').trim();

  if (!query && !ctx.message.reply_to_message) {
    const built = new RH()
      .heading(2, `${PREMIUM.emoji.fire} USAGE`)
      .paragraph(`${PREMIUM.emoji.sparkle} Send: <code>/play Song Name</code> or <code>/play https://youtube.com/...</code>`)
      .paragraph(`${PREMIUM.emoji.music} Or reply to an audio file with <code>/play</code>`)
      .paragraph(divLine());
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
    // Search query — Saavn → Spotify → YouTube
    const status = await ctx.reply('🔍 Searching…');
    const result = await musicSearch(query);
    if (!result) {
      await ctx.editMessageText('❌ No results found on Spotify, Saavn, or YouTube.');
      return;
    }
    title = result.title;
    artist = result.artist || 'Unknown';
    duration = result.duration;
    url = result.downloadUrl || result.url || query;

    // Announce which source matched
    await ctx.editMessageText(`🎵 Found on ${result.source}: ${title} by ${artist}`);

    // Download the matched URL via yt-dlp
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
    .heading(2, `${PREMIUM.emoji.gift} TRACK ADDED`)
    .paragraph(`${PREMIUM.emoji.music} <b>${htmlEsc(title)}</b> by <b>${htmlEsc(artist)}</b>`)
    .paragraph(`${PREMIUM.emoji.diamond} Duration: <code>${duration}</code>`)
    .paragraph(`${PREMIUM.emoji.star} Position in queue: <code>${music.queue.length}</code>`)
    .paragraph(divLine());
  const fallback =
    `${PREMIUM.emoji.gift} TRACK ADDED\n\n` +
    `${PREMIUM.emoji.music} ${title} by ${artist}\n` +
    `${PREMIUM.emoji.diamond} Duration: ${duration}\n` +
    `${PREMIUM.emoji.star} Position: ${music.queue.length}`;
  await sendRichCard(ctx, ctx.chat.id, built, fallback, {}, { celebration: false });
});

// /pause
bot.command('pause', async (ctx) => {
  if (ctx.from.id !== OWNER_ID) return;
  music.current.playing = false;
  saveData();
  const built = new RH()
    .heading(2, `${PREMIUM.emoji.pleading} PAUSED`)
    .paragraph(`${PREMIUM.emoji.sparkle} Playback paused.`)
    .paragraph(divLine());
  const fallback = `⏸ PAUSED\n\nPlayback paused.`;
  await sendRichCard(ctx, ctx.chat.id, built, fallback, {}, { celebration: false });
});

// /resume
bot.command('resume', async (ctx) => {
  if (ctx.from.id !== OWNER_ID) return;
  music.current.playing = true;
  saveData();
  const built = new RH()
    .heading(2, `${PREMIUM.emoji.lightning} RESUMED`)
    .paragraph(`${PREMIUM.emoji.sparkle} Playback resumed.`)
    .paragraph(divLine());
  const fallback = `▶ RESUMED\n\nPlayback resumed.`;
  await sendRichCard(ctx, ctx.chat.id, built, fallback, {}, { celebration: false });
});

// /skip
bot.command('skip', async (ctx) => {
  if (ctx.from.id !== OWNER_ID) return;
  if (music.queue.length === 0) {
    const built = new RH()
      .heading(2, `${PREMIUM.emoji.fire} QUEUE EMPTY`)
      .paragraph(`${PREMIUM.emoji.sparkle} No tracks in queue.`)
      .paragraph(divLine());
    const fallback = `⚠️ QUEUE EMPTY\n\nNo tracks in queue.`;
    await sendRichCard(ctx, ctx.chat.id, built, fallback, {}, { celebration: false });
    return;
  }
  music.current.index = (music.current.index + 1) % music.queue.length;
  music.current.playing = true;
  music.current.track = music.queue[music.current.index];
  saveData();
  const built = new RH()
    .heading(2, `${PREMIUM.emoji.star} TRACK SKIPPED`)
    .paragraph(`${PREMIUM.emoji.music} <b>${htmlEsc(music.current.track.title)}</b>`)
    .paragraph(`${PREMIUM.emoji.diamond} By: <b>${htmlEsc(music.current.track.artist || 'Unknown')}</b>`)
    .paragraph(divLine());
  const fallback = `⏭ TRACK SKIPPED\n\n${music.current.track.title}\nBy: ${music.current.track.artist || 'Unknown'}`;
  await sendRichCard(ctx, ctx.chat.id, built, fallback, {}, { celebration: false });
});

// /queue
bot.command('queue', async (ctx) => {
  if (music.queue.length === 0) {
    const built = new RH()
      .heading(2, `${PREMIUM.emoji.diamond} QUEUE`)
      .paragraph(`${PREMIUM.emoji.sparkle} Queue is empty.`)
      .paragraph(divLine());
    const fallback = `📋 QUEUE\n\nQueue is empty.`;
    await sendRichCard(ctx, ctx.chat.id, built, fallback, {}, { celebration: false });
    return;
  }
  const lines = music.queue.map((t, i) =>
    `${i === music.current.index ? '🎧' : PREMIUM.bullet} ${i + 1}. ${htmlEsc(t.title)} — ${htmlEsc(t.artist || 'Unknown')} (${t.duration})`
  ).join('\n');
  const built = new RH()
    .heading(2, `${PREMIUM.emoji.diamond} QUEUE`)
    .paragraph(`<code>${lines}</code>`)
    .paragraph(divLine())
    .paragraph(brandWrap(BRAND_NAME));
  const fallback = `📋 QUEUE\n\n${lines}\n\n🤖 ${BRAND_NAME}`;
  await sendRichCard(ctx, ctx.chat.id, built, fallback, {}, { celebration: false });
});

// /current
bot.command('current', async (ctx) => {
  if (!music.current.track) {
    const built = new RH()
      .heading(2, `${PREMIUM.emoji.fire} NO TRACK`)
      .paragraph(`${PREMIUM.emoji.sparkle} No track is currently playing.`)
      .paragraph(divLine());
    const fallback = `⚠️ NO TRACK\n\nNo track is currently playing.`;
    await sendRichCard(ctx, ctx.chat.id, built, fallback, {}, { celebration: false });
    return;
  }
  const t = music.current.track;
  const built = new RH()
    .heading(2, `${PREMIUM.emoji.headphone} NOW PLAYING`)
    .paragraph(`${PREMIUM.emoji.music} <b>${htmlEsc(t.title)}</b>`)
    .paragraph(`${PREMIUM.emoji.diamond} By: <b>${htmlEsc(t.artist || 'Unknown')}</b>`)
    .paragraph(`${PREMIUM.emoji.gift} Duration: ${t.duration}`)
    .paragraph(`${PREMIUM.emoji.star} Status: ${music.current.playing ? '▶ Playing' : '⏸ Paused'}`)
    .paragraph(divLine())
    .paragraph(`🌐 <a href="${PUBLIC_URL}/player">Open HTML Player</a>`);
  const fallback = `🎧 NOW PLAYING\n\n${t.title}\nBy: ${t.artist || 'Unknown'}\nDuration: ${t.duration}\nStatus: ${music.current.playing ? '▶ Playing' : '⏸ Paused'}\n\n🌐 HTML Player: ${PUBLIC_URL}/player`;
  await sendRichCard(ctx, ctx.chat.id, built, fallback, {}, { celebration: false });
});

// /nowplaying — rich card with HTML player link
bot.command('nowplaying', async (ctx) => {
  if (!music.current.track) {
    const built = new RH()
      .heading(2, `${PREMIUM.emoji.fire} NO TRACK`)
      .paragraph(`${PREMIUM.emoji.sparkle} No music is currently playing.`)
      .paragraph(divLine());
    const fallback = `⚠️ NO TRACK\n\nNo music is currently playing.`;
    await sendRichCard(ctx, ctx.chat.id, built, fallback, {}, { celebration: false });
    return;
  }
  const t = music.current.track;
  const built = new RH()
    .heading(2, `${PREMIUM.emoji.headphone} NOW PLAYING`)
    .paragraph(`${PREMIUM.emoji.music} <b>${htmlEsc(t.title)}</b>`)
    .paragraph(`${PREMIUM.emoji.diamond} By: <b>${htmlEsc(t.artist || 'Unknown')}</b>`)
    .paragraph(`${PREMIUM.emoji.gift} Duration: ${t.duration}`)
    .paragraph(`${PREMIUM.emoji.star} Status: ${music.current.playing ? '▶ Playing' : '⏸ Paused'}`)
    .paragraph(divLine())
    .paragraph(`🌐 <a href="${PUBLIC_URL}/player">Open HTML Player</a>`);
  const fallback =
    `${PREMIUM.emoji.headphone} NOW PLAYING\n\n` +
    `${PREMIUM.emoji.music} ${t.title}\n` +
    `${PREMIUM.emoji.diamond} By: ${t.artist || 'Unknown'}\n` +
    `${PREMIUM.emoji.gift} Duration: ${t.duration}\n` +
    `${PREMIUM.emoji.star} Status: ${music.current.playing ? '▶ Playing' : '⏸ Paused'}\n\n` +
    `🌐 HTML Player: ${PUBLIC_URL}/player`;
  await sendRichCard(ctx, ctx.chat.id, built, fallback, {}, { celebration: false });
});

// /verify_join command
bot.command('verify_join', async (ctx) => {
  const built = new RH()
    .heading(2, `${PREMIUM.emoji.gift} VERIFY JOIN`)
    .paragraph(`${PREMIUM.emoji.sparkle} To verify and join:`)
    .paragraph(`${PREMIUM.emoji.music} 1. Send a join request to the channel`)
    .paragraph(`${PREMIUM.emoji.diamond} 2. Wait for admin approval`)
    .paragraph(`${PREMIUM.emoji.star} 3. Use /current to see what is playing`)
    .paragraph(divLine());
  const fallback = `✅ VERIFY JOIN\n\n1. Send a join request to the channel\n2. Wait for admin approval\n3. Use /current to see what is playing`;
  await sendRichCard(ctx, ctx.chat.id, built, fallback, {}, { celebration: false });
});

// /wrapped — Spotify Wrapped unofficial API
bot.command('wrapped', async (ctx) => {
  const parts = ctx.message.text.split(/\s+/).slice(1);
  const spotifyUrl = parts.join(' ').trim();

  if (!spotifyUrl) {
    const built = new RH()
      .heading(2, `${PREMIUM.emoji.fire} USAGE`)
      .paragraph(`${PREMIUM.emoji.sparkle} Send: <code>/wrapped https://open.spotify.com/track/...</code>`)
      .paragraph(`${PREMIUM.emoji.music} Works with Spotify track URLs`)
      .paragraph(divLine());
    const fallback = `⚠️ USAGE\n\nSend: /wrapped https://open.spotify.com/track/...\nWorks with Spotify track URLs`;
    await sendRichCard(ctx, ctx.chat.id, built, fallback, {}, { celebration: false });
    return;
  }

  const result = await spotifyWrapped(spotifyUrl);

  if (!result) {
    const built = new RH()
      .heading(2, `${PREMIUM.emoji.fire} SPOTIFY WRAPPED`)
      .paragraph(`${PREMIUM.emoji.sparkle} Failed to fetch Spotify data. Please try again later.`)
      .paragraph(divLine());
    const fallback = `💋 SPOTIFY WRAPPED\n\nFailed to fetch Spotify data. Please try again later.`;
    await sendRichCard(ctx, ctx.chat.id, built, fallback, {}, { celebration: false });
    return;
  }

  // Handle different response shapes
  let trackTitle = result.title || result.track || result.name || 'Unknown';
  let trackArtist = result.artist || result.artists || result.by || 'Unknown';
  let trackAlbum = result.album || result.album_name || 'Unknown';
  let trackDuration = result.duration || result.duration_ms || 'Unknown';
  let trackImage = result.image || result.cover || result.thumbnail || '';
  let trackUrl = result.url || result.link || spotifyUrl;

  const built = new RH()
    .photo(trackImage || WELCOME_IMAGE_URL)
    .heading(2, `${PREMIUM.emoji.music} SPOTIFY WRAPPED 💋`)
    .paragraph(`${PREMIUM.emoji.diamond} Title: <b>${htmlEsc(trackTitle)}</b>`)
    .paragraph(`${PREMIUM.emoji.diamond} Artist: <b>${htmlEsc(trackArtist)}</b>`)
    .paragraph(`${PREMIUM.emoji.diamond} Album: <b>${htmlEsc(trackAlbum)}</b>`)
    .paragraph(`${PREMIUM.emoji.diamond} Duration: <code>${htmlEsc(trackDuration)}</code>`)
    .paragraph(divLine())
    .paragraph(`🌐 <a href="${htmlEsc(trackUrl)}">Open on Spotify</a>`)
    .paragraph(`${brandWrap(BRAND_NAME)}`);

  const fallback =
    `💋 SPOTIFY WRAPPED\n\n` +
    `${PREMIUM.emoji.diamond} Title: ${trackTitle}\n` +
    `${PREMIUM.emoji.diamond} Artist: ${trackArtist}\n` +
    `${PREMIUM.emoji.diamond} Album: ${trackAlbum}\n` +
    `${PREMIUM.emoji.diamond} Duration: ${trackDuration}\n\n` +
    `🌐 Open on Spotify: ${trackUrl}\n\n` +
    `${brandWrap(BRAND_NAME)}`;

  const msg = await sendRichCard(ctx, ctx.chat.id, built, fallback, {}, { celebration: true });
  if (msg && msg.message_id) {
    try {
      await ctx.telegram.setMessageReaction({ chat_id: ctx.chat.id, message_id: msg.message_id, reaction: [{ type: 'emoji', emoji: '💋' }] });
      log('success', '💋 reaction set on /wrapped card');
    } catch (reErr) {
      const errMsg = reErr && reErr.response ? reErr.response.body : (reErr && reErr.message ? reErr.message : String(reErr));
      log('warn', 'Welcome card reaction failed (/wrapped):', errMsg);
    }
  }
  // Super reaction on user's /wrapped command message (is_big = true for big reaction)
  try {
    if (ctx.message && ctx.message.message_id) {
      await ctx.telegram.setMessageReaction({ chat_id: ctx.chat.id, message_id: ctx.message.message_id, reaction: [{ type: 'emoji', emoji: '💋' }], is_big: true });
      log('success', '💋 super reaction on /wrapped user message');
    } else {
      log('warn', 'No ctx.message.message_id available (/wrapped)');
    }
  } catch (reErr) {
    const errMsg = reErr && reErr.response ? reErr.response.body : (reErr && reErr.message ? reErr.message : String(reErr));
    log('warn', 'Super reaction on /wrapped failed:', errMsg);
  }
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
