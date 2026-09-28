#!/usr/bin/env bash
# Runs every fight in every mode headlessly and checks the event stream. Usage: tests/matrix.sh [jobs]
cd "$(dirname "$0")/.."
OUT=.gamedata/matrix; rm -rf "$OUT"; mkdir -p "$OUT/ini"
cases=()
add() { cases+=("$1|$2|$3"); }   # chapter|name|ini-body
for spec in "1 jevil" "1 king" "2 spamton_neo" "2 queen" "3 tenna" "3 knight" "4 gerson" "4 titan" "5 pink" "5 flowery"; do
  set -- $spec; ch=$1; b=$2
  add $ch "$b-normal"   "boss=$b\nmode=normal\nintro=0"
  add $ch "$b-hitless"  "boss=$b\nmode=hitless\nintro=0"
  add $ch "$b-practice" "boss=$b\nmode=practice\nintro=0"
  add $ch "$b-single"   "boss=$b\nmode=single\nintro=0\nattack=1"
  add $ch "$b-endless"  "boss=$b\nmode=endless\nintro=0"
done
add 2 "sneo-snowgrave" "boss=spamton_neo\nvariant=snowgrave\nmode=normal\nintro=0"
add 5 "pink-easy"      "boss=pink\nvariant=easy\nmode=normal\nintro=0"
add 5 "pink-harder"    "boss=pink\nvariant=harder\nmode=normal\nintro=0"
run() {
  IFS='|' read -r ch name body <<< "$1"
  printf "[fight]\n$body\n" > "$OUT/ini/$name.ini"
  timeout 600 tools/patch/run-desktop.sh "$ch" "$OUT/ini/$name.ini" --headless --playback-inputs "$PWD/tests/inputs/mash-z-long.json" --exit-at-frame 4000 > "$OUT/$name.log" 2>&1
  local battle=$(grep -c "DRWEB battle" "$OUT/$name.log") attack=$(grep -c "DRWEB attack" "$OUT/$name.log") hit=$(grep -c "DRWEB hit" "$OUT/$name.log")
  local restart=$(grep -c "DRWEB restart" "$OUT/$name.log") crash=$(grep -ciE "segfault|abort|fatal|VM: Error|stack overflow" "$OUT/$name.log")
  local status=OK
  [ "$battle" -ge 1 ] || status=NO_BATTLE
  [ "$status" = OK ] && [ "$attack" -ge 1 ] || { [ "$status" = OK ] && status=NO_ATTACK; }
  [ "$crash" -gt 0 ] && status=CRASH
  case "$name" in *-hitless) [ "$status" = OK ] && [ "$restart" -lt 1 ] && [ "$hit" -ge 1 ] && status=NO_RESTART;; esac
  case "$name" in *-single) [ "$status" = OK ] && [ "$(grep -c 'DRWEB attack 1' "$OUT/$name.log")" -lt 2 ] && status=SINGLE_NOT_REPEATING;; esac
  printf "%-22s %-22s battle=%s attacks=%s hits=%s restarts=%s\n" "$name" "$status" "$battle" "$attack" "$hit" "$restart"
}
export -f run; export OUT
printf "%s\n" "${cases[@]}" | xargs -P "${1:-6}" -I{} bash -c 'run "$@"' _ {} | sort
