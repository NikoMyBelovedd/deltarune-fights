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
- **Ch2–5 fights: partial, unverified.** The four porting agents were stopped mid-work before writing their `docs/chN-fights.md` or FightDef snippets. What they left:
  - `patches/ch{2,3,4,5}/drweb_chN.gml` + `manifest.json` exist for every chapter.
  - Test configs for all ten fights are in `tests/configs/ch*-*.ini`.
  - Screenshots are in `docs/ch2-shots`, `docs/ch4-shots`.
  - Last known state of each chapter:
    - **Ch2 (Spamton NEO + Snowgrave, Queen):** most complete. Configs cover every mode. Last step in progress: "fix the Queen intro double-emit and rebuild".
    - **Ch3 (Knight, Tenna):** GML written; it was still writing `manifest.json`, so the manifest may be incomplete.
    - **Ch4 (Titan, Gerson):** hooks written, including per-attack single configs for both bosses. It was about to write the doc.
    - **Ch5 (Flowery, Pink):** Flowery hooks written. It had just finished Pink research and was starting Pink's hooks (variant flag, quick intro, attack forcing, phases, win hook), so **Pink is likely missing or incomplete**.
  - For each chapter, the next steps are:
    1. Run `tools/patch/build.sh N` and fix any compile errors.
    2. Run each `tests/configs/chN-*.ini` with `tools/patch/run-desktop.sh N <ini> --headless --playback-inputs $PWD/tests/inputs/mash-z-long.json --exit-at-frame 3000`. Check for `@@DRWEB battle`, `attack` and `hit` events, and look at the screenshots.
    3. Write the FightDef entries in `src/fights.ts` (music list = every `snd_init` in the fight's code; attacks and phases come from the GML maps) and set `available: true`.
    4. Run `node tools/build/bundle.ts N`, then test in the browser.
  - This work is committed as a WIP commit and is untested.
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
