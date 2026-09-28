#!/usr/bin/env bash
# Full game-data build: export chapters (if needed), patch data.win, bundle, extract UI + gear data.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
CHAPTERS="$(node -e 'import("./src/fights.ts").then(m => console.log([...new Set(m.FIGHTS.filter(f => f.available).map(f => f.chapter))].join(" ")))')"
for c in 1 2 3 4 5; do
  [ -f ".gamedata/ch$c/export/data.json" ] || tools/extract/export-all.sh "$c"
done
for c in $CHAPTERS; do
  tools/patch/build.sh "$c" | tail -1
done
# Real in-battle idle animations for the menu previews (bosses drawn procedurally by the game).
node tools/build/capture.ts 2 tests/configs/ch2-sneo-capture.ini boss_spamton_neo 188 2
node tools/build/capture.ts 3 tests/configs/ch3-knight-capture.ini boss_knight 100 2 black
node tools/build/bundle.ts $CHAPTERS
node tools/build/gear.ts 1 2 3 4 5
node tools/build/ui-assets.ts
