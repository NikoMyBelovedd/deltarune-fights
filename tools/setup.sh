#!/usr/bin/env bash
# Fetches the third-party tools this project builds with. Safe to re-run.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/tools"

UTMT_VERSION=0.9.2.0
BUTTERSCOTCH_COMMIT=80fa2033dc6a089326950b0ed89583f47872d90e

if [ ! -x utmt/UndertaleModCli ]; then
  echo "== UndertaleModTool CLI $UTMT_VERSION"
  gh release download "$UTMT_VERSION" -R UnderminersTeam/UndertaleModTool -p "UTMT_CLI_v$UTMT_VERSION-Ubuntu.zip" --clobber
  unzip -q -o "UTMT_CLI_v$UTMT_VERSION-Ubuntu.zip" -d utmt && rm "UTMT_CLI_v$UTMT_VERSION-Ubuntu.zip"
  chmod +x utmt/UndertaleModCli
fi

if [ ! -d butterscotch ]; then
  echo "== Butterscotch @ $BUTTERSCOTCH_COMMIT"
  git clone -q https://github.com/ButterscotchRunner/Butterscotch.git butterscotch
fi
(cd butterscotch && git fetch -q origin && git checkout -q -f "$BUTTERSCOTCH_COMMIT" && git clean -qfd src CMakeLists.txt)
for p in "$ROOT"/patches/butterscotch/*.patch; do
  (cd butterscotch && git apply "$p")
done

if [ ! -d emsdk ]; then
  echo "== Emscripten SDK"
  git clone -q --depth 1 https://github.com/emscripten-core/emsdk.git
  (cd emsdk && ./emsdk install latest && ./emsdk activate latest)
fi
echo "tools ready"
