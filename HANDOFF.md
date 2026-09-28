# Handoff: deltaruneWEB (2026-09-27)

Read `PLAN.md` for the agreed scope and `docs/porting-guide.md` for how a fight gets ported.

## Architecture
- The site runs DELTARUNE's **original bytecode** in Butterscotch, compiled to WASM. Engine files: `public/engine/butterscotch.*`, built by `tools/build/engine.sh`.
- Engine patches (pause, game speed, replay recording, `game_set_speed` fix) are in `patches/butterscotch/*.patch`. `tools/setup.sh` applies them onto commit `80fa203`.
- GML patches in `patches/chN/` are compiled into each chapter's `data.win` by the UndertaleModTool CLI (`tools/patch/build.sh N`). They boot straight into the fight, apply the loadout and dials, and implement the modes. Events reach the page as `show_debug_message("@@DRWEB ...")`.
- The page is `src/` (Vite + TS): menus in `src/ui/app.ts`, the engine host in `src/engine/host.ts`, and the fight registry in `src/fights.ts`. The worker is `public/engine/drweb-worker.js` (OPFS cache, gzip parts, audio ring, keys, replays).
- No game files are in git. Build them with `npm run game`; dev server with `tools/dev-server.sh` (port 5317).

## Live
- Site: https://deltarune-fights.pages.dev (Cloudflare Pages project `deltarune-fights`, deploy with `npm run deploy`)
- Source: https://github.com/NikoMyBelovedd/deltarune-fights (public, AGPL-3.0; no game files anywhere in history)
- Regression: `tests/matrix.sh` runs all 10 fights x 5 modes + variants headlessly (53 runs, all OK at last run)

## Status
- **All ten fights are playable** in Normal, Hitless, Practice, Single Attack and Endless, with phase select and variants:
  - Jevil, King (Ch1)
  - Spamton NEO in Normal and Snowgrave versions, Queen (Ch2)
  - Roaring Knight, Tenna (Ch3)
  - Titan, Gerson (Ch4)
  - Flowery, Pink with default/nicer/meaner bombs (Ch5)
- **How they were verified:**
  - Headless desktop runs: `tools/patch/run-desktop.sh`, which is parallel-safe.
  - Chromium browser runs (`tests/browser/*.mjs`), one fight per chapter.
- **Engine patches:**
  - Pause, game speed and replays for the web build.
  - Corrected `game_set_speed` argument order.
  - A GLSL ES 3.00 fallback that recovers every shader WebGL rejects: 2 in Ch3, 2 in Ch4, 8 in Ch5.
- **Site features:** menus, gear and items, stat editor, dials, share links, records, replays (verified deterministic), skip intro, gamepad support, rebinding.
- **Approximate or unfinished:**
  - Story-legal gear lists for Ch2–5 are approximate: every non-debug item of the chapter. Ch3–5 default equipment is left to the game (shown as GAME DEFAULT).
  - Normal-route Spamton NEO's full intro includes the interactive "HOLD Z" shooting section. That's authentic, but it means the headless bots only reach the battle through the quick-intro path.
  - Some attack names are generic, like Knight "PHASE 1 - 3", Tenna "TENNA ATTACK 1" and Gerson "TURN n".
  - The Snowgrave variant is fought by Kris alone, but the equipment screen still shows three party members.
- **Build:** `npm run build` produces `dist` (414MB; the largest file is 20MB).

## Gotchas
- **Ch3 in the install is modded (Kaizo Knight).** Use the vanilla copy at `~/Documents/DELTARUNE-kaizo-backup-20260909-DyuZxR/data.win`; the build scripts already do this.
- Never write to the game install.
- Restart Vite with `tools/dev-server.sh`, not `pkill -f vite`, which kills your own shell.
- The worker must use `HEAPU8.buffer` views, because HEAP32 isn't exported by the engine build.
- Cloudflare Pages has a 25 MiB per-file limit; the bundler's gzip and split step handles it.

## Pending user decisions
- None blocking. Possible next steps: record real battle idles for the other 8 menu previews (tools/build/capture.ts), research story-legal gear lists for Ch2-5, nicer attack names for Knight/Tenna/Gerson.
