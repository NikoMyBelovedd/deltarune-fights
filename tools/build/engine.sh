#!/usr/bin/env bash
# Builds Butterscotch (with patches/butterscotch applied by tools/setup.sh) for the web and the desktop test harness.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT/tools/butterscotch"
source ../emsdk/emsdk_env.sh > /dev/null 2>&1
[ -d build-web ] || emcmake cmake -B build-web -G Ninja -DPLATFORM=web -DCMAKE_BUILD_TYPE=Release > /dev/null
cmake --build build-web
mkdir -p "$ROOT/public/engine"
cp build-web/butterscotch.mjs build-web/butterscotch.wasm "$ROOT/public/engine/"
if [ "${1:-}" != "--web-only" ]; then
  [ -d build-desktop ] || cmake -B build-desktop -G Ninja -DBACKEND=sdl3 -DCMAKE_BUILD_TYPE=Release > /dev/null
  cmake --build build-desktop
fi
