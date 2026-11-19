#!/bin/bash
set -e

# Install Python dependencies for Telegram login helper
pip install pyrogram -q

# Start the Node.js bot
npm start