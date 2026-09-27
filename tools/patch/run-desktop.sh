#!/usr/bin/env bash
# Runs a patched chapter in desktop Butterscotch: run-desktop.sh <chapter> <ini-file> [extra butterscotch args...]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
GAME="${DELTARUNE_DIR:-$HOME/.var/app/com.valvesoftware.Steam/.local/share/Steam/steamapps/common/DELTARUNE}"
c="$1"; ini="$2"; shift 2
RUN="$ROOT/.gamedata/run"
mkdir -p "$RUN/chapter${c}_windows" "$RUN/saves$c"
[ -e "$RUN/mus" ] || ln -s "$GAME/mus" "$RUN/mus"
[ -e "$RUN/chapter${c}_windows/mus" ] || ln -s "$GAME/mus" "$RUN/chapter${c}_windows/mus"
for f in "$GAME/chapter${c}_windows"/*; do
  b="$(basename "$f")"; [ "$b" = data.win ] && continue
  [ -e "$RUN/chapter${c}_windows/$b" ] || ln -s "$f" "$RUN/chapter${c}_windows/$b"
done
cp "$ROOT/.gamedata/build/ch$c/data.win" "$RUN/chapter${c}_windows/data.win"
cp "$ini" "$RUN/saves$c/drweb.ini"
cd "$RUN/chapter${c}_windows"
exec "$ROOT/tools/butterscotch/build-desktop/butterscotch" data.win --save-folder "$RUN/saves$c" "$@"
