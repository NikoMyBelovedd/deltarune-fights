# deltaruneWEB — Plan

Browser recreations of DELTARUNE boss fights (fights only, not the game), aiming for near 1:1 accuracy.
Reference project: https://shadowcrystal.dev/DEVICE_KNIGHT/ (Roaring Knight only).

## Approach (revised 2026-09-27)
- **Run the original bytecode.** Each chapter's `data.win` runs unmodified in [Butterscotch](https://github.com/ButterscotchRunner/Butterscotch) (open-source GameMaker runner, AGPL-3.0) compiled to WebAssembly. Its compatibility list rates Ch1–2 "Perfect" and Ch3–5 "Playable". This is more faithful than transpiling GML. The GML parser in `tools/gml/` is kept for data extraction.
- **Patch, don't port.** `patches/chN/` holds small GML patches compiled into `data.win` by UndertaleModTool's compiler: boot straight into a fight, apply the loadout, report events (`show_debug_message("@@DRWEB ...")`), and implement the modes by steering the game's own variables (for example `scr_ambush()` to skip player turns, and the boss's own turn counter to force attacks).
- Engine fixes live in `patches/butterscotch/*.patch`, applied onto a pinned Butterscotch commit by `tools/setup.sh`.
- The page shell (menus, records, settings) is TypeScript and Vite, drawn in DELTARUNE style on a 640×480 canvas with the game's own fonts and sprites (extracted at build time).
- Game install: `~/.var/app/com.valvesoftware.Steam/.local/share/Steam/steamapps/common/DELTARUNE/chapter{1..5}_windows/`
- **Chapter 3 in the install is modded (Kaizo Knight).** The vanilla Ch3 `data.win` is at `~/Documents/DELTARUNE-kaizo-backup-20260909-DyuZxR/data.win`. Always extract Ch3 from there.

## Assets & hosting
- **No game assets in git, ever.** `npm run game` builds everything from the local install into gitignored folders (`.gamedata/`, `public/game`, `public/ui`, `public/data`).
- Files over 4 MB ship gzipped and split into parts under 20 MiB (Cloudflare Pages has a 25 MiB per-file limit). The worker streams and stitches them into the browser's OPFS cache, keyed by content hash.
- Public site on **Cloudflare Pages via direct upload** (`npm run deploy`), `*.pages.dev` for now, custom domain later.
- Source: https://github.com/NikoMyBelovedd/deltarune-fights (public, AGPL-3.0).

## Fight scope
- **Full battle**: party, FIGHT/ACT/MAGIC/ITEM/SPARE/DEFEND, TP, spells, attack bars, in-battle dialogue, win/lose.
- **Intro and outro scenes around the fight**: play on first visit, skippable after, auto-skipped in Hitless, Single Attack and Endless. No pre-fight story beyond that.

## Bosses (build order)
1. Jevil (Ch1)
2. King (Ch1)
3. Roaring Knight (Ch3)
4. Spamton NEO (Ch2) — variants: Normal, Snowgrave (Kris + Noelle)
5. Queen (Ch2) — the turn-based battle
6. Tenna (Ch3)
7. Titan (Ch4)
8. Gerson (Ch4)
9. Flowery (Ch5)
10. Pink (Ch5) — variants: Easy, Normal, Harder Bombs
11. Giga Queen (Ch2) — bonus, later

## Loadout
- Weapons and armor per party member: default = obtainable by that fight's story point; a **Sandbox** toggle unlocks gear from any chapter plus a stat editor (LV/HP/ATK…).
- Consumable items inventory, up to the game's slot limit.
- Defaults are a sensible story-accurate loadout per boss.
- Party stats = story-point stats + gear.

## Modes
- **Normal**: full fight.
- **Hitless**: any damage to any party member (even 1) → instant restart.
- **Single Attack**: pick one attack, loops forever, with a clean-dodge counter.
- **Practice**: full fight, no game over, with a hits/damage counter.
- **Phase select**: start at a chosen phase or turn.
- **Endless**: all of the boss's attacks shuffled, escalating over time.
- **Dials**: bullet multiplier, bullet cooldown (as in DEVICE_KNIGHT).
- **Replays**: record and play back runs, for proof of no-hit clears.
- **Share codes**: encode boss, variant, mode, gear and dials.

## UI & input
- All menus drawn in DELTARUNE style inside the 640×480 canvas (boss select → variant/gear/items → mode → fight).
- Keyboard + gamepad, rebindable. No touch controls for now.
- Settings: separate music/SFX volume, graphics/scaling, controls.
- localStorage: clears and records per boss and mode, settings, last loadout per boss.
- English only; text system built to allow Japanese later.

## Verifying accuracy (definition of done per boss)
1. Automated: headless run of each attack; bullet counts, positions, speeds and timings checked against the decompiled logic.
2. Side-by-side: frame-by-frame comparison against clips recorded from the real game (user records on request).
3. User playtest sign-off; anything that feels off → a list of known differences, then fixed.

## Deferred
- Giga Queen, touch controls, Japanese, extra modifiers, easter eggs.
