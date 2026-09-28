#!/usr/bin/env bash
# (Re)starts the Vite dev server in the background on port 5317.
cd "$(dirname "$0")/.."
if [ -f .gamedata/vite.pid ]; then kill "$(cat .gamedata/vite.pid)" 2>/dev/null; sleep 1; fi
setsid nohup node node_modules/vite/bin/vite.js --port 5317 --strictPort > .gamedata/vite.log 2>&1 < /dev/null &
echo $! > .gamedata/vite.pid
