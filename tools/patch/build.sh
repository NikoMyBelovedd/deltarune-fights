#!/usr/bin/env bash
# Builds a patched data.win for a chapter: tools/patch/build.sh <chapter>
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
GAME="${DELTARUNE_DIR:-$HOME/.var/app/com.valvesoftware.Steam/.local/share/Steam/steamapps/common/DELTARUNE}"
CH3_VANILLA="${CH3_VANILLA:-$HOME/Documents/DELTARUNE-kaizo-backup-20260909-DyuZxR/data.win}"
c="$1"
src="$GAME/chapter${c}_windows/data.win"
[ "$c" = 3 ] && src="$CH3_VANILLA"
out="$ROOT/.gamedata/build/ch$c"
mkdir -p "$out" "$ROOT/.gamedata/work"
cp "$src" "$ROOT/.gamedata/work/patch-ch$c.win"
DR_MANIFEST="$ROOT/patches/ch$c/manifest.json" "$ROOT/tools/utmt/UndertaleModCli" load "$ROOT/.gamedata/work/patch-ch$c.win" \
  -s "$ROOT/tools/patch/apply.csx" -o "$out/data.win" -f < /dev/null 2>&1 | grep -v "^Trying to load" || true
rm -f "$ROOT/.gamedata/work/patch-ch$c.win"
test -s "$out/data.win" && echo "built $out/data.win ($(du -h "$out/data.win" | cut -f1))"
