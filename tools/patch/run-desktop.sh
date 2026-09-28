#!/usr/bin/env bash
# Runs a patched chapter in desktop Butterscotch: run-desktop.sh <chapter> <ini-file> [extra butterscotch args...]
# Each invocation gets its own run folder, so several can run in parallel.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
GAME="${DELTARUNE_DIR:-$HOME/.var/app/com.valvesoftware.Steam/.local/share/Steam/steamapps/common/DELTARUNE}"
c="$1"; ini="$2"; shift 2
RUN="$ROOT/.gamedata/run/$$"
CH="$RUN/chapter${c}_windows"
mkdir -p "$CH" "$RUN/saves"
trap 'rm -rf "$RUN"' EXIT
ln -s "$GAME/mus" "$RUN/mus"
ln -s "$GAME/mus" "$CH/mus"
for f in "$GAME/chapter${c}_windows"/*; do
  b="$(basename "$f")"; [ "$b" = data.win ] && continue
  ln -s "$f" "$CH/$b"
done
ln -s "$ROOT/.gamedata/build/ch$c/data.win" "$CH/data.win"
cp "$ini" "$RUN/saves/drweb.ini"
cd "$CH"
"$ROOT/tools/butterscotch/build-desktop/butterscotch" data.win --save-folder "$RUN/saves" "$@"
