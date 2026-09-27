#!/usr/bin/env bash
# Usage: tools/extract/export-all.sh [chapters...]   (default: 1 2 3 4 5)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
GAME="${DELTARUNE_DIR:-$HOME/.var/app/com.valvesoftware.Steam/.local/share/Steam/steamapps/common/DELTARUNE}"
CH3_VANILLA="${CH3_VANILLA:-$HOME/Documents/DELTARUNE-kaizo-backup-20260909-DyuZxR/data.win}"
CLI="$ROOT/tools/utmt/UndertaleModCli"
WORK="$ROOT/.gamedata/work"
mkdir -p "$WORK"
for ch in "${@:-1 2 3 4 5}"; do
  for c in $ch; do
    src="$GAME/chapter${c}_windows/data.win"
    [ "$c" = 3 ] && src="$CH3_VANILLA"   # installed Ch3 is modded (Kaizo Knight)
    out="$ROOT/.gamedata/ch$c"
    mkdir -p "$out"
    cp "$src" "$WORK/ch$c.win"   # never touch the install
    echo "== ch$c: decompiling code"
    "$CLI" dump "$WORK/ch$c.win" -o "$out" -c UMT_DUMP_ALL < /dev/null > "$out/dump.log" 2>&1
    echo "== ch$c: exporting assets"
    DR_OUT="$out/export" DR_GAMEDIR="$GAME/chapter${c}_windows" "$CLI" load "$WORK/ch$c.win" -s "$ROOT/tools/extract/export.csx" < /dev/null 2>&1 | tail -3
    cp -r "$GAME/chapter${c}_windows/lang" "$out/lang"
    rm "$WORK/ch$c.win"
  done
done
