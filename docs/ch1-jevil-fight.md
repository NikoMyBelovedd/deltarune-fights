# Chapter 1: how the Jevil (obj_joker) fight starts, runs and ends

Source: `.gamedata/ch1/CodeEntries/` (decompiled from `chapter1_windows/data.win`, GMS 2023.6, 640x480 at 30 fps).
All paths below are relative to that folder, and the `gml_Object_` / `gml_GlobalScript_` prefixes are dropped. For example, `obj_joker_Step_0:213` means `gml_Object_obj_joker_Step_0.gml` line 213.
English text comes from `chapter1_windows/lang/lang_en.json`. `scr_84_get_lang_string(key)` is a `ds_map` lookup into that file (`scr_84_lang_load`).

**Event file names**:
- `Step_0` = Step, `Step_1` = Begin Step, `Step_2` = End Step.
- `Other_10..25` = User Event 0..15. So `obj_joker_Other_15` = `event_user(5)` and `Other_20` = `event_user(10)`.
- `Other_4` = Room Start, `Other_72` = Async Save/Load, `Other_75` = Async System.
- `Draw_64` = Draw GUI, `Draw_75` = Draw GUI End, `Draw_76` = Pre-Draw, `Draw_77` = Post-Draw.

---

## 1. How a battle starts

### 1.1 Generic Ch1 encounter pipeline

| Step | Code | What it does |
|---|---|---|
| 1 | `scr_encountersetup(n)` (`scr_encountersetup.gml`) | Reads the view origin `xx,yy` (`__view_get(XView/YView)`). Sets `global.heromakex/y[0..2]` (hero battle positions), `global.monsterinstancetype[0..2]` (object to spawn), `global.monstertype[0..2]` (stat block id, where 0 means an empty slot), `global.monstermakex/y[]` and `global.battlemsg[0]` (the flavour text on the first menu). |
| 2 | Event object sets `global.encounterno = n`, `global.specialbattle`, `global.flag[9]` (1 = custom battle music), `global.batmusic[0]`, then `instance_create(0,0,obj_encounterbasic)` | |
| 3 | `obj_encounterbasic_Create_0` | Sets `global.interact = 2` and fades out the overworld song if `flag[9]==1`. Calls `scr_encountersetup(global.encounterno)` again. Hides `obj_mainchara` and `global.cinstance[0/1]` (the caterpillar followers) and spawns `scr_dark_marker` copies of them that slide to `heromakex/y`. |
| 4 | `obj_encounterbasic_Step_0` | After 10 frames: plays `snd_impact` and `snd_weaponpull_fast` and switches to the battle-intro sprites. After 15 more frames: destroys the markers and runs `instance_create(0,0,obj_battlecontroller)` (line 111). |
| 5 | `obj_battlecontroller_Create_0` | Starts the battle music (`mus_loop_ext(global.batmusic[0],0.7,1)` if `flag[9]`). Resets all battle globals, including `global.tension = 0`. For each slot with `monstertype>0` it creates the enemy at `monstermake*`, sets `.myself = i` and runs `event_user(12)` on it (lines 92-104). That event is the enemy's own `scr_monstersetup()`, which reads stats from `global.monstertype[myself]`. It then creates `obj_herokris/obj_herosusie/obj_heroralsei` from `global.char[i]` (lines 163-196), computes `global.battleat/df/mag[i]` (lines 115-117) and creates `obj_tensionbar`. |

The battle does **not change room**. Every battle object is created on top of whatever room is current, and everything is placed relative to view 0.

### 1.2 Jevil specifics

- **Encounter number 25** (`scr_encountersetup.gml:292-306`):
  - heroes at view + (80,100), (90,150), (100,210);
  - `monsterinstancetype[0]=obj_joker`, `monstertype[0]=20`, placed at view + (500,160);
  - slots 1 and 2 empty;
  - battlemsg "* LET THE GAMES BEGIN!".
- **Monster type 20** (`scr_monstersetup.gml:487-511`): "JEVIL", HP 3500, AT 10, DF 5, 0 EXP and gold, `sparepoint 0`, `mercymax 999`. Its ACTs:
  - Check;
  - Pirouette (actor 1 = Kris, 50 TP, "Random Chaos");
  - Hypnosis (actor 4 = whole party, 125 TP, "Induce TIRED").
- **Room**: `room_cc_joker` (room index 112). It is 640x480 with views enabled: view 0 is (0,0,640,480), the port is 640x480 and no object is followed. It has no creation code. Instances:
  - `obj_mainchara` (40,240)
  - `obj_darkcontroller` (0,0)
  - `obj_jokerbg_triangle_real` (40,0)
  - `obj_markerA`
  - `obj_doorB` (exit to the left)
  - `obj_jokerbattleevent` (440,160)
- **How you reach it**: through the prison door in `room_cc_prison_prejoker` (room 111, 1840x1200) once the Door Key has been used (`flag[241]=5`, `scr_text:2621`).
- **Persistent controllers**:
  - `obj_gamecontroller`: persistent, placed in `ROOM_INITIALIZE` (room 0) together with `obj_initializer2`, `obj_debugcontroller` and `obj_roomcontroller`.
  - `obj_time`: persistent, created by `obj_initializer2`. It polls input into `global.input_*`.
  - `obj_persistentfadein`: persistent, used for the room transition afterwards.
- **Caterpillar followers**: created by `obj_darkcontroller_Create_0:42-83` from `global.char[]`. At Jevil, `global.cinstance[0]` is Susie and `[1]` is Ralsei.

### 1.3 Exact start sequence (`obj_jokerbattleevent`)

`obj_jokerbattleevent_Create_0`:
- `quick = (global.tempflag[4]==1)`. `obj_joker_Create_0:57` sets that tempflag, so every retry after a game over uses the short intro.
- If `flag[241] >= 6` (already beaten), the event destroys itself.
- Otherwise `con = 1`.
- `obj_jokerbattleevent_Alarm_4` is `con += 1`, so odd `con` values are timed waits.
- The event object is drawn with its default sprite (`spr_joker_main`, x2). That is the Jevil you see before the fight.

| con | Line | Action |
|---|---|---|
| 1 | 1 | Calls `scr_encountersetup(25)` (only to get positions). Moves itself to monster slot 0 (y+100). Hides the overworld party and spawns 3 `scr_dark_marker` party sprites off-screen left, walking in (`hspeed 2`; 5 when quick). Alarm 83 (33 when quick). |
| 3 | 56 | Party halts. Alarm 20 (quick: jump to con 6). |
| 5 | 73 | `snd_joker_laugh1`, then dialogue (`obj_dialoguer`): "UEE HEE! VISITORS, VISITORS! …", Ralsei "So what are we playing, exactly...?", Jevil "OH, IT'S JUST A SIMPLE NUMBERS GAME." |
| 6 | 87 | Waits for `!d_ex()` (dialogue gone). Laugh, alarm 10. |
| 10 | 94 | `snd_rudebuster_swing`. Two `spr_joker_scythebody` scythes fall past Susie (`bulcon` 1-3, afterimages). |
| 12 | 142 | Party shock sprites and knock-back. Alarm 45 (quick: `snd_free_all`, jump to 22). |
| 14 | 169 | "WHEN YOUR HP DROPS TO 0, YOU LOSE!", then Susie "So that's the kinda game you wanna play, huh...?" and "Then, I gotta warn you..." |
| 15.1 | 191 | Party battle poses (`spr_*b_attack`), `snd_laz_c`, alarm 60. |
| 17 | 229 | Susie: "You're dealing with a couple of sharks." |
| 18 | 236 | Loops `snd_joker_laugh0`. |
| 20 | 243 | "UEE HEE HEE! SHARK-TO-SHARK! …" and "NOW, NOW!! LET THE GAMES BEGIN!!" |
| 21 | 252 | `snd_free_all`, stops the laugh. |
| **23** | **259-307** | **Battle trigger.** Moves `obj_mainchara` and `global.cinstance[0/1]` onto the markers and makes them visible. Then sets `global.flag[9]=1`, `global.batmusic[0]=snd_init("joker.ogg")`, `global.encounterno=25`, `global.specialbattle=3` and calls `instance_create(0,0,obj_encounterbasic)`. Jevil flies up (`bulcon=10`). |
| 25 | 326 | Once `obj_battlecontroller` exists: hides itself and sets `obj_jokerbg_triangle_real.on=1`. The background is forced off if `flag[8]==1` ("Simplify VFX"). |
| 28 | 345 | Waits for `obj_battlecontroller` to be gone (see section 4). |

`global.specialbattle = 3` matters at the end. `scr_endcombat` still creates `obj_endbattle`, but `obj_endbattle` does not reset `obj_mainchara.cutscene` or `global.interact`, so the event keeps control of the scene after the battle.

About the "I CAN DO ANYTHING" line: it is **not** part of the pre-battle cutscene.
- It is Jevil's in-battle speech bubble on turn 7 (`obj_joker_Step_0:125-129`).
- It is also one of the random lines on the loop turns (`:186-190`).
- The `snd_joker_anything` voice clip also plays when attacks 4 and 8 start (`obj_joker_Other_15:57,95`).
- The whole pre-battle scene is driven by `obj_jokerbattleevent_Step_0`, described above.

---

## 2. Minimum global state

### 2.1 Boot chain in a fresh game (what our shim must replicate)

1. **Global init scripts** run before the first room: `scr_ds_list_write/read`, `scr_chapterswitch`, `dsmapToStruct`, `scr_timedisp`, `scr_damage_cache`. Then `GlobalScript_0/1/2`:
   - `__init_d3d()`: `camera_create` and a vertex format.
   - `__init_global()`.
   - `__global_object_depths()`: fills `global.__objectID2Depth[]`. **The compat script `instance_create(x,y,obj)` uses it** (`instance_create.gml` calls `instance_create_depth(x,y,object_get_depth(obj),obj)`), so object default depths come from this table. For example, obj_joker is 10.
2. **`ROOM_INITIALIZE`** holds `obj_initializer2`, `obj_gamecontroller` (persistent), `obj_debugcontroller` and `obj_roomcontroller`.
3. **`obj_initializer2_Create_0`** (non-console path, lines 83-101):
   - `global.is_console`, `global.debug=0`, `global.launcher` (from `scr_init_launch_parameters`), `global.chapter=1`, `global.screen_border_*`, `global.savedata_*`, `global.version`;
   - `scr_84_init_localization()`: sets `global.lang`, `lang_map`, `font_map`, `chemg_sprite_map` and `chemg_sound_map`, and calls `scr_ascii_input_names`;
   - `scr_84_load_ini()`;
   - **`scr_gamestart()`**;
   - `global.damagefont = font_add_sprite_ext(spr_numbersfontbig,"0123456789",20,0)` and `global.hpfont = font_add_sprite_ext(spr_numbersfontsmall, <lang string>, 0, 2)`;
   - `global.tempflag[0..99]=0` and `global.heartx/hearty = 300/220`;
   - `scr_prefetch_textures()` and `scr_load_audio()` (loads audio groups 1 and 0);
   - `instance_create(obj_time)`.
4. **`obj_initializer2_Step_0`**: once `audio_sfx` has loaded, it goes to `PLACE_CONTACT`, `PLACE_MENU` or `room_legend`, depending on which save files exist. **Skip this and go to our own room.**
5. **`obj_time_Create_0`**: `scr_controls_default()` (sets `global.input_k[0..9]`, `input_g[]`, `button0-2`), clears `global.input_pressed/held/released[0..9]`, then window and fullscreen setup.
6. **`obj_gamecontroller_Create_0`**: `gamepad_active=0`, `gamepad_id=0`, `gamepad_shoulderlb_reassign=0`, `global.gamepad_type="N/A"`.
   - `button1_p()` reads `obj_gamecontroller.gamepad_id` and `gamepad_shoulderlb_reassign`, so **an `obj_gamecontroller` instance must exist**.

`obj_initializer_Create_0` is a legacy debug initializer with different stats (Susie 120 HP, Ralsei MAG 12, tension 500). It is not used. Use `scr_gamestart`.

### 2.2 Globals the battle path reads, and their values at Jevil

I extracted every `global.*` read or written in the minimal battle closure (section 3): 171 names. Most are (re)initialised by `obj_battlecontroller_Create_0` or `scr_encountersetup` and need no preparation. The ones **we must set before creating the battle** are below.

| Global | Init site | Value at Jevil |
|---|---|---|
| `char[0..2]` | `scr_gamestart:17-19` → `obj_prisonevent_Step_0:640-647` (plot 156) | `[1,2,3]` (Kris, Susie, Ralsei) |
| `charauto[0..3]` | `scr_gamestart:41-44` (Ralsei = 1 there) | all `0` after `obj_prisonevent_Step_0:644-647`. Susie is player-controlled. |
| `hp[1..3]`, `maxhp[1..3]` | `scr_gamestart:85-95` | Kris 90/90, Susie 110/110, Ralsei 70/70 (`hp[0]=maxhp[0]=0`) |
| `at[]`, `df[]`, `mag[]` | `scr_gamestart:49-51,87-97` | Kris 10/2/0, Susie 14/2/1, Ralsei 8/2/7. **These never change in Ch1** (no level-ups; `global.lv` stays 1). |
| `charweapon[]`, `chararmor1[]`, `chararmor2[]` | `scr_gamestart:53-55,80-93` | defaults: weapons 1/2/3, no armor (see 2.4) |
| `itemat/itemdf/itemmag[char][0..2]` | **only** `scr_weaponinfo_mine()` (slot 0) and `scr_armorinfo_mine()` (slots 1-2). They are called by the equip menu (`obj_darkcontroller_Step_0:1342,1374,1532`) or restored by `scr_load`. | **Call `scr_weaponinfo_mine(); scr_armorinfo_mine();` after setting equipment.** Otherwise equipment adds 0. |
| `spell[char][slot]` | `scr_gamestart:98-101`, then `scr_spellinfo_all()` | Kris `[7]` (ACT), Susie `[4]` (Rude Buster), Ralsei `[3,2]` (Pacify, Heal Prayer). `obj_battlecontroller_Create_0:28` calls `scr_spellinfo_all()` again. |
| `item[0..11]` (+`item[12]=0` sentinel) | `scr_gamestart:103-115`, then `scr_iteminfo_all()` | loadout (see 2.4). `obj_battlecontroller_Create_0:30-37` snapshots it into `tempitem`. |
| `maxtension` | `scr_gamestart:157` | 250. `tension` is reset to 0 by the battle. |
| `invc` | `scr_gamestart:24` | 1. Invulnerability = `invc*40` frames (`scr_damage`). Jevil's "Awkward" pirouette temporarily sets 0.4. |
| `flag[]` (0..9998) | `scr_gamestart:252-255`, all 0 | see the flag table below |
| `tempflag[0..99]` | `obj_initializer2_Create_0:90-93` | 0. Set `tempflag[4]=1` to get the quick intro. |
| `lang`, `lang_map`, `font_map`, `chemg_sprite_map`, `chemg_sound_map` | `scr_84_init_localization` | `"en"`. `scr_84_get_font("main")` gives `fnt_main` (8bitoperator JVE 12); also `mainbig`, `small`, `tinynoelle`, `dotumche`, `comicsans`. |
| `damagefont`, `hpfont` | `obj_initializer2_Create_0:88-89` | `font_add_sprite_ext` sprite fonts |
| `writersnd[]`, `writerimg[]`, `sm*[]` (smalltext), `msg[0..99]`, `typer`, `fc`, `fe`, `choicemsg[]` | `scr_gamestart:185-251` | defaults |
| `input_k/g[0..9]`, `button0..2`, `input_pressed/held/released[0..9]` | `scr_controls_default` + `obj_time` | Z/Enter = confirm (4/7), X/Shift = cancel (5/8), C/Ctrl = menu (6/9), arrows 0-3 |
| `currentsong[0/1]`, `batmusic[0/1]` | `scr_gamestart:223-226` (`snd_nosound`) | `batmusic[0] = snd_init("joker.ogg")` (a stream), `flag[9]=1` |
| `encounterno`, `specialbattle` | `scr_gamestart:26-27` | 25, 3 |
| `is_console`, `launcher`, `debug` | `obj_initializer2_Create_0` | 0, 1 (the music path is `../mus/`, see section 6), 0 |
| `darkzone`, `fighting` | `scr_gamestart` | set to 1 by the battle |
| `heartx/hearty` | `obj_initializer2_Create_0:94` | 300/220 (also used by `obj_gameover_init`) |
| `cinstance[0/1]`, `plot`, `interact`, `entrance`, `facing` | overworld | **not read by the battle itself.** `cinstance` is used by `obj_encounterbasic`, `obj_endbattle` and `scr_endcombat`. `plot` is only read by `scr_monstersetup` for other monster types, so any value ≥156 works (for example 165). |

**Flags that matter**

| Flag | Where | Meaning / value |
|---|---|---|
| `flag[6]` | `obj_writer_Create_0:14` | 1 = text cannot be skipped. Use 0. |
| `flag[8]` | `obj_jokerbattleevent_Step_0:333` | "Simplify VFX": 1 keeps Jevil's triangle background off. Use 0. |
| `flag[9]` | battlecontroller, encounterbasic, endbattle | 1 = custom battle music from `batmusic[0]`. **1.** |
| `flag[10]` | `obj_writer_Draw_0:12` | 1 = hold C to fast-forward text. Use 0. |
| `flag[12]` | `obj_shake` | 1 = screenshake off |
| `flag[13]` | `obj_attackpress_Create_0:173`, `Draw_0:72-127` | FIGHT attack-bar display variant (0 default) |
| `flag[14]` | `scr_battlecursor_memory_reset` | battle cursor memory (0 = reset each turn) |
| `flag[15]` / `flag[16]` / `flag[17]` | `scr_gamestart:273-276` | SFX 1 / music 0.85 / master 0.6. `mus_loop_ext` multiplies by `flag[16]`. |
| `flag[29]`, `flag[30]` | `obj_face_Draw_0`, `obj_writer_Draw_0:585` | portrait variants, 0 |
| `flag[50..53]` | written by the battle | battle result (the battle resets them) |
| `flag[241]` | Jevil progress | 0 not met → 1 talked → 5 door opened → 6 beaten by violence → 7 beaten by tiring. Must be <6 or `obj_jokerbattleevent` deletes itself. |
| `flag[242]` | set only if the reward did not fit | 1/2 = reward left in a chest |

### 2.3 Equipment and stat formula

- `scr_weaponinfo(id)` and `scr_armorinfo(id)` are big `switch` statements. They set temporaries: `weaponattemp/dftemp/magtemp/...` and `weaponchar1/2/3temp` (who can equip it).
- `scr_weaponinfo_mine` (lines 18-23) copies weapon stats into `global.itemat/itemdf/itemmag/itembolts/itemgrazeamt/itemgrazesize[char][0]`. `scr_armorinfo_mine` (lines 42-47 and 60-65) does the same for slots 1 and 2. The index is the **character id** (1 Kris, 2 Susie, 3 Ralsei), not the party slot.
- Battle stats (`obj_battlecontroller_Create_0:115-117`):
  - `battleat[i] = at[c] + itemat[c][0] + itemat[c][1] + itemat[c][2]`, where `c = char[i]`;
  - `df` and `mag` are computed the same way.
- Graze amount and graze size (for example Pink Ribbon "TP Range") are **never read in battle** in Ch1. They only appear in menus and save files.
- Jevil-specific TP rule: attacks landed on Jevil give `points/15` TP instead of `points/10` (`obj_heroparent_Alarm_1:44-51`).
- Rude Buster damage = `ceil(mag*5 + at*11 - enemyDF*3)`. Heal Prayer heals `mag*5` (`scr_spell`).

### 2.4 Ch1 items, weapons and armor

**Consumables** (`scr_iteminfo`). The in-battle effect is `scr_spell` case `200+id`, lines 202-285. Overworld use (`scr_itemuse`) differs for some items.

| id | Item | Battle effect | Obtainable before Jevil |
|---|---|---|---|
| 1 | Dark Candy | heal 40 | yes (Seam $40, trees) |
| 2 | ReviveMint | revive / heal max/2 | yes (3 chests) |
| 3 | Glowshard | none (sell item) | yes |
| 4 | Manual | none | yes |
| 5 | BrokenCake | heal 20 | no source in code |
| 6 | Top Cake | party +160 | yes (one-time trade) |
| 7 | Spincake | party +80 | yes (Top Chef) |
| 8 | Darkburger | heal 70 | yes (Seam $70) |
| 9 | LancerCookie | heal 50 (overworld: 4) | yes (bake sale) |
| 10 | GigaSalad | heal 4 | no source |
| 11 | ClubsSandwich | party +30 | yes (chest `room_cc_2f`) |
| 12 | HeartsDonut | Kris 10 / Susie 90 / Ralsei 60 | yes (bake sale) |
| 13 | ChocDiamond | Kris 80 / Susie 30 / Ralsei 30 | yes (bake sale, Rudinn) |
| 14 | Favwich | heal 500 | no source |
| 15 | RouxlsRoux | heal 60 | yes (Rouxls shop $50) |

**Weapons** (`scr_weaponinfo`)

| id | Name | AT/DF/MAG | Who (K/S/R) | Before Jevil |
|---|---|---|---|---|
| 1 | Wood Blade | 0/0/0 | K | start |
| 2 | Mane Ax | 0/0/0 | (nobody can re-equip it) | Susie starts with it |
| 3 | Red Scarf | 0/0/0 | R | start |
| 4 | EverybodyWeapon | 12/6/8 | KSR | debug only |
| 5 | Spookysword | 2/0/0 | K | Seam $200 |
| 6 | Brave Ax | 2/0/0 | S | Rouxls $150 |
| 7 | Devilsknife | 5/0/4, Rude Buster costs 100 | S | **Jevil reward (violence)** |
| 8 | Trefoil | 4/0/0, +5% gold | K | no source in Ch1 |
| 9 | Ragger | 2/0/0 | R | chest `room_forest_area2A` |
| 10 | DaintyScarf | 0/0/2 | R | Rouxls $200 |

**Armors** (`scr_armorinfo`)

| id | Name | AT/DF/MAG | Who | Before Jevil |
|---|---|---|---|---|
| 1 | Amber Card | 0/1/0 | KSR | Seam and Rouxls $100 (repeatable) |
| 2 | Dice Brace | 0/2/0 | KSR | chest `room_forest_area3A` (unique) |
| 3 | Pink Ribbon | 0/1/0 (+graze size) | K R | no source |
| 4 | White Ribbon | 0/2/0 | K R | chest `room_field_maze` (unique) |
| 5 | IronShackle | 1/2/0 | KSR | prison cell (unique) |
| 6 | MouseToken | 0/0/2 | KSR | no source |
| 7 | Jevilstail | 2/2/2 | KSR | **Jevil reward (non-violence)** |

**Key items**: 1 Cell Phone (start), 2 Egg, 3 BrokenCake, 4/6/7 Broken Keys A/B/C, 5 Door Key, 13 ShadowCrystal (Jevil reward, `scr_keyitemget(13)`).

**Suggested presets**

| Preset | Kris | Susie | Ralsei |
|---|---|---|---|
| **Default** (no upgrades) | Wood Blade, no armor | Mane Ax, no armor | Red Scarf, no armor |
| **Best legal pre-Jevil** | Spookysword + IronShackle + White Ribbon → AT13 DF6 MAG0 | Brave Ax + Dice Brace + Amber Card → AT16 DF5 MAG1 | DaintyScarf + Amber Card x2 → AT8 DF4 MAG9 |

Unique items (Dice Brace, White Ribbon, IronShackle, Ragger) can each go to only one character.

---

## 3. Dependency closure

I built the closure with a script that follows everything a file reaches:
- every script function it calls (`function NAME(` definitions in GlobalScripts);
- every object it **instantiates** (`instance_create*`, `scr_dark_marker`, `scr_marker`);
- the parent chain of every object (for inherited events).

References through `with (obj)`, `instance_exists(obj)` or `obj.var` only need the object index, not its code, so they are not followed. The script also counts every identifier followed by `(` that is not a defined script or method.

Totals in the game:
- **1680 code entries**: 1293 top-level entries (the `.gml` files) plus 387 child function entries (`gml_Script_*`, functions defined inside GlobalScripts).
- 92,160 lines in all.

| Closure | Objects | .gml files | Code entries (incl. child funcs) | Lines |
|---|---|---|---|---|
| **Minimal battle**: `obj_battlecontroller`, `obj_joker`, `obj_jokerbg_triangle_real`, `obj_endbattle`, `obj_time`, `obj_gamecontroller`, with `scr_text`, save/load, overworld and `scr_gameover`'s room chain stubbed | **58** | **254** | **~257 / 1680 (15%)** | 15,747 |
| Core + real game over + save/load (non-Jevil bullets excluded) | 66 | 340 | ~348 | 22,796 |
| + intro/outro cutscene (`obj_jokerbattleevent`, `obj_mainchara`, `obj_caterpillarchara`, `obj_darkcontroller`) | 74 | 394 | ~402 | 28,054 |
| Conservative (every mentioned object, including `with()`/`instance_exists` references) | 194 | 782 | ~829 | |

The difference between the last two rows is almost all false positives:
- `obj_dbulletcontroller_Step_0` holds the bullet patterns for every Ch1 enemy (types 0-85);
- `obj_battlecontroller` mentions other bosses' event objects in `instance_exists` checks;
- `scr_text` is the whole game's dialogue table.

The biggest files in the minimal set (lines):
- `obj_dbulletcontroller_Step_0` (1674; only lines 985-1654, the `joker==1` block, matter);
- `obj_writer_Draw_0` (947);
- `obj_battlecontroller_Step_0` (881);
- `obj_joker_Step_0` (650);
- `scr_monstersetup` (630);
- `scr_getbuttonsprite` (532);
- `obj_battlecontroller_Draw_0` (443);
- `obj_face_Draw_0` (340);
- `scr_spell` (300);
- `obj_heroparent_Draw_0` (279);
- `obj_heart_Step_0` (277).

### 3.1 Objects in the minimal battle closure (58)

**Battle core**
- `obj_battlecontroller`, `obj_tensionbar`
- `obj_herokris`, `obj_herosusie`, `obj_heroralsei` (parent `obj_heroparent`)
- `obj_attackpress`, `obj_burstbolt`, `obj_basicattack`
- `obj_spellphase`, `obj_rudebuster_anim`, `obj_rudebuster_bolt`, `obj_pacifyspell`, `obj_healanim`
- `obj_dmgwriter`, `obj_shake`, `obj_oflash`, `obj_spareanim`, `obj_endbattle`
- `obj_writer`, `obj_battleblcon` (enemy speech bubble), `obj_face` (parent `obj_face_parent`), `obj_smallface`
- `obj_marker`, `obj_afterimage`, `obj_afterimage_grow`, `obj_darkener`

**Soul and box**
- `obj_moveheart` → `obj_heart` (+ `obj_grazebox`); `obj_returnheart`, `obj_heartburst`
- `obj_growtangle` (parent `obj_battlesolid`)

**Jevil**
- `obj_joker` (parent `obj_monsterparent`), `obj_joker_body`
- `obj_jokerbg_triangle_real`, `obj_hypnofx`

**Bullets**
- `obj_dbulletcontroller` (parent `obj_bulletgenparent`)
- `obj_joker_teleport`, `obj_suitbomb`, `obj_heartbomb_blast`, `obj_carouselbullet`, `obj_spadering`
- `obj_clubsbullet_dark`, `obj_dbullet_vert`, `obj_centerscythe`, `obj_laserscythe`
- `obj_regularbullet`, `obj_regularbullet_permanent`, `obj_collidebullet`, `obj_bulletparent`
- `obj_bigscythe` is only a child of `regularbullet_permanent` and is not used by Jevil.

**Persistent**
- `obj_time`, `obj_gamecontroller`

### 3.2 Scripts in the minimal closure (about 110)

**Compat wrappers** (defined in the game, wrapping builtins):
- `__view_get`, `__view_set`, `__view_set_internal`
- `instance_create`, `object_get_depth`
- `d3d_set_fog` → `gpu_set_fog`
- `draw_enable_alphablend` → `gpu_set_blendenable`
- `texture_set_interpolation` → `gpu_set_texfilter`

**Input**
- `button1_p`, `button2_p`, `button2_h`, `button3_p`, `button3_h`
- `up/down/left/right_p/_h`
- `scr_gamepad_axis_check`, `scr_controls_default`, `scr_ascii_input_names`, `scr_getbuttonsprite`

**Audio**
- `snd_play`, `snd_stop`, `snd_volume`, `snd_pitch`, `snd_resume`, `snd_free`, `snd_free_all`
- `mus_loop`, `mus_loop_ext`, `snd_init` (story path)

**Localization**
- `scr_84_get_lang_string`, `scr_84_get_subst_string`
- `scr_84_get_font`, `scr_84_set_draw_font`
- `scr_84_get_sprite`, `scr_84_get_sound`

**Text**
- `scr_texttype`, `scr_textsetup`, `scr_textsound`, `scr_nextmsg`, `scr_asterskip`
- `scr_battletext`, `scr_battletext_default`, `scr_enemyblcon`, `scr_blconskip`

**Battle flow**
- `scr_encountersetup`, `scr_monstersetup`, `scr_monsterpop`, `scr_monsterdefeat`
- `scr_attackphase`, `scr_endturn`, `scr_mnendturn`, `scr_nexthero`, `scr_prevhero`
- `scr_charcan`, `scr_havechar`, `scr_battlecursor_memory_reset`
- `scr_wincombat`, `scr_endcombat`, `scr_spareanim`, `scr_mercyadd`

**Combat maths**
- `scr_damage`, `scr_damage_all`, `scr_damage_cache`/`scr_damage_check`, `scr_damage_enemy`, `scr_dead`
- `scr_heal`, `scr_healall`, `scr_healitemspell`, `scr_healallitemspell`, `scr_revive`, `scr_dmgwriter_selfchar`
- `scr_tensionheal`
- `scr_boltcheck`, `scr_boltcheck_onebutton`
- `scr_retarget`, `scr_retarget_spell`, `scr_randomtarget`, `scr_targetall`

**Spells and items**
- `scr_spell`, `scr_spelltext`, `scr_spellinfo`, `scr_spellinfo_all`, `scr_spellconsumeb`
- `scr_iteminfo`, `scr_iteminfo_all`, `scr_iteminfo_temp`, `scr_itemconsumeb`
- `scr_itemname`, `scr_itemnamelist`, `scr_itemshift`, `scr_itemshift_temp`

**Drawing and helpers**
- `scr_charbox`, `scr_selectionmatrix`, `scr_dark_marker`, `scr_afterimage`, `scr_oflash`
- `scr_bullet_inherit`, `scr_moveheart`, `scr_debug`, `scr_os_checks`/`scr_is_switch_os`, `onSteamDeck`

**Stubs**
- `scr_gameover`, `ossafe_*` (see section 6)

### 3.3 Builtin GameMaker functions used (minimal closure)

Format: `name(calls/files)`. A trailing `!` means the function is not in the local gm-html5 runtime (`tools/gm-html5/scripts`).

```
random(110/20) instance_destroy(93/50) draw_set_color(76/14) draw_sprite_ext(71/21) choose(67/8)
instance_exists(66/36) string_hash_to_newline(54/6) draw_text(40/5) sin(33/11) draw_sprite(31/5)
draw_rectangle(26/9) draw_set_alpha(25/9) merge_color(25/10) abs(23/13) view_get_camera(21/2)
string(19/9) string_char_at(19/4) ceil(18/9) floor(17/7) round(16/6) cos(15/8) place_meeting(15/1)
ds_map_find_value(13/8) event_user(12/8) lengthdir_x(11/7) lengthdir_y(11/7) gamepad_button_check(10/2)
move_towards_point(8/6) variable_global_exists(7/7) draw_self(7/7) ini_read_real(7/3) ord(6/2)
gamepad_axis_value(6/2) draw_text_transformed(6/3) buffer_async_group_option(5/1) string_length(5/4)
collision_point(5/1) point_direction(5/3) point_distance(5/4) show_debug_message(5/3) ini_close(4/3)
draw_set_font(4/4) string_insert(4/2) draw_set_halign(4/2) draw_line_width(4/1) string_width(4/1)
instance_number(4/4) gamepad_get_description(4/2) gamepad_get_guid(4/2) draw_triangle(4/1)
keyboard_check(4/1) audio_play_sound(3/3) is_undefined(3/3) ini_open(3/3) audio_stop_sound(3/3)
draw_get_color(3/2) sprite_get_number(3/1) sprite_exists(3/3) window_set_fullscreen(3/2)
ini_write_real(3/2) surface_get_width(3/3) surface_get_height(3/3) keyboard_check_pressed(3/1)
draw_text_color(3/1) camera_get_view_x/y/width/height/border_x/border_y/speed_x/speed_y(2/2 each)
camera_set_view_pos/size/border/speed(2/1 each) array_length(2/1) sprite_create_from_surface(2/2)
room_goto(2/1) audio_sound_gain(2/2) gamepad_is_connected(2/2) gamepad_test_mapping(2/2)
draw_sprite_part_ext(2/1) window_set_size(2/2) os_is_paused(2/2) window_get_fullscreen(2/2)
window_get_width(2/2) window_get_height(2/2) min(2/1) real(2/1) camera_get_view_angle
camera_get_view_target view_get_visible/xport/yport/wport/hport/surface_id camera_set_view_angle
camera_set_view_target view_set_visible/xport/yport/wport/hport/camera/surface_id
gamepad_button_check_pressed gpu_set_fog gpu_set_blendenable instance_create_depth array_length_1d
environment_get_variable file_exists game_end game_restart ds_map_set string_lower ini_open_from_string
json_encode buffer_create string_byte_length buffer_write buffer_save_async buffer_get_size
buffer_async_group_begin/end asset_get_index string_replace_all os_get_info ds_map_size
ds_map_find_first ds_map_find_next ds_map_destroy ds_map_create audio_stop_all audio_sound_pitch
audio_resume_sound gpu_set_texfilter draw_text_colour gamepad_get_device_count angle_difference
draw_circle sprite_delete display_get_width display_get_height application_surface_enable
application_surface_draw_enable audio_pause_all audio_resume_all instance_deactivate_all
instance_activate_all draw_surface_ext buffer_read json_decode buffer_delete window_center string_delete
switch_controller_support_show! switch_controller_support_get_selected_id! switch_controller_support_set_defaults!
switch_controller_support_set_singleplayer_only! switch_controller_set_supported_styles! switch_save_data_commit!
```

- That is 164 distinct builtins. The only ones missing from gm-html5 are the `switch_*` functions, which are console-only and can be stubbed.
- Adding the intro/outro/overworld path brings the total to 198. The extra ones include `collision_rectangle`, `collision_line`, `ds_list_*`, `file_text_*`, `audio_create_stream`, `audio_destroy_stream`, `audio_is_playing`, `audio_group_set_gain` and `instance_create_depth`.
- The real gameplay core is small: `random`/`choose`, instance lifecycle, `draw_sprite_ext`/`draw_text`/`draw_rectangle`/`draw_triangle`/`draw_sprite_part_ext`, `place_meeting`/`collision_point`, `move_towards_point`, `lengthdir_*`, `audio_play_sound`/`audio_sound_gain`/`audio_sound_pitch`, `merge_color`, and the view/camera compat.

**Exotic features used**

| Feature | Details |
|---|---|
| **Fog as a white flash** | `d3d_set_fog(true, c_white, 0, 1)` → `gpu_set_fog` draws sprites as a solid colour silhouette (hit flashes, spare flash). Used in `obj_joker_Draw_0:72`, `obj_heroparent_Draw_0`, `obj_oflash_Draw_0` and `obj_spareanim_Draw_0` (2x). Our renderer needs a "solid colour, keep alpha" mode. |
| **Blend modes** | None in the Jevil closure (`draw_set_blend_mode` exists in the game but is not reached). |
| **Shaders** | None. |
| **Surfaces** | Only `application_surface`: `sprite_create_from_surface` for the game-over screenshot (`scr_gameover:7`) and the console pause screenshot (`obj_time_Step_1:11`), plus `draw_surface_ext` in `obj_time_Draw_77` (console only). |
| **Precise collision** | Bullet sprites use **precise per-pixel masks**: `spr_spadebullet` 36x34 and `spr_diamondbullet` 33x32 are `Precise`. They are also scaled and rotated (`image_angle`, `image_xscale` 0.4-0.7). The heart uses mask `spr_dodgeheartmask`; `obj_grazebox` uses `spr_grazemask` (50x50 rectangle). Collision events: `obj_heart_Collision_obj_collidebullet` and `obj_grazebox_Collision_obj_collidebullet`, plus lots of `place_meeting`. |
| **RNG** | No `randomize()`/`random_set_seed` anywhere in Ch1. `random`, `choose` and `floor(random(n))` are used throughout. For replays, supply our own seeded RNG. |
| **Legacy GML quirks the port must support** | Scalar globals later indexed as arrays: `global.msg=" "` then `global.msg[i]=…` (`scr_gamestart:188,216`); `global.acting=0` then `global.acting[i]=0` (`obj_battlecontroller_Create_0:25,108`). Fake instance ids used as "none": `mywriter=343249823`, `battlewriter=19212912`, `global.charinstance[i]=12129292`, `global.monsterinstance[i]=12913921839`; `with()`/`instance_exists()` on them must be a no-op. `with (obj)` on an object with no instances must also be a no-op (for example `obj_event_manager`, `obj_hathyfightevent`). Draw events that call `event_user`. Two-dimensional `a[i][j]` arrays. |
| **Asset lookup by name** | `scr_84_get_sound("snd_joker_chaos")` → `asset_get_index` (appends `_ja` for Japanese). |
| **Streamed music** | `snd_init("joker.ogg")` → `audio_create_stream` plus an `obj_astream` holder. `snd_free_all()` destroys every `obj_astream`, which stops the stream. |
| **Speed and window** | `room_speed` 30. The debug keys `` ` `` and numpad 3 change speed only when `global.debug` is set. |

---

## 4. How the fight ends

### 4.1 Turn loop (for reference)

1. **Player menu**: `global.myfight == 0` in `obj_battlecontroller_Step_0`.
2. `scr_endturn` → `scr_attackphase` → `obj_attackpress` (FIGHT bars) or `obj_spellphase` (spells, ACT, items).
3. `obj_attackpress_Draw_0:217` sets `global.mnfight=1` and `myfight=-1`.
4. **Jevil talks**: `obj_joker_Step_0:4-255`, when `global.mnfight==1 && talked==0`.
   - It picks the speech line and **the attack (`jattack`)**, then calls `scr_enemyblcon` (the speech bubble).
   - `scr_blconskip(15)` moves to `mnfight=2` when the bubble finishes. Pressing Z after 15 frames skips it.
5. **Bullets**: `obj_joker_Step_0:262-269` creates `obj_moveheart` (soul) and `obj_growtangle` (box at view + (320,170)).
   - On the 12th frame (`rtimer==12`, line 275) it sets `global.turntimer = 240` and calls `event_user(5)` (`obj_joker_Other_15`), which creates `obj_dbulletcontroller` of the chosen type.
6. `obj_battlecontroller_Step_0:853-880` counts `global.turntimer` down. At 0 it destroys `obj_bulletparent` and `obj_bulletgenparent`, turns the soul into `obj_returnheart`, then `alarm[2]=15` → `scr_mnendturn()`.
   - `scr_mnendturn` revives downed party members to `ceil(maxhp/8)`, then either starts the next menu or calls `scr_wincombat()` if no monsters are left.

### 4.2 The three outcomes

**A. Violence** (Jevil HP ≤ 0)
- `obj_joker_Draw_0:13-31`: in the hurt state (`state==3`), `mhpratio<=0` → `event_user(10)` and **`global.flag[241]=6`**.
- User event 10 (`obj_joker_Other_20`):
  - restores the max HP of any party members jumbled by Pirouette, and restores `global.invc`;
  - sets the body sprite to `spr_joker_teleport`;
  - sets `obj_battlecontroller.skipvictory=1`, so no "You won X EXP" text;
  - calls **`snd_free_all()`** (kills the battle music stream) and sets `body.dancelv=4`;
  - turns the triangle background off;
  - calls `scr_monsterdefeat()` → user event 11 (`exit`), then `instance_destroy()`.
- `obj_joker_body` survives and is reused by the outro.

**B. Non-violence / "TIRED" win**
- `global.monsterstatus[0]=1` (TIRED) is reached in any of three ways:
  - `hypnosiscounter >= 9` (+1 per Hypnosis ACT, +0.5 per Pirouette) (`obj_joker_Step_0:558-562,595-599`);
  - the late-fight timeout: `jturn>=19 && turns >= 29 - hypnosiscounter` (`:79-90`).
- Then **Ralsei's Pacify** (spell 3) resolves it (`scr_spell.gml:58-80`): `global.flag[51+myself]=3`, `event_user(10)`, `scr_monsterdefeat()`.
- SPARE does nothing, because `sparepoint=0` and `mercymax=999`.
- `battlecancel`/`con 1-6` in `obj_joker_Step_0:333-381` is dead code for Jevil; nothing ever sets his `battlecancel`.
- **Note**: while he is alive, `obj_joker_Step_0:3` sets `global.flag[51+myself]=4` every frame. After the battle, `flag[51]==3` therefore means "pacified" and `4` means "killed".

**C. Game over**
- `scr_damage.gml:107-124`: when every `char[]` member has `hp<=0` → `scr_gameover()` (`scr_gameover.gml`):
  - `audio_stop_all()`, `snd_play(snd_hurt1)`;
  - `global.screenshot = sprite_create_from_surface(application_surface…)`, `snd_free_all()`;
  - `room_goto(room_gameover)`.
- In the game-over room, `obj_gameover_init` shows the screenshot, then breaks the heart at `global.heartx/hearty`.
  - At `timer==150` it runs `room_goto(PLACE_FAILURE)` (the DEVICE "continue" screen).
  - Pressing Z four or more times during frames 80-150 calls `scr_tempload()` (reloads temp save slot 9).
  - `global.tempflag[4]` stays 1, so the retry uses the quick intro.

### 4.3 After a win (A or B)

1. `scr_wincombat()` is called from `scr_attackphase.gml:43`, `obj_attackpress_Draw_0:222` or `scr_mnendturn.gml:106`. It sets `myfight=7`, `mnfight=-1` and `obj_battlecontroller.victory=1`.
2. `obj_battlecontroller_Step_0:1-89`: `skipvictory` → `victortimer=-20`, and the tension bar slides out. Once the writer is gone and `bp<=0`: **`scr_endcombat()`** (line 87).
3. `scr_endcombat` (`specialbattle==3` branch): `global.fighting=0`, `instance_create(obj_endbattle)`, destroys all `obj_monsterparent`, `obj_bulletparent` and `obj_heroparent` instances and the battle controller.
4. `obj_endbattle`: markers walk back to `obj_mainchara` and `global.cinstance[]`, which **must exist** (it reads their `.x`). In Alarm 0 (`flag[9]`) it frees `batmusic[0]` and resumes `currentsong[1]`.
5. `obj_jokerbattleevent_Step_0` continues:

| con | Line | Action |
|---|---|---|
| 28 | 345 | When no battlecontroller exists: `if (flag[241] != 6) flag[241] = 7`. |
| 30 | 357 | Starts `prejoker.ogg` (0.7 volume, 0.75 pitch). Changes Susie's follower sprite. `obj_joker_body` fade. Plays the ending speech: violence (6) is lines 294-303 ("WHAT FUN!!! … TAKE ME AND DO YOUR STRONGEST---!"); tired (7) is lines 307-316 ("I'M EXHAUSTED!! … TAKE THIS AND DO YOUR STRONGEST---!"). |
| 31 → 33 | 407, 417 | Body `condition=5` (vanish), then `scr_keyitemget(13)` ShadowCrystal. |
| 34 | 427 | `flag[241]==6` → `scr_weaponget(7)` Devilsknife; otherwise `scr_armorget(7)` Jevilstail. If there is no room, `flag[242]=1/2` (chest). |
| 35 → 37 | 458, 465 | `obj_fadeout` → `global.entrance=2`, `interact=3`, `room_goto(room_cc_prison_prejoker)` with `obj_persistentfadein`. |

### 4.4 Hook points for our wrapper

| Event | Hook | Details |
|---|---|---|
| **Win** | Override `scr_endcombat()` | It is only ever called from `obj_battlecontroller_Step_0:87` after victory. Read the result there: `global.flag[241]==6` means violence (Devilsknife ending); otherwise it was pacified (`flag[51]==3`). Optionally play the outro, then return to the menu. Overriding it also avoids `obj_endbattle`, which needs the overworld party. A non-invasive alternative: poll `global.monster[0]==0` / `!instance_exists(obj_joker)` / `global.flag[241]>=6`. |
| **Lose** | Override `scr_gameover()` | Called from `scr_damage.gml:123`. Keep `audio_stop_all()` + `snd_hurt1` if we want our own heart-break screen: grab a canvas snapshot, then play `obj_gameover_init`'s animation, which only needs `global.screenshot`, `heartx/hearty`, `spr_heartbreak` and `spr_heartshards`. For Hitless mode, hook `scr_damage` or watch `global.hp[]` decreasing. |
| **Quit** | Override `ossafe_game_end()` | Holding ESC for 30 frames in `obj_time_Step_1:17-26` ends the game. Use it as "back to menu". |

---

## 5. Jevil's attacks and how they are chosen

### 5.1 Selection (`obj_joker_Step_0:10-254`, run once per enemy turn)

The instance vars are `jturn` (script position), `jattack` (the chosen attack), `turns` and `hypnosiscounter`.

**HP gates** (`mhpratio = monsterhp/monstermaxhp`, lines 10-45):
- `jturn` 4 → 5 at ≤80%;
- 9 → 10 at ≤60%;
- 14 → 15 at ≤40%;
- any `jturn<17` → 17 at ≤15%.

`hypnosiscounter` (lines 46-78) can also advance the looping turns early: turn 4 ends at `turns ≥ 5-hc` once `hc≥2`, turn 9 at `turns ≥ 11-hc` once `hc≥4`, and turn 14 at `turns ≥ 17-hc` once `hc≥6`.

**Attack choice** (lines 203-246). The blocks run in this order, so a turn advances by exactly one step:

```
if jturn>=19      : monsterdf -= 3 (floor -10); monsterat += 0.5 (cap 11);
                    jattack = choose(0,4,7,8,10,11,12,13,13,13)
if 15<=jturn<=18  : jattack = jturn-3; jturn++
if jturn==14      : jattack = choose(8,9,10,11)        (loops until 40% HP)
if 10<=jturn<=13  : jattack = jturn-2; jturn++
if jturn==9       : jattack = choose(4,5,6,7)          (loops until 60% HP)
if 5<=jturn<=8    : jattack = jturn-1; jturn++
if jturn==4       : jattack = choose(0,1,2,3)          (loops until 80% HP)
if jturn<=3       : jattack = jturn; jturn++
targeting: jattack in {2,5,9,13,15} -> scr_targetall() else scr_randomtarget()   (line 247)
```

`event_user(5)` (`obj_joker_Other_15`) builds the attack:
- Every attack creates `obj_dbulletcontroller` with `.type`, `.damage = monsterat * mult`, `.target` and `.grazepoints`, then `with (obj_dbulletcontroller) joker = 1`.
- Pirouette results can scale `monsterat` by `pfactor` (0.7 or 1.25) for that one attack.
- The patterns are in `obj_dbulletcontroller_Step_0:985-1654` (`joker==1` block). The default `turntimer` is 240 (`obj_joker_Step_0:277`).

### 5.2 Attack table

With AT 10, "×5" means 50 damage before the party's DF is applied.

| jattack | dbullet type | Pattern | Dmg | Target | Turn length | Spawn code |
|---|---|---|---|---|---|---|
| 0 | 70 | Jevil clones teleport around the box and fire 5-spade fans (`obj_joker_teleport`, type 1) every 20 frames while turntimer ≥ 30 | ×5 | random | 240 | `dbullet:1324` |
| 1 | 65 | Spade rings (`obj_spadering`, 10 spades, gravity 0.4) every 60 frames | ×5 | random | 240 | `:1273` |
| 2 | 49 | Falling suit bombs, **hearts** (`obj_suitbomb` type 2 → `obj_heartbomb_blast`) every 20 frames | ×4 | all | 240 | `:1089` |
| 3 | 75 | **Devilsknife**: twin orbiting scythes (`obj_centerscythe`, "insanity" mode) | ×6 | random | 240 | `:1432` |
| 4 | 62 | Carousel horses, 3 rows × 7 (`obj_carouselbullet` altmode 3); `snd_joker_anything`; inv 20 | ×5 | random | 240 | `:1253` |
| 5 | 50 | Suit bombs, **clubs** (type 3) every 12 frames | ×4 | all | 300 | `:1113` |
| 6 | 73 | Diamonds rising from below at the soul's x (`obj_dbullet_vert` type 1) every 4 frames | ×5 | random | 240 | `:1386` |
| 7 | 68 | Side spade rings (random side, gravity 0.45) every 54 frames; soul `wspeed=5` | ×5 | random | 240 | `:1308` |
| 8 | 61 | Carousel, alternating rows (altmode 1/2, 3×3 pairs, rare `image_index 2`); inv 20 | ×5 | random | 240 | `:1210` |
| 9 | 48 | Suit bombs, **spades** (type 0) every 12 frames | ×4 | all | 270 | `:1065` |
| 10 | 72 | Clubs flying in from the diagonals, alternating sides (`obj_clubsbullet_dark`) every 18 frames | ×5 | random | 240 | `:1349` |
| 11 | 76 | Devilsknife, calmer variant (`obj_centerscythe` type 1) | ×6 | random | 240 | `:1432` |
| 12 | 71 | Clones fire single aimed diamonds (`obj_joker_teleport` type 0) every 9 frames | ×5 | random | 240 | `:1337` |
| 13 | 46 | Suit bombs, random suit, every 12 frames ("CHAOS BOMB") | ×4 | all | 330 | `:1014` |
| 14 | 74 | Diamonds converging on the soul (`obj_dbullet_vert`) every 9 frames | ×4 | random | 240 | `:1412` |
| 15 | 77 | **Final Chaos**: the box fades away, the soul is freed (`wspeed=10`, `global.sp=10`), a column barrage of `obj_laserscythe` (30 waves, rank 16→7), then a Jevil teleport, `snd_joker_neochaos`, and a giant scythe with white fade-out. Sets `turntimer=11` itself at the end (`special==4`). | ×4 | all | 1500 | `:1448-1653` |
| 99 | 47 | Diamond bombs only (unused) | ×4 | all | 300 | `:1041` |
| 999 | 25 | Generic side-spade stream (unused leftover) | ×4 | random | 300 | `:362` |

### 5.3 Scripted order (speech line → attack)

| jturn | Line (`obj_joker_Step_0`) | Attack |
|---|---|---|
| 0 | "CHAOS, CHAOS, CATCH ME IF YOU CAN!" (+`snd_joker_chaos`) | 0 |
| 1 | "SHALL WE PLAY THE RING-AROUND?" | 1 |
| 2 | "MY HEARTS GO OUT TO ALL YOU SINNERS!" | 2 |
| 3 | "HA, HA, LET'S MAKE THE DEVILSKNIFE." | 3 |
| 4 (loop, until 80%) | random line | random 0-3 |
| 5 | "PIIP PIIP, LET'S RIDE THE CAROUSEL GAME." | 4 |
| 6 | "HEE HEE, HAVING FUN!? JOIN THE CLUB!" | 5 |
| 7 | "HEARTS, DIAMONDS, I CAN DO ANYTHING!" (+`snd_joker_anything`) | 6 |
| 8 | "WHO KEEPS SPINNING THE WORLD AROUND?" | 7 |
| 9 (loop, until 60%) | random | random 4-7 |
| 10 | "YOU KIDS ARE REALLY KEEPING UP!" | 8 |
| 11 | "NU-HA!! I NEVER HAD SUCH FUN, FUN!!" | 9 |
| 12 | "A BEAUTY IS JOYING IN MY HEART!" | 10 |
| 13 | "EVEN DEVILSKNIFE IS SMILING!" | 11 |
| 14 (loop, until 40%) | random | random 8-11 |
| 15 | "IT'S SO EXCITING... I CAN'T TAKE IT!!!" | 12 |
| 16 | "THIS IS IT, BOISENGIRLS! SEE YA!" (flavour: "CHAOS BOMB was prepared FOR YOU.") | 13 |
| 17 (or at ≤15% HP) | "ENOUGH!! YOU KIDS TIRED ME UP!" (dance level 2) | 14 |
| 18 | "KIDDING!! HERE'S MY FINAL CHAOS!" (flavour: "Something terrible is coming...!") | 15 |
| 19+ | random line; DF −3 per turn, AT +0.5 per turn | random pool, weighted toward 13; becomes TIRED at `turns ≥ 29-hc` |

### 5.4 Forcing attacks (our modes)

- **Single Attack / Endless.** Insert right after the selection (after `obj_joker_Step_0:246`, before the targeting at 247), so targeting stays consistent:
  `if (global.__force_jattack >= 0) jattack = global.__force_jattack;`
  - For Endless, choose from a pool. To escalate like the real fight, also bump `global.monsterat[0]` and reduce `monsterdf`, as `jturn>=19` does.
  - Keep `global.turntimer` from `Other_15`: most attacks use the default 240, and 5/8/9/13/15 override it.
  - Force `jturn` to a looping value (4, 9, 14 or ≥19) so the speech-line and dance-level logic does not advance.
- **Phase select.** Set `obj_joker.jturn` to 0, 5, 10, 15 or 19 and `global.monsterhp[0]` to the matching HP. `jturn` 5-8 only works after the 80% gate has passed; otherwise it is simply positional. Also set `obj_joker_body.dancelv`, as the Step does: 1 after 80%, 3 after 40%, 2 when tired. Set `obj_jokerbg_triangle_real.rotspeed = 1 + (1.5 - ratio*1.5)` (`obj_joker_Draw_0:36`).
- **Visual state** is in `obj_joker_body`:
  - `condition`: 0 idle, 1 hurt, 2 attacking/spinning, 5 teleport-out;
  - `dancelv`: 0-4;
  - `floatsinerspeed`;
  - `maxdist`: grows with damage taken (`obj_joker_Draw_0:8`).

### 5.5 ACTs (`obj_joker_Step_0:382-611`)

**Check** (`acting 1`): prints "There is no strategy to defeat the enemy. Good luck!"

**Pirouette** (`acting 2`, Kris, 50 TP): Kris dance animation, then one of 9 cycling results (`chaosdance`, advanced each attack in `Other_15:4-8`):

| chaosdance | Effect |
|---|---|
| 0 | foley sound (explosion, car honk or toilet) |
| 1 | Jevil DF −4 |
| 2 | "Awkward": `invc=0.4` |
| 3 | "Tranquil": next attack ×0.7 |
| 4 | useless bird |
| 5 | heal one member 25-55 |
| 6 | **HP jumble**: swaps `maxhp`/`hp`/`hpcolor` between party members, restored in `Other_20` |
| 7 | next attack ×1.25 |
| 8 | heal all 36-50 |

Pirouette also adds +0.5 to `hypnosiscounter`.

**Hypnosis** (`acting 3`, all three, 125 TP): AT −0.5 (min 10), next attack ×0.7, `hypnosiscounter +1`. At 9 or more, Jevil becomes TIRED.

---

## 6. Things that touch files, save data or the OS (stub list)

| Where | What | What to do |
|---|---|---|
| `obj_initializer2_Create_0` | `os_type`, `scr_is_switch_os`, `window_enable_borderless_fullscreen`, `scr_init_launch_parameters` (`parameter_count/parameter_string`), `obj_event_manager` (PlayStation trophies), `ossafe_init`/`ossafe_savedata_load` (console JSON save blob via `buffer_load_async`, `Other_72`), `scr_prefetch_textures`, `scr_load_audio` (`audio_group_load`) | Skip the object and set globals directly (section 2.1). `is_console=0`. |
| `scr_84_init_localization` | `os_get_language()`; reads `true_config.ini` [LANG]; `scr_84_lang_load` reads `working_directory+"lang/lang_en.json"` (and `lang-new/`) | Hardcode `"en"` and ship the needed keys as JSON. |
| `scr_84_load_ini` | `file_exists("filech1_0..2")`, reads `dr.ini` | Stub (menu-only data). |
| `obj_initializer2_Step_0` | checks for save files `filech1_0..5` and `dr.ini` | Skip. |
| `obj_time_Create_0` | `ini_open("true_config.ini")` SCREEN/FULLSCREEN, `display_get_width/height`, `window_set_size/center`, `switch_controller_*`, `application_surface_enable/draw_enable`, `scr_enable_screen_border` | Stub everything except `scr_controls_default()` and the input arrays. |
| `obj_time_Step_1` | ESC hold → `ossafe_game_end()`; F4 fullscreen writes `true_config.ini` and calls `ossafe_savedata_save`; `os_is_paused` | Keep the input polling (lines 70-205), map ESC to "back to menu", F4 to browser fullscreen. |
| `obj_time_Draw_75/76/77` | writes `true_config.ini` on fullscreen change; `global.window_scale`; console screen border and `draw_surface_ext(application_surface)` | Stub (our renderer scales). |
| `obj_gamecontroller_Step_1`, `Other_75` | `gamepad_*` discovery, `gamepad_test_mapping`, reads `keyconfig_<file>.ini`, `switch_controller_support_show` | Replace with the browser Gamepad API. Keep `gamepad_id` and `gamepad_shoulderlb_reassign` fields. |
| `scr_getbuttonsprite` → `onSteamDeck` | `environment_get_variable("SteamDeck")`, `global.gamepad_type` | Return false / "N/A". |
| `scr_controls_default` | `os_get_info()` (PlayStation confirm button) | `os_type` = non-console. |
| `snd_init` | `audio_create_stream("mus/"+file)`; with `global.launcher` the path is `working_directory+"../mus/"`. The files are `DELTARUNE/mus/joker.ogg` and `DELTARUNE/mus/prejoker.ogg` (top-level `mus/`, not inside `chapter1_windows/`). | Map to our extracted OGG URLs. |
| `scr_gameover` | `sprite_create_from_surface(application_surface,…)`; `room_goto(room_gameover)` → `PLACE_FAILURE` → `scr_tempload()` → `scr_load()`, which reads save file `filech1_9` | Hook (section 4.4). Snapshot the canvas instead. |
| `scr_tempsave` / `scr_saveprocess` / `scr_load` | text-file save I/O (`ossafe_file_text_*`) | Not reached if `scr_gameover` is hooked. |
| `obj_darkcontroller_Step_0` (story path only) | config menu writes `keyconfig_N.ini` and `true_config.ini`, `game_restart_true()`, `audio_group_set_gain` | Not needed for the battle. Don't instantiate it, or keep `global.interact != 5`. |
| `obj_event_manager` | `trigger_event` calls in `obj_gameover_init_Step_0`, `obj_heroparent_Alarm_1:38-41` and `scr_spell` (item use) | Don't create it; `with (obj_event_manager)` is then a no-op. |
| `obj_time` | `global.time += 1` (play time) | Harmless. |

---

## 7. Standalone launch recipe

This is the shortest correct path. It skips the overworld, `obj_encounterbasic` and `obj_endbattle`.

```gml
// once at boot (after global-init scripts): replicate obj_initializer2 (non-console)
global.is_console = 0; global.launcher = 1; global.debug = 0; global.chapter = 1;
/* localization: global.lang="en"; lang_map/font_map/chemg_sprite_map/chemg_sound_map as in scr_84_init_localization */
scr_gamestart();
global.damagefont = font_add_sprite_ext(spr_numbersfontbig, "0123456789", 20, 0);
global.hpfont = font_add_sprite_ext(spr_numbersfontsmall, <lang "obj_initializer2_slash_Create_0_gml_2_0">, 0, 2);
for (i = 0; i < 100; i++) global.tempflag[i] = 0;
global.heartx = 300; global.hearty = 220;
instance_create(0, 0, obj_gamecontroller);   // persistent; needed by button1_p()
instance_create(0, 0, obj_time);             // persistent; input polling (patched: no ini/window)

// per fight: story state
global.char[0] = 1; global.char[1] = 2; global.char[2] = 3;
for (i = 0; i < 4; i++) global.charauto[i] = 0;
global.plot = 165; global.flag[241] = 5; global.flag[9] = 1;
global.charweapon[1] = 1; global.charweapon[2] = 2; global.charweapon[3] = 3;   // + armors from the loadout
scr_weaponinfo_mine(); scr_armorinfo_mine();
/* global.item[0..11] = loadout; */ scr_iteminfo_all();
for (c = 1; c <= 3; c++) global.hp[c] = global.maxhp[c];

// room: 640x480, view0 = (0,0,640,480), black background
instance_create(40, 0, obj_jokerbg_triangle_real);
global.batmusic[0] = snd_init("joker.ogg");   // stream
global.encounterno = 25; global.specialbattle = 3;
scr_encountersetup(25);
instance_create(0, 0, obj_battlecontroller);
obj_jokerbg_triangle_real.on = 1;              // what obj_jokerbattleevent con 25 does (unless flag[8])
// hooks: scr_endcombat() -> win (flag[241]==6 violence, else pacify); scr_gameover() -> lose
```

For the full intro and outro, instantiate `room_cc_joker` as it is. That needs `obj_mainchara`, `obj_darkcontroller` (it creates the caterpillars from `global.char`), `obj_jokerbg_triangle_real` and `obj_jokerbattleevent`. Hook `room_goto(room_cc_prison_prejoker)` at `obj_jokerbattleevent_Step_0:471` as the "outro finished" point.

---

## Appendix: sounds reached by the battle and intro closure (74)

`snd_joker_*` (laugh0/1, ha0/1, chaos, oh, anything, byebye, neochaos, metamorphosis, plus `_ja` variants), plus:

```
snd_applause snd_awkward snd_badexplosion snd_birdtweet snd_bomb snd_bombfall snd_boost snd_break1
snd_break2 snd_cantselect snd_carhonk snd_criticalswing snd_damage snd_graze snd_hurt1 snd_hypnosis
snd_impact snd_item snd_laz_c snd_menumove snd_noise snd_pirouette snd_power snd_rudebuster_hit
snd_rudebuster_swing snd_rumble snd_scytheburst snd_select snd_shadowpendant snd_smallswing snd_spare
snd_spearappear snd_splat snd_swing snd_text snd_toilet snd_txt* (writer voices) snd_ultraswing
snd_weaponpull_fast snd_weirdeffect
```

All of these are embedded in `audiogroup_default`. Music: `mus/joker.ogg` (battle) and `mus/prejoker.ogg` (after the battle).

About 306 sprites are reachable from the story-path closure. The analysis scripts (UTMT C# dump plus a Python closure and builtin extractor) were run from the session scratchpad; ask if you want them committed under `tools/`.
