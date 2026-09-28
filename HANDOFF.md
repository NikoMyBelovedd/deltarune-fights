# Handoff: deltaruneWEB (2026-09-27)

Read `PLAN.md` for the agreed scope and `docs/porting-guide.md` for how a fight gets ported.

## Architecture
- The site runs DELTARUNE's **original bytecode** in Butterscotch, compiled to WASM. Engine files: `public/engine/butterscotch.*`, built by `tools/build/engine.sh`.
- Engine patches (pause, game speed, replay recording, `game_set_speed` fix) are in `patches/butterscotch/*.patch`. `tools/setup.sh` applies them onto commit `80fa203`.
- GML patches in `patches/chN/` are compiled into each chapter's `data.win` by the UndertaleModTool CLI (`tools/patch/build.sh N`). They boot straight into the fight, apply the loadout and dials, and implement the modes. Events reach the page as `show_debug_message("@@DRWEB ...")`.
- The page is `src/` (Vite + TS): menus in `src/ui/app.ts`, the engine host in `src/engine/host.ts`, and the fight registry in `src/fights.ts`. The worker is `public/engine/drweb-worker.js` (OPFS cache, gzip parts, audio ring, keys, replays).
- No game files are in git. Build them with `npm run game`; dev server with `tools/dev-server.sh` (port 5317).

## Status
- **Jevil and King (Ch1): done.** Normal, Hitless, Practice, Single Attack and Endless all work; Jevil also has phase select. Verified headlessly and in Chromium (`tests/browser/*.mjs`).
- **Working features:** menus, gear and items (story-legal, plus sandbox), stat editor, dials, share links, records, replays (verified to reproduce runs exactly), skip intro, gamepad support, rebinding.
- **Ch2–5 fights:** four background agents were porting them (Spamton NEO normal and Snowgrave, Queen, Knight, Tenna, Titan, Gerson, Flowery, and Pink easy/normal/harder). Their output, if any, is in `patches/ch{2..5}/` and `docs/ch{2..5}-fights.md`. **Check what exists; it may be partial or unverified.** To finish each fight:
  1. copy the FightDef snippet from its doc into `src/fights.ts` and set `available: true`;
  2. run `tools/patch/build.sh N` and then `node tools/build/bundle.ts N`;
  3. test with `tools/patch/run-desktop.sh N <ini> --headless ...` and in the browser.
- **Known risks:** Ch4 relies heavily on shaders, and Butterscotch's compatibility list reports Ch5 Pink as broken. The agents were asked to diagnose these; fixes go in as new `patches/butterscotch/*.patch` files.

## Gotchas
- **Ch3 in the install is modded (Kaizo Knight).** Use the vanilla copy at `~/Documents/DELTARUNE-kaizo-backup-20260909-DyuZxR/data.win`; the build scripts already do this.
- Never write to the game install.
- Restart Vite with `tools/dev-server.sh`, not `pkill -f vite`, which kills your own shell.
- The worker must use `HEAPU8.buffer` views, because HEAP32 isn't exported by the engine build.
- Cloudflare Pages has a 25 MiB per-file limit; the bundler's gzip and split step handles it.

## Pending user decisions
1. Run `! npx wrangler login`, then `npm run deploy` (Pages project `deltarune-fights`).
2. Create a public GitHub repo and push. AGPL requires the engine source to be available once the site is live. Nothing has been pushed yet; commits are local only.
