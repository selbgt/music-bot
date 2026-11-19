#!/bin/bash
set -e

# Install Python dependencies for Telegram login helper
pip3 install pyrogram -q 2>/dev/null || pip install pyrogram -q

# Start the Node.js bot
npm start