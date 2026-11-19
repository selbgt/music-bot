#!/bin/bash

# Install Python dependencies for Telegram login helper (non-fatal if fails)
python3 -m pip install pyrogram -q 2>/dev/null || true

# Start the Node.js bot
npm start