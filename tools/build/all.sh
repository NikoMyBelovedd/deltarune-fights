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
node tools/build/bundle.ts $CHAPTERS
node tools/build/gear.ts 1 2 3 4 5
node tools/build/ui-assets.ts
