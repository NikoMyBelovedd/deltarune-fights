# DELTARUNE Boss Fights (web)

Fan project: play DELTARUNE's boss fights in the browser. Each fight runs the game's **original code**:
- Each chapter's `data.win` runs in [Butterscotch](https://github.com/ButterscotchRunner/Butterscotch), an open-source GameMaker runner, compiled to WebAssembly.
- The game data is patched to boot straight into a fight, with loadouts and practice modes (Hitless, Single Attack, Endless, Practice, phase select).

This repository contains **no game files**. Everything game-derived is built locally from your own copy of DELTARUNE.

## Build

Requirements: Node 23+, `gh`, `cmake`, `ninja`, and your DELTARUNE install. The UndertaleModTool CLI is self-contained.

```sh
npm install
npm run setup   # fetch UndertaleModTool CLI, Butterscotch (+ our patches), Emscripten; build the engine
npm run game    # export chapters, patch data.win, bundle, extract UI assets
npm run dev     # http://localhost:5317
npm run deploy  # build and upload to Cloudflare Pages
```

Set `DELTARUNE_DIR` if your install isn't at the Flatpak Steam path. Chapter 3 is read from `CH3_VANILLA` (see `PLAN.md`).

## Layout

- `patches/` has the GML patches for each chapter (`docs/porting-guide.md` explains them) and the engine patches.
- `src/` holds the site: the menus (`src/ui`), the engine host (`src/engine`) and the fight registry (`src/fights.ts`).
- `public/engine/drweb-worker.js` and `public/engine/audio-worklet.js` are the runner worker and the audio output.
- `tools/` has the extraction, patching and bundling scripts.
- `docs/` has research notes for each fight.

## Licenses

The shipped engine (`public/engine/butterscotch.*`) is built from Butterscotch, which is AGPL-3.0, plus the patches in `patches/butterscotch/`. DELTARUNE belongs to Toby Fox. This project is not affiliated with him. Please buy the game.
