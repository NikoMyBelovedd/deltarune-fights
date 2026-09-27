# Porting a boss fight

Every fight runs DELTARUNE's **original bytecode** in Butterscotch (a GameMaker runner). We never reimplement game logic. We patch each chapter's `data.win` with a small amount of GML that:

1. boots straight into the fight with the right story state and loadout,
2. reports events to the web page, and
3. implements the modes by nudging the game's own variables.

Chapter 1 (Jevil and King) is the reference implementation: `patches/ch1/`, `patches/common/drweb_core.gml`.

## Pieces

| Path | What |
|---|---|
| `patches/common/drweb_core.gml` | Chapter-agnostic: config loading (`drweb.ini`), `drweb_emit`, loadout, hit, game-over and restart hooks, the Single/Endless turn skip (`drweb_battle_step`), `drweb_turn_attack`, `drweb_bag_next`. **Do not edit it from a chapter port.** If you need a change, describe it in your doc. |
| `patches/chN/drweb_chN.gml` | `{{include:../common/drweb_core.gml}}` plus chapter-specific story-state functions, `drweb_boot_fight()` (a switch on `global.drweb_boss`), and per-boss step hooks. |
| `patches/chN/manifest.json` | Code operations applied by `tools/patch/apply.csx`: `replace`, `append`, `prepend`, `find` (find/replace on the decompiled text; throws if the text isn't found). |
| `tools/patch/build.sh N` | Builds `.gamedata/build/chN/data.win`. Ch3 is built from the vanilla backup automatically; the installed Ch3 is modded. |
| `tools/patch/run-desktop.sh N <ini> [butterscotch args]` | Runs the patched chapter in desktop Butterscotch. Useful args: `--headless --screenshot out.png --screenshot-at-frame F --exit-at-frame F2 --playback-inputs file.json`. Events print as `Game: @@DRWEB <name> <data>`. |
| `tools/patch/gen-inputs.mjs` | Generates input playback JSON, e.g. `mash:Z:30:3000:12`. |
| `.gamedata/chN/CodeEntries/*.gml` | Decompiled code. `.gamedata/chN/export/data.json` holds rooms, objects and sprites. |

## Required hooks per chapter (mirror `patches/ch1/manifest.json`)

- `obj_initializer2_Step_0`: replace the final `room_goto(...)` with `drweb_boot_fight();`. The chapter's own init (localization, `scr_gamestart`, audio loading) must still run first.
- `scr_damage`: call `drweb_on_hit(tdamage, target);` right where HP is actually reduced (only on real damage).
- `scr_gameover`: `if (drweb_on_gameover()) exit;` at the top.
- `scr_tempload`: `drweb_restart("gameover"); exit;` at the top, so continuing after a game over retries the fight.
- `obj_battlecontroller_Create_0`: append `drweb_emit("battle", global.encounterno);`.
- `obj_battlecontroller_Step_0`: prepend `drweb_battle_step();`.
- Each boss: when its fight is over (outro finished, the moment it would leave the room or change room), call `drweb_finish("<how>")`.
- Each boss enemy object's Step: prepend a `drweb_<boss>_step()` that, at the start of each enemy turn (the `global.mnfight == 1 && talked == 0` moment or the chapter's equivalent), calls `drweb_turn_attack(count)` and, if it returns >= 0, sets the boss's own turn/attack variables so that attack plays **with its own speech line and turn length**. Prefer steering the boss's script position over overwriting the chosen attack afterwards.

## Emitted events the page understands

`start <boss>` (entering the fight room), `battle <encounterno>`, `hit <dmg> <target>`, `attack <id|-1>` (each enemy turn), `gameover`, `restart <why>`, `win <how>`.

## Story state

Start from `scr_gamestart()` (the fresh-game defaults), then set only what this fight needs: party (`global.char[]`), `charauto`, `plot`, the flags the fight or room reads, HP/stats as they are **at that point in the story** (later chapters level up: check how `scr_gamestart_chapter_override`, `scr_load` or chapter-transition code sets stats), `darkzone`, then `drweb_apply_loadout()`. Use the game's own quick-retry flags (for example `tempflag[4]` for Jevil and `tempflag[8]` for King) for "skip intro" and for retries.

## Deliverables for each fight

1. A section in `docs/chN-fights.md`: how it starts, the story state, the attack table with ids and names (for Single Attack), phases if any, how it ends, any variants, the music files it plays (every `snd_init("x.ogg")` reachable from the fight, including game over), and **Butterscotch problems** (crashes, missing functions, visual bugs, with evidence).
2. Working patch code in `patches/chN/`, verified with `tools/patch/build.sh N` and headless runs of `run-desktop.sh`: the fight must reach `battle`, attacks must play, `hit` must fire, and Single/Endless must work. Include screenshots in your report.
3. The `FightDef` data for `src/fights.ts` (music, attacks, phases, legal gear ids, defaults, party), written in the doc as a TypeScript snippet. **Don't edit `src/fights.ts` yourself.**

Never modify the game install. Never edit files outside `patches/chN/` and `docs/`, except test configs under `tests/configs/chN-*` and `tests/inputs/`.
