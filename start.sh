#!/bin/bash
set -e

# Install Python dependencies for Telegram login helper
python3 -m pip install pyrogram -q

# Start the Node.js bot
npm start