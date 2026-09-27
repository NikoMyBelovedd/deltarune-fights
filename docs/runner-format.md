# GameMaker HTML5 runner: input format and compiled-code contract

This is the spec our data.win → HTML5 pipeline must satisfy: the **game data object** (`JSON_game`) and the **compiled GML → JS** that the open-source GameMaker HTML5 runtime executes.

- **Runner source:** `tools/gm-html5/scripts/`, YoYoGames/GameMaker-HTML5 `develop`, commit `60e51be` (2026-09-24). All `file:line` references are relative to that `scripts/` folder.
- **Target game:** a GMS2 bytecode-17 (2.3+/2022-era) data.win (Deltarune).
- **What is not in the repo:** the IDE's GML → JS compiler and the asset compiler that writes the game `.js`. Everything here was reconstructed from how the runner *reads and calls* them, plus the public sample output cited in §3.10.
- **How claims are marked:**
  - `file:line` means the claim was checked in the source.
  - *[inferred]* means it was deduced from call shapes and not seen directly.

**Contents**
1. Boot sequence: files, globals, init order, asset root
2. The game data object: every section and field
3. Compiled-code calling conventions (**the contract for our emitter**)
4. The frame loop: event order, timing, deterministic stepping, hooks
5. Gaps vs the Windows VM that matter for a GMS2022 game
6. Existing tools and prior art
- Appendix A: minimal bootable game JS

**The ten things most likely to bite first**
1. The data must be **JS**, not JSON: handlers are function references. It must be a global named exactly `JSON_game`.
2. Declare the globals `Tags`, `IDToTagList`, `g_instance_names` and `g_global_names`. The runner reads them but never defines them. `Tags` and `IDToTagList` throw a ReferenceError if they are missing (§1.4).
3. Set `Options.AssetCompilerMajorVersion: 2` and `GameSpeed: 30`. Without them there is no GMS2 mode and no fixed frame rate. `Options.DrawColour` must be a number or boot throws.
4. On objects, always emit `parent: -1`, `spriteIndex` and `visible`. If they are missing the defaults are 0, 0 and false. Instance `colour` needs its alpha byte (`0xFFFFFFFF`).
5. Emit `GMUILayers: []`, `Shaders: []`, `Extensions: []`, `Timelines: []`, `Sequences: []`, `AnimCurves: []`, and `TexturesBlocks` with one entry per texture page. In WebGL mode, `asset_get_index` runs during init and walks those arrays unguarded, so a missing one crashes boot. The boot test confirmed this.
6. Every code unit is `function(_inst, _other, ...args)`:
   - user variables are `_inst.gml<name>`;
   - globals are `global.gml<name>`;
   - builtin instance variables are plain getter/setter properties (`_inst.x`);
   - builtin globals are on `g_pBuiltIn`.
7. Script asset ids are `100000 + index` into `JSON_game.Scripts`.
8. `gml_GlobalScript_*` bodies are never run by the runner. Run them from `gmlInitGlobal()`.
9. Instance ids returned by `instance_create_*`, `instance_find`, collisions and `object_index` are **`YYRef` objects**. Compare them with `yyfequal`/`yyCompareVal`, never with JS `==`.
10. Sounds are fetched only as `.ogg` or `.mp3`, and audio unlocks only on a pointer event. Calling a builtin that doesn't exist is a ReferenceError, and the game ends.

## 1. Boot sequence

### 1.1 Files and load order

- `scripts/runner.js` is a debug loader. It is a flat list of `document.write('<script src="scripts/...">')` lines (runner.js:17–142), and the last two are `scripts/LoadGame.js` then `scripts/_GameMaker.js` (runner.js:141–142).
  - The paths are relative to the **page** (`scripts/...`), so the page must sit next to a `scripts/` folder, or you copy/symlink the folder there.
  - `document.write` only works while the document is still being parsed. `runner.js` must therefore be a plain synchronous `<script>` in the HTML, not injected later, not `async` and not `defer`.
- Nothing in the runner calls `GameMaker_Init` automatically: `window.onload = GameMaker_Init` is commented out (_GameMaker.js:136). The page has to call it. `window['GameMaker_Init']` is exported (_GameMaker.js:622).
- The game data is read from a **global named `JSON_game`**: `g_pGMFile = JSON_game;` (_GameMaker.js:638). The runtime also refers to `JSON_game.*` directly in many places (e.g. yyVariable.js:186, 367, 411; Function_YoYo.js:1057). So the name `JSON_game` is fixed and cannot be changed.

Minimal page (no IDE-generated index.html needed):

```html
<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>html,body{margin:0;padding:0;background:#000} canvas{image-rendering:pixelated}</style>
</head>
<body>
  <!-- width/height here become DISPLAY_WIDTH/HEIGHT and the initial app-surface size (_GameMaker.js:730-737) -->
  <canvas id="canvas" width="640" height="480"></canvas>
  <script>var g_GameMakerHTML5Dir = "html5game/";</script>      <!-- optional, see 1.3 -->
  <script src="scripts/runner.js"></script>                         <!-- document.write()s the runtime -->
  <script src="html5game/game.js"></script>                          <!-- defines JSON_game + compiled gml_* functions + required globals -->
  <script>window.addEventListener("load", function(){ GameMaker_Init(); });</script>
</body></html>
```

- The canvas id must be `canvas`. `g_CanvasName = "canvas"` is hard-coded (Globals.js:1036, re-set at 1206).
- **Script order.** The IDE's index.html loads the game JS *before* `runner.js` (3.10). That works because the game file's top-level code only defines data and functions; nothing runs until `GameMaker_Init`. Loading it after `runner.js` also works: the boot test in Appendix A does that.
  - Top-level code in the game file must not call runner functions if it comes first.
  - Scripts inserted by `document.write` execute before the next parser-inserted `<script>`.

### 1.2 What `GameMaker_Init()` does (_GameMaker.js:626–838)

1. Finds `canvas`; `ParseURL(window.location)`; sets `g_pGMFile = JSON_game`.
2. If `g_var2obf` is defined, builds `g_obf2var` (name de-obfuscation map; optional, omit).
3. `Options.debugMode` truthy **or undefined** → `g_DebugMode = true` (console output on) (657–661).
4. **If `Options.AssetCompilerMajorVersion > 1`**, it sets `g_isZeus = true` and, if `Options.GameSpeed` is set, calls `g_GameTimer.SetFrameRate(GameSpeed)` (663–673).
   - **This is the only place the frame rate is initialised.** Room `speed` does not drive the timer (see §4).
   - We must emit `AssetCompilerMajorVersion: 2` (anything >1) and `GameSpeed: 30` for Deltarune.
   - `g_isZeus` also switches on the GMS2 camera/layer behaviour (StartRoom, _GameMaker.js:1197, 1480, 1504) and forces the WebAudio model (721–723).
5. WebGL: when `Options.WebGL` is truthy it calls `InitWebGL(canvas)`. If that fails and `WebGL == 1` ("required") the game aborts; otherwise it falls back to Canvas2D (686–706). Emit `WebGL: 2` (try WebGL, allow fallback) or `1`. `Options.interpolatePixels` sets texture filtering.
6. `CollisionCompatibility`, `LegacyPrimitiveDrawing` (false ⇒ `offsethackD3D = 0`), `scale` (≠0 ⇒ keep aspect ratio) (709–742).
7. `InitAboyne()` (LoadGame.js:34):
   - creates `global = new yyGameGlobals()` and `g_pBuiltIn = new yyBuiltIn()`, and all the managers;
   - `InitAboyneGlobals()` (Globals.js), which sets `g_RootDir` (see 1.3), `draw_set_color(Options.DrawColour)`, the cursor from `Options.showCursor` and `Options.CreateEventOrder`;
   - **calls `gmlGlobalInit()` if it exists** (Globals.js:1325–1328). This is very early: no objects or rooms are loaded yet.
8. `YoYo_Init()`, then `LoadGame_PreLoadAssets(g_pGMFile)` (LoadGame.js:435). This queues the texture-page image loads and (WebAudio) the sound decodes, and loads extension JS files.
9. `window.requestAnimFrame(animate)`.

`animate()` is a state machine (_GameMaker.js:860–990):
- `0` = loading bar, until `g_LoadingCount >= g_LoadingTotal`;
- `1` = waits for extension JS, then **`LoadGame(g_pGMFile)`** (LoadGame.js:740);
- `2` = `g_LoadingCompleteCallback(); StartGame();`;
- `3` = `GameMaker_Tick()` every frame.

What `LoadGame(_GameFile)` does, in order (LoadGame.js:740–1070):
- sets builtins from `Options`: `gameId`, `ViewColour`, `allowFullScreenKey`, `Config`, `DisplayName`, `ProjectName`, `md5`, `crc`;
- `g_pTriggerManager = new yyTriggerManager(Triggers)`;
- objects (`GMObjects`), then `PatchParents()` and `CreateCollisionArrays()`;
- `Graphics_SetEntryTable(TPageEntries)`, `Sprites`, `Backgrounds`, `Fonts` (+`EmbeddedFonts`);
- `GMRooms` (storage only; layers are pre-built when `LayerCount` > 0);
- `RoomOrder`, which sets `room_first`/`room_last`;
- `Paths`, `Sounds`, `Timelines`, `AnimCurves`, `Sequences`, `PSEmitters`, `ParticleSystems`, `FiltersAndEffectDefs`;
- **Tags** (global vars `Tags` and `IDToTagList`, see 1.4);
- `TextureGroupInfo`, highscores;
- then **`g_gmlConst = new gmlConst()` if `gmlConst` is a function** and **`gmlInitGlobal()` if it is a function** (1033–1038);
- then each extension's `init` / `initfuncs`, which are eval'd by name.

Then `StartGame()` (_GameMaker.js:1561):
- resets score and lives;
- `StartRoom(RoomOrder[0], true)`, which creates the room instances (their Create events and creation code run), fires Game Start, runs the room creation code, then fires Room Start (§4.3).

### 1.3 Where asset files are fetched from (`g_RootDir`)

Globals.js:1207–1214:

```js
g_RootDir = "html5game/";
if (typeof (g_GameMakerHTML5Dir) != "undefined") g_RootDir = g_GameMakerHTML5Dir;
else if (g_pGMFile.Options && g_pGMFile.Options.GameDir) g_RootDir = g_pGMFile.Options.GameDir + '/';
```

- The following are all resolved as `g_RootDir + <string from the data>`:
  - texture pages: `g_RootDir + Textures[i]` (LoadGame.js:462);
  - sounds: `g_RootDir + Sounds[i].origName` (528, 538, 566);
  - particle images: `g_RootDir + "particles/IDR_GIF<n>.png"`, only if `Options.UseParticles`;
  - the WebAudio worklet bundle: `g_RootDir + "sound/worklets/audio-worklet.js"` (Function_Sound.js:158);
  - extension JS: `g_RootDir + jsFiles[i]`.
- `working_directory` is also set to `g_RootDir` (LoadGame.js:754).
- If the worklet file is missing, `addModule` rejects and the runtime silently switches to dummy buses (Function_Sound.js:158–164). Audio still plays, but bus effects don't.
  - The repo ships only the separate files in `scripts/sound/worklets/`. The IDE concatenates them into one file; do the same:
  - `cat WavetableLFO.js *Processor.js > html5game/sound/worklets/audio-worklet.js`. WavetableLFO must come first because processors use it.
- A `gml_Script_gmcallback_html5_set_load_location(self, other, url)` function, if defined, overrides URLs (LoadGame.js:442–447).

### 1.4 Globals the game JS MUST / MAY define

| Global | Required? | Why (source) |
|---|---|---|
| `JSON_game` | **required** | data object (_GameMaker.js:638, many direct `JSON_game.*` reads) |
| `Tags`, `IDToTagList` | **required (declare them, even as `[]`)** | `LoadGame` does `if( Tags !== undefined && IDToTagList !== undefined )` (LoadGame.js:963). On an **undeclared** identifier this throws `ReferenceError`, and nothing in the runner declares them. Format: `Tags = ["tag", ...]`, `IDToTagList = [{key: (assetType<<24)\|assetId, ids:[tagIndex,...]}, ...]` (Function_Tags.js:21–38). |
| `g_instance_names` | **required** | map of builtin instance variable names. The runner's definition is commented out (yyVariable.js:2051ff, inside `/* */`) but it is read by `variable_instance_get/set/exists`, `json_parse` (Function_File.js:1556) and friends. Format per entry: `name: [canGet, canSet, pro, setterName\|null, getterName\|null]`. Copy the commented table from yyVariable.js and uncomment it. |
| `g_global_names` | **required** | same for builtin globals (commented table at yyVariable.js:1796ff). Used by `variable_global_get/set/exists`. **Watch the slot order.** The runner's code and comment use `[3]` = setter and `[4]` = getter (yyVariable.js:1982–1990 getter, 2032–2040 setter), but the IDE (2025) emits getter-first, e.g. `"room": [true,true,true,"get_current_room","set_current_room"]`. With the IDE order, `variable_global_get("room")` would call the *setter*. **Copy the runner's commented tables verbatim** (Appendix A does this), since those match the runner code. |
| `gmlInitGlobal()` | needed in practice | called at end of `LoadGame` (LoadGame.js:1036). **This is where to run all `gml_GlobalScript_*` bodies** (script-asset top-level code that defines 2.3 functions and globals) and any `globalvar` init. The runner never runs `gml_GlobalScript_*` by itself. The IDE's version (3.10):
  1. zero-initialises `global.gml___struct___N` and each `globalvar`;
  2. calls `gml_GlobalScript_x(global, global)` for every script asset, in resource order;
  3. sets `global.__yyIsGMLObject = true`;
  4. sets the builtin `__yy_onlySelfNoOther` / `__yy_bothSelfAndOther` flags. |
| `gmlConst` (constructor) | optional | `g_gmlConst = new gmlConst()` (LoadGame.js:1033). Only used if your code references `g_gmlConst`. |
| `gmlGlobalInit()` | optional | very early hook (Globals.js:1325). |
| `g_var2obf` | omit | name-obfuscation map (yyVariable.js, _GameMaker.js:641). |
| `g_GameMakerHTML5Dir` | optional | overrides the asset root (1.3). |
| `gml_Script_gmcallback_html5_set_load_location` | optional | URL override hook. |

## 2. The game data object (`JSON_game`)

**It must be JavaScript, not JSON.**
- Event handlers, `Scripts[]`, room and instance creation code, timeline moments, trigger conditions and sequence events are all **function references**.
- Emit one JS file that defines the functions and then `var JSON_game = {...}` (hoisted `function` declarations can come after it).
- Legend for "Req":
  - **Y**: read unguarded, so a missing value throws.
  - **soft**: no throw, but `undefined` overwrites a default.
  - **N**: guarded.

### 2.0 Index conventions

- **Asset index = array position**, and null/`undefined` slots are preserved.
  - GMObjects: `id++` even for null (LoadGame.js:765–775).
  - Sprites: `AddSprite(null)`. Backgrounds: `AddImage(null)`. Rooms: `g_RoomID++; Add(null)` (LoadGame.js:857). Sounds, Fonts and Timelines: `Add(null)`.
  - Emit data.win indices 1:1 and put `null` in holes.
- **Room id = `GMRooms` index** (yyRoom.js:30). **Object index = `GMObjects` index. Script index = `100000 + Scripts index`** (§3.1).
- **Room-placed instance ids** come from `pInstances[].id`. Keep the data.win ids (≥100000) and keep them unique and below 1000000.
- **Runtime-created instance ids** start at `g_room_maxid = 1000000` (LoadGame.js:746) and increment (yyRoom.js:719–725). *This differs from the Windows VM*, which continues from the last room id. It only matters if game logic depends on id values.
- **"No object" / "no parent"**: use `-1` (the IDE writes `-100`).
- **Colours** are GM BGR (`0xBBGGRR`). Instance and layer `colour`/`*Blend` fields carry **alpha in the top byte** (`0xAABBGGRR`), so `0xFFFFFF` without alpha makes an **invisible** instance (yyRoom.js:750–752).

### 2.1 Top-level keys

| Key | Type | Req | Notes |
|---|---|---|---|
| `Options` | object | Y | §2.2 |
| `Name` | string | N | `document.title` |
| `Textures` | string[] | Y | §2.3 |
| `TexturesBlocks` | `[{MipsToGenerate:0}]` | **Y**, same length as `Textures` | LoadGame.js:466 reads it unguarded |
| `TPageEntries` | object[] | Y | §2.3 |
| `Sprites` | array | Y | §2.4 |
| `Backgrounds` | array (2.x tilesets and legacy backgrounds) | Y | §2.5 |
| `Fonts` | array | Y | §2.7 |
| `EmbeddedFonts` | array | N | |
| `Sounds` | array | Y | §2.6 (read in both preload and LoadGame) |
| `AudioGroups` | `[{name, enabled}]` | N* | *If missing, sounds with `groupId != 0` never load. |
| `GMObjects` | array | Y | §2.8 |
| `GMRooms` | array | Y | §2.9 |
| `RoomOrder` | int[] of room indices | Y | `RoomOrder[0]` is the start room; it also sets `room_first`/`room_last` (LoadGame.js:865–885) |
| `Paths` | array | Y | §2.10 |
| `Timelines` | array | **Y (emit `[]`)** | §2.10. `asset_get_index` iterates it unguarded (Function_Game.js:1670). In WebGL mode, `asset_get_index` is already called during `InitAboyne` (`new yyFontManager` looks up the `__yy_sdf_*` shaders, yyFont.js:1429–1431), so a missing array **crashes boot**. This was confirmed with the headless boot test (Appendix A). |
| `Scripts` | function[] | Y (runtime) | §3.1 |
| `ScriptNames` | string[] | Y (runtime) | `"gml_Script_x"` / `"gml_GlobalScript_x"`, parallel to `Scripts`. The function's JS `.name` should equal the entry (Function_YoYo.js:976–983). |
| `Shaders` | array | **Y (emit `[]`)** | Function_Shaders.js:94,182 and `asset_get_index` read it unguarded (boot-time crash in WebGL, see `Timelines`). The SDF font shaders `__yy_sdf_shader`, `__yy_sdf_effect_shader` and `__yy_sdf_blur_shader` are looked up by name, and only SDF fonts need them. §2.11 |
| `Triggers` | array | N | effectively dead (`yyTriggerManager.Process` is never called) |
| `Extensions` | array | emit `[]` | Function_Misc.js:9 calls `.find` unguarded |
| `ExtensionOptions` | `{ext:{opt:val}}` | N | |
| `TextureGroupInfo` | array | N | `{pName, TextureIDs, SpriteIDs, SpineSpriteIDs, FontIDs, TilesetIDs}` (LoadGame.js:968–1021) |
| `GMUILayers` | array | **Y, emit `[]`** | yoga/GMYoga.js:1540 reads `.length` unguarded on every room start |
| `Sequences`, `AnimCurves` | arrays | **Y (emit `[]`)** | LoadGame guards them, but `asset_get_index` → `Resource_Find(name, g_pGMFile.Sequences / .AnimCurves)` does not (Function_Game.js:1676–1680). This **crashes boot in WebGL mode**, which the boot test confirmed. |
| `PSEmitters`, `ParticleSystems`, `FiltersAndEffectDefs` | arrays | N | omit for Deltarune |
| `FeatureFlags` | object | N | |
| `Swfs`, `Vecs`, `Skel` | file path string | N | omit |
| `IncludedFiles` | – | not read | Included files are fetched at runtime relative to `g_RootDir` (sync XHR, §5). |

Globals that are not keys (`Tags`, `IDToTagList`, `g_instance_names`, `g_global_names`, `gmlInitGlobal`, …): see §1.4.

### 2.2 `Options`

| Field | Recommended value for us | Use |
|---|---|---|
| `AssetCompilerMajorVersion` | `2` | >1 turns on Zeus (GMS2) mode: `GameSpeed`, cameras/layers, WebAudio (_GameMaker.js:663) |
| `GameSpeed` | `30` | frames per second (§4.1) |
| `WebGL` | `2` | 0 canvas, 1 WebGL required, 2 WebGL with fallback. **Canvas mode loses shaders, blend modes and `gpu_*`.** |
| `interpolatePixels` | `false` | default texture filtering |
| `UseNewAudio` | `true` | WebAudio (Zeus also forces it) |
| `DrawColour` | `0xffffffff` | **effectively required**: `draw_set_color(Options.DrawColour)` runs at init (Globals.js:1273), and `yyGetInt32(undefined)` throws |
| `ViewColour` | `0` | colour between views (LoadGame.js:748; used in `Graphics_ClearScreen`) |
| `debugMode` | `false` | **undefined counts as true** (_GameMaker.js:657) |
| `scale` | `0` or `1` | ≠0 keeps the aspect ratio |
| `CollisionCompatibility` | `false` | |
| `LegacyPrimitiveDrawing` | `false` | |
| `showCursor` | `true` | |
| `CreateEventOrder` | omit | swaps Create / creation-code order when true (Globals.js:1321) |
| `GameDir` | omit, or the asset dir | `g_RootDir = GameDir + '/'` unless `g_GameMakerHTML5Dir` is set |
| `gameId`, `gameGuid`, `DisplayName`, `ProjectName`, `Major/Minor/Build/RevisionVersion`, `md5`, `crc`, `Config`, `allowFullScreenKey`, `WebGLPreserveDrawingBuffer`, `UseParticles`, `LocalRunAlert`, `loadingBarCallback`, `outputDebugToDiv`, `outputDebugToConsole`, `Facebook`, `UseFBExtension`, `TrackingID`, `FlurryId` | misc | see _GameMaker.js / LoadGame.js:746–762. `DisplayName` and `gameId` form the localStorage key prefix for saves (§5). |

### 2.3 Texture pages and TPEs

- **`Textures[i]`** is a path string relative to `g_RootDir`, e.g. `"texture_0.png"`.
  - It is loaded eagerly as `new Image()` (with crossOrigin) during preload. Startup waits for every onload/onerror (LoadGame.js:458–470, yyGraphics.js:699–708).
  - The GL texture is created lazily on first bind (yyWebGL.js:5335).
  - **Data URLs and absolute URLs don't work while `g_RootDir != ""`**, because the prefix check runs on the already-prefixed string.
  - Emit PNG files; Deltarune's embedded textures are PNG already, with QOI/BZ2 decoded by UTMT.
- **`TPageEntries[k]`**: the objects are stored as-is and augmented in place (`Graphics_SetEntryTable`, yyGraphics.js:296–328; field doc in Storage.js:19–33).

| Key | Meaning | data.win (UTMT `UndertaleTexturePageItem`) |
|---|---|---|
| `x`, `y` | source position on the page | SourceX, SourceY |
| `w`, `h` | source size | SourceWidth, SourceHeight |
| `XOffset`, `YOffset` | offset of the cropped image inside the frame | TargetX, TargetY |
| `CropWidth`, `CropHeight` | drawn size | TargetWidth, TargetHeight |
| `ow`, `oh` | full (bounding) frame size | BoundingWidth, BoundingHeight |
| `tp` | texture page index (= `Textures` index) | TexturePage |

Drawing uses `x1 = -(xorig - XOffset)*xscale`, `x2 = x1 + CropWidth*xscale`, with UVs `(x, y, x+w, y+h) / pageSize` (yyWebGL.js:2536–2578).

### 2.4 Sprites (`CreateSpriteFromStorage`, yySprite.js:1323–1416)

| Key | Meaning | Default |
|---|---|---|
| `pName` | name (used by `asset_get_index`, `sprite_get_name`) | |
| `width`, `height` | frame size | 16 |
| `bboxLeft`, `bboxRight`, `bboxTop`, `bboxBottom` | bbox, **inclusive** | 0 |
| `xOrigin`, `yOrigin` | origin (capital O) | 0 |
| `bboxMode` | 0 auto, 1 full, 2 manual (informational) | 0 |
| `colCheck` | **number**: 0 AABB, 1 precise, 2 rotated rect, 3 spine. Checks are strict `=== 1`. | 0 |
| `transparent`, `smooth`, `preload` | bools | |
| `playbackspeedtype` | 0 = frames/second, 1 = frames/game frame | 0 |
| `playbackspeed` | | 30 |
| `TPEntryIndex` | **int[]**: one TPE index per frame; frame count = length | **Y** |
| `Masks` | array (per frame, or a single one) of **RLE-compressed byte arrays** | null |
| `nineslice`, `sequence`, `swf`, `vector`, `skel` | not needed for Deltarune | |

- `sepmasks`, `frames` and `numb` are **not read**. The mask used is `Masks[img % Masks.length]`, so emit one mask for "shared" or one per frame for "separate".
- **Mask RLE** (`DecompressMask`, yySprite.js:1256–1310). Read control byte `c` until the input ends:
  - `c & 0x80` → repeat the next byte `(c & 0x7F)+1` times;
  - otherwise → copy the next `c+1` bytes literally.
- **Decoded layout** (yySprite.js:1920–1938):
  - 1 bit per pixel, MSB first, **covering only the bbox**;
  - row stride `((bboxRight-bboxLeft+1)+7)>>3` bytes, rows `bboxBottom-bboxTop+1`;
  - the bit for local `(u,v)` is byte `(v-bboxTop)*stride + ((u-bboxLeft)>>3)`, bit `7-((u-bboxLeft)&7)`.
- **data.win difference.** A data.win mask is 1 bpp for the **full** `width × height`, with row stride `(width+7)/8`, MSB first. Crop it to the bbox, then RLE-encode it.
- With no mask, precise tests return true inside the bbox.
- The loader sets `_pStore.Decompressed = true`, so don't share one storage object between sprites.

### 2.5 Backgrounds / tilesets (`Backgrounds[]`, yyBackground.js:62–94)

| Key | Meaning |
|---|---|
| `pName` | name |
| `TPEntryIndex` | **single** TPE index |
| `transparent`, `smooth`, `preload` | bools |
| `tilewidth`, `tileheight`, `tilehsep`, `tilevsep`, `tileborderx`, `tilebordery`, `tilecolumns`, `tilecount` | tileset geometry. UVs step by `tilewidth + 2*tileborderx` (yyRoom.js:1548–1560). |
| `frames` | frames per tile (≥1) |
| `framelength` | **microseconds** per frame |
| `framedata` | int[`frames*tilecount`]; `framedata[tile*frames+f]` is the real tile id. **Required for tile layers to draw** (yyRoom.js:1612). Identity mapping when there is no animation: `framedata[i]=i` with `frames:1`. |

GMS1-style room `backgrounds[]` entries use `visible, foreground, index, x, y, htiled, vtiled, hspeed, vspeed, stretch, alpha, blend` (yyBackground.js:108–143).

### 2.6 Sounds (yySound.js:100–116, Function_Sound.js:2961–2992, LoadGame.js:509–575)

| Key | Meaning |
|---|---|
| `pName` | name |
| `kind` | **0** = decode fully at load (sfx); **1** = "streamed" (fetched and decoded on each play). Don't use 3: preload treats it as streamed, but play does not. |
| `extension` | original extension, e.g. `".wav"` or `".ogg"` |
| `origName` | file path relative to `g_RootDir` |
| `volume` | initial gain |
| `pan`, `preload`, `effects` | stored only |
| `duration` | seconds, optional |
| `groupId` | audio group index (default 0). Only group 0 preloads. Others load via `audio_group_load` and only if `AudioGroups[g].enabled`. |

**URL rule** (`getUrlForSound`, Function_Sound.js:990–1025):
- `g_RootDir + origName` is cut at the first occurrence of `extension`.
- Then `.ogg` is appended (if the browser can play Vorbis) **or `.mp3`**.
- **`.wav` is never fetched**, so every sound must exist as `<base>.ogg` and `<base>.mp3` (Safari has no Vorbis).
- Deltarune's embedded WAVs (AUDO chunk) and external `.ogg` music must be transcoded or copied accordingly.
- The file is fetched as an XHR arraybuffer and passed to `decodeAudioData`.

### 2.7 Fonts (yyFont.js:261–312)

**Font fields:**

| Key | Meaning |
|---|---|
| `pName`, `fontname` | names |
| `size`, `bold`, `italic` | style |
| `first` | low 16 bits = first char; bits 16–23 = charset; bits 24–31 = antialias+1 |
| `last` | last char |
| `ascenderOffset`, `ascender` | metrics |
| `lineHeight` | 0 ⇒ max glyph h |
| `sdfSpread` | >0 ⇒ SDF font |
| `scaleX`, `scaleY` | scale |
| `TPageEntry` | single TPE index |
| `glyphs` | **Y** |

- `first` and `last` are recomputed from the glyphs.
- **Glyph fields:**
  - `i` (char code; **always emit it**, kerning uses `pPrev.i`) or `c` (1-char string);
  - `x`, `y`: **relative to the font TPE's x/y** (yyFont.js:710,1052), matching data.win glyph coordinates relative to the font's texture item;
  - `w`, `h`, `shift`, `offset`;
  - `kerning`: flat `[prevCharCode, amount, ...]` **sorted by prevCharCode** (binary search, yyFont.js:637–653).
- Glyphs are stored into `glyphs[charCode]`.
- Sprite fonts (`font_add_sprite*`) are created at runtime and need no data entry.

### 2.8 Objects (`GMObjects[]`, `CreateObjectFromStorage`, yyObject.js:138–667)

**Properties:**

| Key | Default if absent | Note |
|---|---|---|
| `pName` | | name |
| `spriteIndex` | **0** (not -1!) | always emit; `-1` for none |
| `visible` | **false** | always emit |
| `solid` | false | |
| `depth` | 0 | |
| `persistent` | false | |
| `parent` | **0** → object 0 becomes the parent! | always emit; `-1` for none (yyObject.js:96, 1543) |
| `spritemask` | -1 | mask sprite index |
| `physicsObject`, `physicsSensor`, `physicsShape`, `physicsDensity`, `physicsRestitution`, `physicsGroup`, `physicsLinearDamping`, `physicsAngularDamping`, `physicsFriction`, `physicsAwake`, `physicsKinematic`, `physicsShapeVertices` | | only read if `physicsObject` is defined |

**Events.** Each value is a function `(_inst, _other)`, and a truthy value registers the event. The mapping from data.win `(EventType, Subtype)` (UTMT numbering = GML `event_type`/`event_number`, Globals.js:255–422) to storage key:

| data.win type | subtype | key |
|---|---|---|
| 0 Create | 0 | `CreateEvent` |
| 14 PreCreate | 0 | `PreCreateEvent` |
| 1 Destroy | 0 | `DestroyEvent` |
| 12 CleanUp | 0 | `CleanUpEvent` |
| 2 Alarm | n (0–11) | `ObjAlarm<n>` |
| 3 Step | 0 / 1 / 2 | `StepNormalEvent` / `StepBeginEvent` / `StepEndEvent` |
| 4 Collision | otherObjIndex | `CollisionEvents: [otherObj, fn, ...]` (flat pairs) |
| 5 Keyboard | keycode | `Key_<K>` |
| 9 KeyPress | keycode | `KeyPressed_<K>` |
| 10 KeyRelease | keycode | `KeyReleased_<K>` |
| 6 Mouse | 0–11 | 0 `LeftButtonDown`, 1 `RightButtonDown`, 2 `MiddleButtonDown`, 3 `NoButtonPressed`, 4 `LeftButtonPressed`, 5 `RightButtonPressed`, 6 `MiddleButtonPressed`, 7 `LeftButtonReleased`, 8 `RightButtonReleased`, 9 `MiddleButtonReleased`, 10 `MouseEnter`, 11 `MouseLeave` |
| 6 Mouse | 50–61 | 50–52 `Global{Left,Right,Middle}ButtonDown`, 53–55 `…Pressed`, 56–58 `…Released`, 60 `MouseWheelUp`, 61 `MouseWheelDown` |
| 7 Other | 0 / 1 | `OutsideEvent` / `BoundaryEvent` |
| 7 Other | 2 / 3 / 4 / 5 | `StartGameEvent` / `EndGameEvent` / `StartRoomEvent` / `EndRoomEvent` |
| 7 Other | 6 / 7 / 8 / 9 | `NoLivesEvent` / `AnimationEndEvent` / `EndOfPathEvent` / `NoHealthEvent` |
| 7 Other | 10–25 | `UserEvent0` … `UserEvent15` |
| 7 Other | 30 | `CloseButtonEvent` |
| 7 Other | 40–47 / 50–57 | `OutsideView<n>Event` / `BoundaryView<n>Event` |
| 7 Other | 58 / 59 | `AnimationUpdateEvent` / `AnimationEventEvent` |
| 7 Other | 60 / 61 / 62 / 63 | `WebImageLoadedEvent` / `WebSoundLoadedEvent` / `WebAsyncEvent` (HTTP) / `WebUserInteractionEvent` |
| 7 Other | 66 / 68 / 70 / 71 / 72 | `WebIAPEvent` / `NetworkingEvent` / `SocialEvent` / `PushNotificationEvent` / `AsyncSaveLoadEvent` |
| 7 Other | 74 / 75 / 76 / 80 | `AudioPlaybackEvent` / `SystemEvent` / `BroadcastMessageEvent` / `AudioPlaybackEndedEvent` (73 audio recording → `AudioRecordingEvent`) |
| 8 Draw | 0 | `DrawEvent` |
| 8 Draw | 64 / 65 | `DrawGUI` / `DrawResize` |
| 8 Draw | 72 / 73 | `DrawEventBegin` / `DrawEventEnd` |
| 8 Draw | 74 / 75 | `DrawGUIBegin` / `DrawGUIEnd` |
| 8 Draw | 76 / 77 | `DrawPre` / `DrawPost` |
| 11 Trigger | n | `TriggerEvents: [n, fn, ...]` |
| 13 Gesture | 0–5, 64–69 | `Gesture{Tap,DoubleTap,DragStart,DragMove,DragEnd,Flick}Event`, `GestureGlobal…Event` |

**Keyboard name set `<K>`** (yyObject.js:315–596; codes at Globals.js:425ff):
- `NOKEY`(0), `ANYKEY`(1), `BACKSPACE`(8), `TAB`(9), `ENTER`(13), `SHIFT`(16), `CTRL`(17), `ALT`(18), `PAUSE`(19), `ESCAPE`(27), `SPACE`(32)
- `PAGEUP`(33), `PAGEDOWN`(34), `END`(35), `HOME`(36), `LEFT`(37), `UP`(38), `RIGHT`(39), `DOWN`(40), `INSERT`(45), `DELETE`(46)
- `0`–`9`(48–57), `A`–`Z`(65–90)
- `NUM_0`–`NUM_9`(96–105), `NUM_STAR`(106), `NUM_PLUS`(107), `NUM_MINUS`(109), `NUM_DOT`(110), `NUM_DIV`(111)
- `F1`–`F12`(112–123), `NUM_LOCK`(144)

**Other key codes are not accepted.** Workaround: wrap the global `CreateObjectFromStorage` so it also sets `pObj.ObjKeyDown[EVENT_KEYBOARD|code] = fn; pObj.Event[EVENT_KEYBOARD|code] = true` (with `EVENT_KEYPRESS`/`EVENT_KEYRELEASE` and `ObjKeyPressed`/`ObjKeyReleased` for the other two kinds). It must run before `PatchParents`, which the wrapper satisfies because LoadGame calls `CreateObjectFromStorage` first. The Key_/KeyPressed_/KeyReleased_ **name** set is limited, but the event arrays are keyed by `EVENT_* | keycode`, so arbitrary codes work once populated.

**Inheritance.** The runner walks the parent chain at dispatch time (`yyInstance.PerformEvent`). Children do **not** copy parent handlers; emit only the object's own events. `PatchParents` builds `REvent` (the recursive "has event" flags) from `Event` (yyObject.js:1534–1575).

### 2.9 Rooms (`GMRooms[]`, parsed on every non-persistent room start by `CreateRoomFromStorage`, yyRoom.js:536–617)

| Key | Meaning | Req |
|---|---|---|
| `pName`, `pCaption` | names | N |
| `width`, `height` | defaults 1024×768 | N |
| `speed` | room_speed value stored (does **not** change the game timer, §4.1) | N |
| `persistent` | | N |
| `colour`, `showColour` | background colour (BGR) and whether to clear with it | N |
| `enableViews`, `viewClearScreen`, `clearDisplayBuffer` | | N |
| `pCode` | room creation code fn | N |
| `views` | array of 8 view objects | **Y** (yyRoom.js:562) |
| `backgrounds` | array (legacy; emit 8 `{}` or `[]`) | **Y** (_GameMaker.js:1099) |
| `pInstances` | array | **Y** |
| `LayerCount`, `layers` | layers are built only if `LayerCount > 0` | Y if LayerCount>0 |
| `creationOrderIds` | first room only: instance creation order; unmatched ids are treated as UI-layer instances (yyRoom.js:575–613) | N |
| `physicsWorld`, `physicsGravityX/Y`, `physicsPixToMeters`, … | | N |

**`pInstances[j]`** (_GameMaker.js:1394–1450, yyRoom.CreateInstance 736–775):
- `x`, `y`;
- `id` (unique);
- `index` (object; `<0` is skipped);
- `scaleX`, `scaleY`, `imageSpeed`, `imageIndex`, `rotation`;
- `colour` (`0xAABBGGRR`);
- `pCode` (creation code fn), `pPreCreateCode` (fn).
- Instances are created in `m_creationOrder` order, which is the `pInstances` order unless `creationOrderIds` is given.
- Per instance: PreCreate event → `pPreCreateCode` → **Create event → `pCode`**.

**`views[v]`** (yyView.js:200–236):
- `visible`, `xview`, `yview`, `wview`, `hview`, `xport`, `yport`, `wport`, `hport`, `hborder`, `vborder`, `hspeed`, `vspeed`;
- `index` (object to follow; -1 for none);
- `cameraID` (optional).
- **Don't emit `angle`**: a runner bug writes it into `porth` (yyView.js:215).
- In Zeus mode a camera is created from each view.

**`layers[]`** (`BuildRoomLayers`, Function_Layers.js:1868–2279; iterated from last to first):
- Common fields: `pName`, `id`, `type`, `depth`, `x`, `y`, `hspeed`, `vspeed`, `visible`, `effectEnabled`, `effectType`, `effectProperties`.
  - `type`: 1 background, 2 instance, 3 asset, 4 tile, 5 particle, 6 effect.
  - If `effectType` is set, `effectProperties` values must be **strings**.
- **Background (1):**
  - `bvisible`, `bforeground`;
  - `bindex` (**sprite** index);
  - `bhtiled`, `bvtiled`, `bstretch`;
  - `bblend` (`0xAABBGGRR`);
  - `playbackspeedtype`, `bimage_speed`.
- **Instance (2):**
  - `icount` + `iinstIDs[]` (ids from `pInstances`);
  - instances not listed in any layer are auto-added by depth.
- **Asset (3).** Counts drive the loops; count > array length crashes. Emit all of `assets`, `sprites`, `sequences`, `particles` and `textitems`, even when empty, because `room_duplicate` and `room_get_info` read them unguarded.
  - `acount` + `assets[]` (legacy tiles):
    - `ax`, `ay`;
    - `aindex` (Backgrounds index);
    - `aXO`, `aYO` (source offset);
    - `aW`, `aH`;
    - `aXScale`, `aYScale`;
    - `aBlend`.
  - `scount` + `sprites[]` (sprite assets): `sIndex`, `sImageIndex`, `sPlaybackSpeedType`, `sImageSpeed`, `sXScale`, `sYScale`, `sRotation`, `sBlend`, `sX`, `sY`, `sName`.
  - `ecount` + `sequences[]`.
  - `pcount` + `particles[]`.
  - `tcount` + `textitems[]`.
- **Tile (4):**
  - `tIndex` (Backgrounds index; <0 skips the layer), `tMapWidth`, `tMapHeight`, `ttiles`.
  - `ttiles` is an RLE of 32-bit words (`expandTiles`, yyRoom.js:160–180):
    - a word with bit 31 set means "repeat the next value `(w&0x7fffffff)+1` times";
    - otherwise copy the next `w` values literally (**no +1**).
  - Tile word bits: 0–18 tile index (0 = empty), 28 mirror, 29 flip, 30 rotate.
  - This matches data.win tile data.
- **Effect (6):** from `effectType` / `effectProperties`.

### 2.10 Paths, timelines, triggers

- **Paths** (yyPath.js:321–345): `pName`, `kind` (0 straight, 1 smooth), `closed`, `precision`, `points:[{x,y,speed}]`.
- **Timelines** (yyTimeline.js:21–33): `pName`, `Events:[{Time: step, Event: fn(inst, inst)}]`, sorted ascending by `Time`.
- **Triggers**: `Triggers[i] = {pName, moment, ConstName, pFunc}`; slot 0 is unused.

### 2.11 Shaders (yyWebGL.js:5301–5318; libWebGL.js:619–680)

- `Shaders[i] = {name, Vertex, Fragment, Attributes}`:
  - `Vertex` and `Fragment` are **GLSL ES 1.00 source strings**; `"None"` gives a null program;
  - `Attributes` is a string[] such as `["in_Position","in_Colour","in_TextureCoord"]`.
- Shader index = array index. Uniform names are the standard `gm_Matrices` and `gm_BaseTexture`.
- data.win (SHDR) stores GLSL ES sources for each shader, so use those.
- A failed compile only logs a message, but it crashes on the first `shader_set_uniform_*` (§5).

### 2.12 Extensions

`{name, version, jsFiles:[...], init:"fnName" | initfuncs:[...]}`:
- the `jsFiles` are loaded as `<script>` tags before `LoadGame`;
- `init` / `initfuncs` are `eval`'d and called after it.

Deltarune's extensions (e.g. Steam or gamepad DLLs) have no JS, so **define stub functions** for any extension function the code calls. Otherwise you get a ReferenceError, which ends the game.

### 2.13 Other sections

These are not needed for a GMS2022 Deltarune build; see the field lists in the runner if required:
- `AnimCurves` (yyAnimCurve.js)
- `Sequences` (yySequence.js:4133–4265; tracks are stored reversed, `modelName` strings)
- `PSEmitters` / `ParticleSystems` (yyParticle.js:332–344, 1639–1730)
- `FiltersAndEffectDefs` (`{name, json:"<string>"}`)
- `GMUILayers` (emit `[]`)

## 3. Compiled-code calling conventions (what our emitter must produce)

Everything in 3.1–3.9 is either **proven from the runner** (the file:line reference is the proof) or **inferred** (marked *[inferred]*). Section 3.10 records what the official IDE output looks like in real samples. Where the two disagree, the runner source wins, because it is what executes.

### 3.1 Code units and signatures

| GML unit | JS shape | Who calls it / proof |
|---|---|---|
| Object event | `function gml_Object_<obj>_<Event>_<n>(_inst, _other) { ... }` referenced from the object entry (e.g. `CreateEvent: gml_Object_obj_Create_0`) | `yyObject.PerformEvent` calls `this.CreateEvent(_pInst, _pOther)` etc. (yyObject.js:697–934). `this` is the `yyObject`, so **never rely on `this`**. The name is only a convention; the runner stores function references. |
| Collision event | same signature (the IDE names it `gml_Object_<obj>_Collision_<otherObjName>`), stored as `CollisionEvents: [otherObjIndex, fn, otherObjIndex, fn, ...]` | yyObject.js:630–646. Called with `_other` = the colliding instance. |
| Trigger event | `TriggerEvents: [triggerIndex-1, fn, ...]` (the runner adds 1) | yyObject.js:603–625 |
| Script / 2.3 function | `function gml_Script_<name>(_inst, _other, argument0, argument1, ...)`. Put the function object in `JSON_game.Scripts[i]` and its name string in `JSON_game.ScriptNames[i]`. | `script_execute(self, other, idx, ...)` calls `JSON_game.Scripts[idx-100000].apply(this, [self, other, ...args])` (Function_YoYo.js:1030–1070). Constructors are called `func.apply(r, [r, other, ...args])` (yyVariable.js:173–195). Methods insert `(boundSelf, callerSelf, ...args)` (yyVariable.js:254–275). |
| Script-asset body (2.3 "global script") | `function gml_GlobalScript_<asset>(_inst, _other) { ... }`, also listed in `Scripts`/`ScriptNames`. Its body binds the file's functions: `_inst.gmlfoo = __yy_method(_inst, gml_Script_foo);` followed by any top-level statements. | Not run by the runner. The IDE's `gmlInitGlobal()` calls every one as `gml_GlobalScript_x(global, global)`, in resource order (3.10). |
| Room creation code | `function gml_Room_<room>_Create(_inst, _other)`; set as `GMRooms[i].pCode` | `g_RunRoom.m_code(pDummyInst, pDummyInst)`: self is a **dummy** `yyInstance`, not global (_GameMaker.js:1515–1520; yyRoom.js:559) |
| Instance creation code | `function gml_RoomCC_<room>_<n>_Create(_inst, _other)` → `pInstances[j].pCode`; variable overrides `gml_RoomCC_<room>_<n>_PreCreate` → `pPreCreateCode` | `pCode(pInstance, pInstance)` (_GameMaker.js:1446–1448) |
| Timeline moment | `fn(_inst, _other)` | `eventData.Event(_pInst, _pInst)` (Function_Game.js:406) |
| Trigger condition | `fn(_inst, _other)` returning truthy | `pTrigger.pFunc(_pInst, _pOther)` (yyObject.js:757) |

**Script indices:**
- A GML script/function *asset reference* is `100000 + i`, where `i` indexes `JSON_game.Scripts`. The runner relies on this in:
  - `script_exists` (Function_YoYo.js:961)
  - `script_execute`
  - `method(_inst, number)` (yyVariable.js:282)
  - `__yyg_call_method` (231)
  - `__yy_gml_object_create` (186)
  - `method_get_index` (411–423)
  - `static_get` (Function_Maths.js:1290)
  - `asset_get_index` → `Resource_Find_Script` (Function_Game.js:1629–1656)
- Indices **< 100000** mean "global JS function number N". `global_scripts_init()` enumerates every function on `window` (yyVariable.js:345–362), so these numbers never match Windows. Don't emit them.
- `ScriptNames` entries must be `"gml_Script_<name>"` for functions and `"gml_GlobalScript_<asset>"` for script-asset bodies (yyVariable.js:364–377, Function_Game.js:1629–1656). `script_get_name` strips `gml_Script_` (Function_YoYo.js:988–995).
- Emitting a script reference as a value: both the number `100000+i` and the function object `gml_Script_x` work everywhere the runner accepts a callable (`getFunction`, yyVariable.js:531–538; `is_callable`). Pick one and be consistent.
  - For `script_execute(scr, ...)` either works.
  - For `x == scr_foo` comparisons, a number is safer.
  - A function value converts to its index via `method_get_index` in `yyGetReal`/`yyGetInt32` (yyTypes.js:219–226).
  - For methods (functions bound to self) the runner expects a function object.
- `fn.__yy_userFunction = true` marks a user function. `is_method` checks it (yyVariable.js:202–205), and `method()` uses it to pick the binding strategy (291). `__yy_method(inst, fn)` sets it on both the wrapper and `fn` (yyVariable.js:272–273). The IDE binds every declared function through `__yy_method`, so the flag gets set as a side effect.
- The IDE also emits `const kgml_Script_<name> = 100000 + i;` constants and uses them wherever a script is used as a *value* (3.10).
- Constructors must have `fn.__yyg__is_constructor = true`. `__yy_gml_object_create` refuses otherwise (yyVariable.js:190).

### 3.2 Arguments

- The runner passes GML arguments positionally after `(_inst, _other)`. It never passes an array, and it never sets `argument_count`.
- So inside a script:
  - `argumentN` → the JS parameter `argumentN`;
  - `argument[n]` → `$$args[__yy_gml_array_check_index(2 + (n), $$args)]`, where the function starts with `var $$args = Array.prototype.slice.call(arguments);`;
  - `argument_count` → `($$args.length - 2)` (IDE shape, 3.10);
  - missing arguments are `undefined`.
- GMS 2.3 default parameters (`function f(a, b = 5)`) compile to a separate leading block: `{ if (yyfequal(argument1, g_pBuiltIn.undefined)) {argument1 = 5;} }` (IDE shape, 3.10). `g_pBuiltIn.undefined` is simply an unset property, i.e. `undefined`.
- User-code call sites **always pass `(_inst, _other, ...)`**: `gml_Script_foo(_inst, _other, a, b)`. This is proven by the method trampoline, which assumes position 0 is the caller's self (yyVariable.js:262–268, 297–304).

### 3.3 Variables

| GML | JS | Proof |
|---|---|---|
| local `var x` | `var gmlx` (any JS local works, since nothing outside the function can see locals). The IDE prefixes with `gml`. | sample in 3.10 |
| instance user var `foo` | `_inst.gmlfoo` | `variable_instance_get/set` use `"gml"+name` (yyVariable.js:2181–2330); `variable_struct_remove`; `json_parse` |
| builtin instance var (`x, y, xprevious, yprevious, xstart, ystart, hspeed, vspeed, direction, speed, friction, gravity, gravity_direction, solid, persistent, visible, depth, sprite_index, image_index, image_speed, image_xscale, image_yscale, image_angle, image_alpha, image_blend, mask_index, path_*, timeline_*, bbox_*, sprite_width/height, sprite_xoffset/yoffset, image_number, object_index, layer, id`) | **plain property** `_inst.x`. These are ES5 getters/setters on `yyInstance.prototype` (yyInstance.js:153–815); setters coerce with `yyGetReal`/`yyGetBool`, dirty the bbox, re-sort depth and so on. Read-only ones (`bbox_*`, `sprite_width`, `image_number`, `object_index`…) have no setter, so assigning to them is silently ignored (non-strict mode). | yyInstance.js prototype |
| `alarm[n]` | `_inst.alarm[n]`. This is a plain array of 12 (yyInstance.js:64–67). There are also `get_timer`/`set_timer` helpers (2885–2910). | Events.js:676–683 reads `pInst.alarm[a]` |
| `id` | `_inst.id`. This is a plain **number** (yyInstance.js:59), whereas APIs return `YYRef`s (3.4). | |
| `global.foo` / `globalvar foo` | `global.gmlfoo`. `global` is the `yyGameGlobals` object created in `InitAboyne` (LoadGame.js:36). | `variable_global_get/set` use `global["gml"+name]` (yyVariable.js:1945–2025) |
| builtin global (`room`, `score`, `room_speed`, `mouse_x`, `keyboard_string`, `view_xview[]`…) | `g_pBuiltIn.<name>` for plain ones. Where the (commented) `g_global_names` table lists a getter or setter, call it: `room` → `g_pBuiltIn.get_current_room()` / `g_pBuiltIn.set_current_room(v)`; `room_speed` → `get_room_speed()` / `set_room_speed(v)`; `mouse_x` → `get_mouse_x()`, and so on (yyVariable.js:1796–1925, yyBuiltIn.js). **Views:** legacy `view_*` arrays live in `g_pBuiltIn.view_xview[...]`, but in GMS2 mode, cameras own view positions. Prefer `camera_*` functions (Deltarune's compat scripts already use them). | yyBuiltIn.js |
| `self` | `_inst` | |
| `other` | `_other` | |
| `argument_relative` | `g_pBuiltIn.get_argument_relative()` | yyBuiltIn.js |

Struct members use the same `gml` prefix: `{a: 1}` has property `gmla`. `json_parse` builds `{__type:"___struct___", __yyIsGMLObject:true, gml<name>: v}` (Function_File.js:1549–1570). `is_struct` checks `__yyIsGMLObject` (Function_Maths.js:1250). So a struct literal must be an object with `__yyIsGMLObject = true` and `gml`-prefixed keys. `new GMLObject()` (yyVariable.js:149–170) is the runtime's struct base class; `__yy_gml_object_create` uses it.

### 3.4 Instance targeting: `obj.x`, `inst.x`, `other.x`, `with`

- **Resolving a dotted target:**
  - Use **`yyInst(_inst, _other, target)`** (yyInstance.js:3779–3822). It takes an instance/struct (returned as-is), a `YYRef`, or a number:
    - `-1` → self, `-2` → other, `-3` → self;
    - otherwise an instance id;
    - otherwise an object index, which gives **the first instance** of that object.
  - Write `yyInst(_inst,_other, target).gmlfoo = v` and `yyInst(...).x`.
  - The 2.3+ IDE emits `yyInst(_inst,_other,YYASSET_REF(0x000000NN)).x = 1` for `obj_foo.x = 1` (3.10). That writes to the **first** instance only, whereas GMS1-era semantics were "all instances". If Deltarune's bytecode (`pushi obj; ... pop.v.v`) relies on the all-instances behaviour of the 2022 VM, lower it to a `GetWithArray` loop. Check VM semantics per case, using OpenGM as the reference.
- **`with (target) { body }`:**
  - `GetWithArray(target)` (yyObject.js:1602–1650) returns an array of the matching live instances (`!marked && active`). It accepts:
    - a struct/instance object;
    - `OBJECT_ALL` (-3), the whole room;
    - an object index (all instances, including children);
    - an instance id or `YYRef`.
  - Emit:
    ```js
    { var __w = GetWithArray(yyGetTarget); for (var __i = 0; __i < __w.length; __i++) { var __self = __w[__i]; if (__self.marked) continue; /* body with _inst=__self, _other=<outer _inst> */ } }
    ```
  - Compile the body with `self` = the with-instance and `other` = the enclosing self.
  - The IDE shape: `var __yy__v0 = GetWithArray(target); for (var __yy__v1 in __yy__v0) { if (!__yy__v0.hasOwnProperty(__yy__v1)) continue; var __yy__v2 = __yy__v0[__yy__v1]; { ...body with __yy__v2 as self, _inst as other... } }`.
  - **`with (other)` has no loop**: the body is compiled with self and other swapped (`move_outside_all(_other, ...)`).
  - Handle `-1`/`-2` (self/other) and `noone` (-4) yourself, since `GetWithArray(-1)` returns `[]`.
  - `break`/`continue` inside `with` map to the JS loop. `exit`/`return` must leave the enclosing function.
- **`instance_find(obj, n)`, `instance_create_*`, `instance_nearest`, `collision_*`** return **`YYRef` objects** (`MAKE_REF(REFID_INSTANCE, id)`, e.g. Function_Instance.js:45, Function_Layers.js:5192). `noone` is returned as the number -4. Consequences for the emitter:
  - Comparisons (`==`, `!=`, `<`) on values that may be ids **must** go through `yyfequal`/`yyfnotequal`/`yyCompareVal`. Plain JS `==` between two refs is object identity, which is false for two different `MAKE_REF` calls with the same id.
  - `yyGetReal`/`yyGetInt32` unwrap refs (yyTypes.js:191ff).
  - Using an id as a ds_map key or array index needs `yyGetInt32`.
  - `string(ref)` yields `"ref instance 100001"` (yyTypes.js:454ff), not `"100001"`.
- **Object asset constants:**
  - `YYASSET_REF(0x<type:8><index:24>)` (yyTypes.js:89–119) returns a `YYRef` for objects (type 0) and particle systems, and a **plain index** for every other asset type (sprite=1, sound=2, room=3, path=4, script=5, font=6, timeline=7, shader=8, sequence=9, animcurve=10, particle system=11, tilemap=12, tileset=13; 14 is a named instance → `REFID_INSTANCE`).
  - The runner's object APIs accept either a number or a ref (`yyGetRef(..., REFID_OBJECT)`, `yyGetInt32`).
  - **Emitting plain numbers for all assets is simplest and matches GMS2022 semantics.** The one exception: the `object_index` getter returns a ref (yyInstance.js:438), so compare it with `yyfequal`.

### 3.5 Operators and conversion helpers (Function_Maths.js, yyTypes.js)

GML values in this runtime can be:
- `number`, `string`, `boolean`
- `undefined`
- `Array`
- a struct `Object` or an instance
- `Function`
- `YYRef`
- `Long` (int64)
- `ArrayBuffer` (ptr)

Plain JS operators are only safe when both operands are statically known numbers, or both strings for `+`. Otherwise use the helpers below.

| GML | helper | notes (file:line) |
|---|---|---|
| `a + b` | `yyfplus(a,b)` | number + number, or string + string (concat). A string mixed with a non-string → `yyError`. Handles Long and refs via `yyGetReal` (Function_Maths.js:1868) |
| `a - b` | `yyfminus` | 1903 |
| `a * b` | `yyftime` | number * string repeats the string (1932) |
| `a / b` | `yyfdivide` | 1968 |
| `a mod b` / `%` | `yyfmod` | JS `%` semantics (sign of dividend); errors on 0 (2005) |
| `a div b` | `yyfdiv` | `~~(~~a / ~~b)`, i.e. operands are truncated first (2038) |
| `==`, `!=` | `yyfequal`, `yyfnotequal` | via `yyCompareVal(a,b,g_GMLMathEpsilon,false)`, so numbers compare **with epsilon**; string vs number → not equal; refs by value (1687, 2091–2120) |
| `<`, `<=`, `>`, `>=` | `yyfless`, `yyflessequal`, `yyfgreater`, `yyfgreaterequal` | 2122–2195 |
| `&&`, `\|\|`, `^^` | `yyfand`, `yyfor`, `yyfxor` | these are **not short-circuiting** because both arguments are evaluated. For GML's short-circuit semantics emit `(yyGetBool(a) && yyGetBool(b))` (2198–2240) |
| `!a` | `!yyGetBool(a)` | `yyGetBool`: number > 0.5 is true; `undefined` is false; instance/struct/function are true (yyTypes.js:336–384) |
| `&`, `\|`, `^`, `<<`, `>>` | `yyfbitand`, `yyfbitor`, `yyfbitxor`, `yyfbitshiftleft`, `yyfbitshiftright` | **return `Long` (int64) objects** (2244–2340). For a pure-number fast path use `(yyGetInt32(a) & yyGetInt32(b))`, which is 32-bit. GML is 64-bit but Deltarune's bit ops fit in 32 bits (verify per use). |
| `~a`, `-a` | `~yyGetInt32(a)`, `-yyGetReal(a)` | *[inferred]* |
| conditions (`if`, `while`, ternary) | `yyGetBool(expr)` | |
| number coercion | `yyGetReal(v)`, `yyGetInt32(v)`, `yyGetInt64(v)`, `yyGetBool(v)`, `yyGetString(v)` | yyTypes.js:191–520. These **throw** (`yyError`) on unconvertible values such as `undefined`. |
| undefined/ptr guard | `__yy_gml_errCheck(v)` | throws on `undefined` or ptr (yyVariable.js:515) |
| `??` | `__yy_is_nullish(v)` | yyVariable.js:137 |
| `typeof(x)` | `YYTypeof(x)` | Function_Maths.js |
| `instanceof(x)` | `YYInstanceof(x)` | |
| `is_instanceof(x, C)` | `YYIsInstanceof(x, C)` | the GML name does not exist in the runner (see gaps). Map it. |
| string template `$"..."` | `__yy_InternalStringInterpolation`, `__yy_BuildString` | Function_String.js:239–300 |

`yyError(text)` throws a `YYErrorObject` (Function_Debug.js:138). An uncaught throw ends the game via the window `error` handler → `game_end(-1)` (_GameMaker.js:196–222).

### 3.6 Arrays (copy-on-write) and accessors

- GML arrays are **JS Arrays**. A 2-D array `a[i, j]` is an array of arrays; helpers exist: `array_get_2D`, `array_set_2D`, `array_set_2D_pre`, `array_set_2D_post` (yyVariable.js:66–130).
- **Copy-on-write.** Every array has `__yy_owner` (defaulting to `Array.prototype.__yy_owner = 0`, yyVariable.js:39), and `g_CurrentArrayOwner` is global state.
  - Write helpers:
    - `__yy_gml_array_check(a)` copies `a` if `a.__yy_owner != g_CurrentArrayOwner` (or if it is a typed array), creates `[]` if it isn't an array, and stamps the owner (452–466);
    - `__yy_gml_array_check_index_set(i)` coerces and range-checks a write index (483);
    - `__yy_gml_array_check_index_chain(i, a)` does the same for the inner level of `a[i][j] = v`, creating or copying the inner array (492–513);
    - `__yy_gml_array_check_index(i, a)` range-checks a **read** (473).
  - `__yy_gml_array_set_owner(x)` sets the owner (468). **The runner never calls it.** In copy-on-write projects the IDE wraps each array-write (and array-literal) block as `{ __yy_gml_array_set_owner(<id of this code unit>); a = __yy_gml_array_check(a, <hash>); a[...] = v; }`. The id is a constant per function/event (samples: 65530, 131066, 2162682…, i.e. `(k<<16)|0xFFFA`). Any unique number per code unit other than 0 works. Projects without COW emit no `set_owner` calls. The second argument of `__yy_gml_array_check` is an opaque hash that the runner ignores.
  - If the game was built **without** copy-on-write, never call `set_owner`, so the owner stays 0 everywhere. `__yy_gml_array_check` then never copies, which gives reference semantics. GMS 2022 projects have COW **on** by default; the option to turn it off arrived later. Assume Deltarune relies on COW, and verify against OpenGM/Butterscotch behaviour.
  - Array literals: `__yy_gml_array_create([ ... ])` stamps the owner (142–146). `array_create` also stamps it.
  - The emitter pattern for `self.arr[i] = v` is
    ```js
    _inst.gmlarr = __yy_gml_array_check(_inst.gmlarr);
    _inst.gmlarr[__yy_gml_array_check_index_set(i)] = v;
    ```
    Reads are `_inst.gmlarr[__yy_gml_array_check_index(i, _inst.gmlarr)]`. Exact shapes are in 3.10.
- **Accessors:**

  | GML | Runner function |
  |---|---|
  | `list[| i]` | `ds_list_find_value(l, i)` / `ds_list_set(l, i, v)` / `ds_list_set_pre` / `ds_list_set_post` |
  | `map[? k]` | `ds_map_find_value` / `ds_map_set` / `ds_map_set_pre` / `ds_map_set_post` |
  | `grid[# x, y]` | `ds_grid_get(g, x, y)` / `ds_grid_set` / `ds_grid_set_pre` / `ds_grid_set_post` (release/debug variants swapped by `gml_release_mode`) |
  | `struct[$ k]` | `variable_struct_get` / `variable_struct_set` / `variable_struct_set_pre` / `variable_struct_set_post` |
  | `arr[@ i]` | direct write with no COW check |

  The `_pre` variants return the new value and the `_post` variants the old one, so they serve `++`/`--`/compound assignment used as expressions (ds_list.js, ds_map.js, ds_grid.js, yyVariable.js:2633–2650).

### 3.7 Methods, structs, constructors, `new`, `static`

- **`method(self, fn)`** (yyVariable.js:277–338). For user functions (`__yy_userFunction`) it returns a trampoline that calls `fn(boundSelf, callerSelf, ...args)`. The trampoline carries `ret.boundObject` and `ret.origfunc`. `method(undefined, fn)` → `fn.bind(undefined)`, so self is the caller.
- **Builtin functions used as method values:**
  - flag `f.__yy_bothSelfAndOther = true` (it receives `_inst, _other`);
  - or `f.__yy_onlySelfNoOther = true` (it receives `_inst` only);
  - otherwise `(self, other)` are stripped (yyVariable.js:311–335).
  - The runner sets none of these flags. The IDE sets them at the end of `gmlInitGlobal()`, e.g. `compile_if_weak_ref(event_inherited, event_inherited.__yy_bothSelfAndOther = true); compile_if_weak_ref(instance_destroy, instance_destroy.__yy_onlySelfNoOther = true);` (5 and about 155 entries respectively in a 2025 build). `compile_if_weak_ref` is a no-op defined in Globals.js:1045. Do the same for the lists in 3.8.
- **Function declarations inside code** (2.3 `function foo() {}` in a script or event) become named methods bound to the declaring scope. At script-asset top level that scope is global.
  - IDE lowering: the declaring scope does `_inst.gmlfoo = __yy_method(_inst, gml_Script_foo);`. In a script asset `_inst` is `global`, and in an event it is the instance. The inner function becomes a separate top-level JS function whose runtime name is `gml_Script_foo@gml_Object_obj_Create_0` in `ScriptNames`; in the JS identifier `@` becomes `_40_` (2025) or `_`. Anonymous functions are named `anon@<charOffset>@<parent>`.
  - Direct calls `foo(...)` to a global script function compile to `gml_Script_foo(_inst, _other, ...)`.
- **Calling a value** (`v(...)`, `self.cb(...)`): `__yyg_call_method(v)(_inst, _other, ...args)`. For `a.f(x)`, the IDE emits `(__temp__ = yyInst(_inst,_other,a), __yyg_call_method(__temp__.gmlf)(__temp__, _inst, x))`, so self = `a` and other = the caller. `__yyg_call_method` (yyVariable.js:231–252) resolves script numbers and `Long` to `JSON_game.Scripts[n-100000]`. The IDE relies on an undeclared sloppy-mode global `__temp__`; declare your own temporaries instead.
- **`new C(args)`**: `__yy_gml_object_create(_inst, C, args...)` (yyVariable.js:173–195).
  - It creates `r = new GMLObject()`, then calls `C.apply(r, [r, C.boundObject || _inst, ...args])`, so **inside the constructor `_inst` is the new struct and `_other` is the caller's self**.
  - `C` must be a function (or script number) with `__yyg__is_constructor = true`. `__yy_gml_blank_constructor` exists for the plain `{}` case.
- **Constructor inheritance / `static`:**
  - `__yy_gml_copy_prototype(dest, source)` = `Object.setPrototypeOf(dest, source)` (yyVariable.js:2623);
  - `static_get(fnOrStruct)` / `static_set` (Function_Maths.js:1290–1320). `static_get(fn)` returns `fn.prototype`, flagged `__yyIsGMLObject`.
  - So statics live on `C.prototype` (as `gml<name>` properties). A struct created by `new C` should get `Object.setPrototypeOf(r, C.prototype)`. For `constructor : Parent()`, set `C.prototype`'s prototype to `Parent.prototype`.
  - `YYIsInstanceof` walks exactly this prototype chain (Function_Maths.js:1320–1343).
  - Exact IDE emission is *[inferred]*; see 3.10.
- **Exceptions:**
  - `throw x` → `throw x`.
  - `try {…} catch (e) {…}` → `catch (gmle) { gmle = __yy__processException(gmle); { … } }` (IDE shape). It converts JS `Error`s into a struct with `gmlmessage`, `gmllongMessage`, `gmlscript`, `gmlline` and `gmlstacktrace` (Function_Debug.js:100–133).
  - `finally` maps directly.
  - `exception_unhandled_handler(fn)` is supported (_GameMaker.js:170–222).

### 3.8 Calling builtin functions: which get `(_inst, _other)`

- There is no registry. Each GML builtin is a same-named global JS function, and **its JS parameter list tells you what to pass**. The IDE knows this from its own function table.
- Rule (from runner parameter names):
  - The first parameter is `_inst`, `_pInst`, `inst`, `_selfinst` or `selfinst` → pass **self** first.
  - The first two are `(_pInst|_self, _pOther|_other)` → pass **self, other** first.
  - Otherwise, pass the GML arguments only.
- Build the table automatically by parsing `scripts/**/*.js` for `function name(params)` and for `var name = name_DEBUG` aliases. Then **cross-check the arity** against GML's documented argument count; a list extracted from UTMT or the GMS2 docs would do.
- **self + other** (11): `event_perform`, `event_perform_async`, `event_perform_object`, `event_perform_timeline`, `event_user`, `event_inherited`, `script_execute`, `script_execute_ext`, (`method_call` = `script_execute_ext`), plus the internal `yyInst`.
- **self only.** This is the IDE's own list, taken verbatim from the `__yy_onlySelfNoOther` block of a 2025 IDE build that uses this same open-source runner (3.10). It has 155 functions:

  alarm_get, alarm_set, array_all, array_any, array_create_ext, array_filter, array_filter_ext, array_find_index, array_foreach, array_map, array_map_ext, array_reduce, array_sort, collision_circle, collision_circle_list, collision_ellipse, collision_ellipse_list, collision_line, collision_line_list, collision_point, collision_point_list, collision_rectangle, collision_rectangle_list, distance_to_object, distance_to_point, draw_self, draw_sprite, draw_sprite_ext, draw_sprite_general, draw_sprite_part, draw_sprite_part_ext, draw_sprite_pos, draw_sprite_stretched, draw_sprite_stretched_ext, draw_sprite_tiled, draw_sprite_tiled_ext, draw_tile, draw_tilemap, ds_grid_to_mp_grid, flexpanel_node_set_measure_function, instance_activate_all, instance_activate_layer, instance_activate_object, instance_activate_region, instance_change, instance_copy, instance_deactivate_all, instance_deactivate_layer, instance_deactivate_object, instance_deactivate_region, instance_destroy, instance_furthest, instance_id_get, instance_nearest, instance_place, instance_place_list, instance_position, json_parse, json_stringify, motion_add, motion_set, move_and_collide, move_bounce_all, move_bounce_solid, move_contact_all, move_contact_solid, move_outside_all, move_outside_solid, move_random, move_snap, move_towards_point, move_wrap, mp_grid_add_instances, mp_grid_path, mp_linear_path, mp_linear_path_object, mp_linear_step, mp_linear_step_object, mp_potential_path, mp_potential_path_object, mp_potential_settings, mp_potential_step, mp_potential_step_object, path_end, path_start, physics_apply_angular_impulse, physics_apply_force, physics_apply_impulse, physics_apply_local_force, physics_apply_local_impulse, physics_apply_torque, physics_draw_debug, physics_fixture_bind, physics_fixture_bind_ext, physics_get_density, physics_get_friction, physics_get_restitution, physics_mass_properties, physics_set_density, physics_set_friction, physics_set_restitution, physics_test_overlap, place_empty, place_free, place_meeting, place_snapped, position_change, position_destroy, position_empty, position_meeting, skeleton_animation_clear, skeleton_animation_get, skeleton_animation_get_duration, skeleton_animation_get_event_frames, skeleton_animation_get_ext, skeleton_animation_get_frame, skeleton_animation_get_frames, skeleton_animation_get_position, skeleton_animation_is_finished, skeleton_animation_is_looping, skeleton_animation_mix, skeleton_animation_set, skeleton_animation_set_ext, skeleton_animation_set_frame, skeleton_animation_set_position, skeleton_attachment_create, skeleton_attachment_create_color, skeleton_attachment_create_colour, skeleton_attachment_destroy, skeleton_attachment_exists, skeleton_attachment_get, skeleton_attachment_replace, skeleton_attachment_replace_color, skeleton_attachment_replace_colour, skeleton_attachment_set, skeleton_bone_data_get, skeleton_bone_data_set, skeleton_bone_state_get, skeleton_bone_state_set, skeleton_collision_draw_set, skeleton_find_slot, skeleton_get_bounds, skeleton_get_minmax, skeleton_get_num_bounds, skeleton_skin_create, skeleton_skin_get, skeleton_skin_set, skeleton_slot_alpha_get, skeleton_slot_color_get, skeleton_slot_color_set, skeleton_slot_colour_get, skeleton_slot_colour_set, skeleton_slot_data_instance, string_foreach, struct_foreach.

  The runner-signature heuristic agrees with this list except for a few names:
  - It also flags `instance_position_list`, which is missing from the IDE list even though the runner signature is `(_pInst, _x, _y, _obj, _list, _ordered)`. Passing self is correct for this runner.
  - The IDE list includes `instance_change`, which the runner defines as `var instance_change = instance_change_DEBUG` with signature `(_inst, _objindex, _perf)`.
  - The heuristic's other extras are internal helpers or `physics_joint_*` false positives.
- **Known false positives** of the name heuristic, where `_inst` is actually the GML argument: `method(_inst, _func)` and `sequence_instance_override_object(_inst, …)`.
- Pass GML args **unconverted**. Builtins coerce with `yyGetReal` and friends themselves.
- Callbacks given to `array_*` are called as `fn(self, self, element, index)` (e.g. yyVariable.js:1136–1153). User functions therefore work unchanged.

### 3.9 Events and instance helpers called from code

- `event_inherited()` → `event_inherited(_inst, _other)`. It uses `g_LastEvent`, `g_LastEventArrayIndex` and `Current_Object` to call the parent's handler (Function_Game.js:508–515; yyInstance.js:1381–1388). This works because `yyObject.PerformEvent` saves and restores those globals around each call.
- `event_user(n)` → `event_user(_inst, _other, n)`.
- `event_perform(type, num)` → `event_perform(_inst, _other, type, num)`.
- `instance_create_depth(x, y, depth, obj)` and `instance_create_layer(x, y, layer, obj)` run the Pre-Create and Create events synchronously and return a `YYRef` (Function_Layers.js:5172–5230).
  - GMS1-style `instance_create(x, y, obj)` **does not exist** in this runner. Deltarune ships it as a compatibility script in data.win (`gml_Script_instance_create`), so it will be compiled like any user script.
- `instance_destroy()` → `instance_destroy(_inst)`; `instance_destroy(id)` → `instance_destroy(_inst, id)` (Function_Instance.js:1369).
- `exit` → `return;`. `return x` from an event is ignored by the runner.

### 3.10 What real IDE output looks like (reference samples)

**Samples used.** These are non-minified official HTML5 builds found on GitHub. Local copies are in the session scratchpad; re-download them from the URLs.

| Tag | Source | Build | Notes |
|---|---|---|---|
| **NB** | github.com/Adibada/Play-Rhymon-web → `public/game/html5game/new_blank.js` | Nov 2025 | Not minified, with GML source in comments. Loads the **same** open-source `scripts/runner.js`, so this is the closest match to our runner. |
| **BL** | github.com/FieryLionite/BSOLWEB → `html5game/Bellyful Life.js` | Aug 2024 | Not minified, **copy-on-write arrays on**, external runner. |
| G24 | github.com/RowanFuture/rowan.games → `assets/html5_exports/GameOff2024/html5game/GameOff2024.js` | Dec 2024 | Release build, bundled runner; `gml_*`/`yyf*`/`__yy_*` names are kept. |
| RB | github.com/Wyatt-Stanke/jumbotron → `data/raw/html5game/RetroBowl.js` | ~2023.8 | Release build. |

**File layout (NB):**
1. `Array.prototype.__yy_owner = 0;`
2. `var g_RUN=0x80000000;`
3. `var JSON_game = {…};`
4. all `gml_*` functions
5. the `compile_if_weak_ref` / `compile_if_used` stubs, then `gmlInitGlobal()` and `gmlGameEndScripts()`
6. `Tags = [ ]; IDToTagList = [ ];`
7. `JSON_game.ScriptNames = [...]; JSON_game.Scripts = [...];`, parallel and including the GlobalScripts
8. `const kgml_Script_<x> = 1000NN;`
9. the constructor trailer: `gml_Script_X.__yyg__is_constructor = true; gml_Script_X.prototype.SetImageIndexGML = __yyg__SetImageIndexGML;`
10. `var g_instance_names = {…}; var g_global_names = {…};`

The index.html loads the game JS **before** `scripts/runner.js` and uses `window.onload = GameMaker_Init;`.

**Function naming:**

| Unit | Name |
|---|---|
| Event | `gml_Object_<obj>_<Type>_<n>`. Types: `Create_0`, `Step_0/1/2`, `Draw_0/64/72..75`, `Alarm_N`, `Other_<n>`, `Mouse_<n>`, `KeyPress_<code>`, `Keyboard_<code>`, `CleanUp_0`, `Destroy_0`, `PreCreate_0` |
| Collision event | `gml_Object_<obj>_Collision_<otherObjName>` |
| Room creation code | `gml_Room_<room>_Create` |
| Instance creation code | `gml_RoomCC_<room>_<n>_Create`, plus `_PreCreate` for variable overrides |
| Script asset | `gml_GlobalScript_<file>` |
| Function | `gml_Script_<name>` |
| Nested function | `gml_Script_<name>_40_<parent>`: `@` escaped as `_40_` in the identifier; the name in `ScriptNames` keeps `@` |
| Anonymous function | `gml_Script_anon_40_<charOffset>_40_<parent>` |
| Struct-literal constructor | `gml_Script____struct___<N>_40_<fn>_40_<script>` |

**Script-asset body:**
```js
function gml_GlobalScript_scr_BuffSystem( _inst, _other ){
(_inst.gmlupdate_buffs_after_combat = __yy_method( _inst, gml_Script_update_buffs_after_combat));
...
if ( (yyGetBool(variable_global_exists( "DEBUG_MODE" ))) && (yyGetBool(global.gmlDEBUG_MODE))) {{ ... }}
```

**`gmlInitGlobal`:**
```js
function gmlInitGlobal() {
global.gml___struct___0 = 0;                       // + every globalvar = 0 (RB)
gml_GlobalScript_scr_BuffSystem( global, global );  // every script asset, resource order
...
global.__yyIsGMLObject = true;
compile_if_weak_ref(event_inherited, event_inherited.__yy_bothSelfAndOther = true);
compile_if_weak_ref(instance_destroy, instance_destroy.__yy_onlySelfNoOther = true);  // ×155
}
```

**Arguments and defaults:**
```js
function gml_Script_get_buff_value( _inst, _other, argument0, argument1){
{ if ( yyfequal(argument3,g_pBuiltIn.undefined)) {argument3=(__yy_gml_array_create([]));} ; }   // default arg block
{ var $$args = Array.prototype.slice.call(arguments);                                         // argument[i] / argument_count
  ... $$args[__yy_gml_array_check_index(2+ (gmli), $$args)] ... ($$args.length-2) ...
```

**Variables and literals:**
- Variables: `var gmlfoo`, `_inst.gmlfoo`, `global.gmlfoo`.
- Builtins:
  - instance builtins are plain properties: `_inst.x`, `_inst.image_index = 0`, `_inst.alarm[...]`;
  - builtin globals: `g_pBuiltIn.room_width`, `g_pBuiltIn.get_current_room()`, `g_pBuiltIn.set_view_enable(true)`.
- Literals:
  - `undefined` becomes `g_pBuiltIn.undefined` (NB) or `undefined` (RB);
  - `noone` becomes `(-4)` and `all` becomes `(-3)`;
  - macros, enums and colour constants are inlined as numbers.

**Operators:**
- Every arithmetic and comparison operator goes through a `yyf*` helper, as in 3.5.
- Non-literal operands of *binary arithmetic* are wrapped in `__yy_gml_errCheck(...)`. Compound assignments and comparisons are not wrapped:
```js
return yyfplus(__yy_gml_errCheck(gmlbase_window),__yy_gml_errCheck(gmlbuff_value));   // a + b
gmltotal=yyfplus(gmltotal,yyInst(_inst,_other,x).gmlvalue);                          // a += b
if ( yyGetBool(expr)) ... ; if ( yyfgreater(a,b)) ...                                // conditions
(yyGetBool(a)) && (yyGetBool(b));   !yyGetBool(x);   yyGetBool(c) ? a : b             // logic
-__yy_gml_errCheck(_inst.gmllistsize)                                                 // unary minus
gmli = (gmli instanceof Long ? gmli.add(1) : ++gmli)                                  // ++ statement
( g_yyPrePostObject__ = gmli, gmli = (g_yyPrePostObject__ instanceof Long ? gmli.add(1) : ++gmli), g_yyPrePostObject__)  // i++ expr
```
- `g_yyPrePostObject__` is declared by the runner (Globals.js:913).

**Arrays** (the BL build has copy-on-write on; the NB build omits `set_owner`):
```js
var gmlbuff = gmlbuffs[__yy_gml_array_check_index(gmli, gmlbuffs)];                       // read
{ __yy_gml_array_set_owner(131066);                                                        // COW builds only
  _inst.alarm = __yy_gml_array_check( _inst.alarm, 3623418912 );                           // once per block per target
  _inst.alarm[__yy_gml_array_check_index_set(0)]=1; }                                      // write
gmltable[__yy_gml_array_check_index_chain(gmlas, gmltable)][__yy_gml_array_check_index_set(gmlhs)] = 0;   // 2-D write
x[__yy_gml_array_check_index(i, x)][__yy_gml_array_check_index(0, x[~~i])]                // 2-D read
global.gmltest_bpms=(__yy_gml_array_create([80,100,110]));                                // literal
```
Accessors become calls: `ds_map_find_value`, `ds_map_set`, `ds_list_find_value`, `variable_struct_get`, `variable_struct_set`.

**`with` and instance access:**
```js
{ var __yy__v0 = GetWithArray(YYASSET_REF(0x00000004) );
  for( var __yy__v1 in __yy__v0 ) { if (!__yy__v0.hasOwnProperty(__yy__v1)) continue;
    var __yy__v2 = __yy__v0[__yy__v1];
    { if ( yyfnotequal(__yy__v2.id,_inst.id)) {{ instance_destroy( __yy__v2 ); }} ... gml_Script_x(__yy__v2, _inst, ...) } } }
move_outside_all( _other , ... );                          // with(other){...}: no loop, self/other swapped
yyInst(_inst,_other,YYASSET_REF(0x0000000E)).x = 1;        // obj.x = 1   (first instance only)
yyInst(_inst,_other,gmlbtn).gmlfoo;  yyInst(_inst, _other, 100683).gmltext;   // inst.foo, room-instance literal id
```
- `YYASSET_REF(0xTTIIIIII)` uses the type numbers of this runner's `AT_*` (yyTypes.js:17–33). RB (2023) used an older numbering.
- Scripts used as values become `kgml_Script_<name>` constants (100000+index).

**Methods, structs, constructors:**
```js
(__temp__=yyInst(_inst,_other,x), __yyg_call_method(__temp__.gmlget_buffs)( __temp__ , _inst ))   // x.get_buffs()
__yyg_call_method(_inst.gmlset_hp)( _inst , _other , v)                                          // set_hp(v)
method( _inst, kgml_Script_on_beat_pulse_40_gml_Object_obj_AnimationManager_Create_0 )
var s = __yy_gml_object_create( _inst, (global.gml___struct___0 = __yy_method( _inst, gml_Script____struct___0_40_f_40_scr)), extraArg0 );  // {a: nonConst}
function gml_Script____struct___0_40_f_40_scr( _inst, _other){
  if ((--_inst.__yyCreatedByNew) < 0) {{ yyError( "calling a constructor directly - constructors should only be called using new" ); }}   // 2025
  if (_inst.__yyIsGMLObject) { _inst.__type = "gml_Script____struct___0@f@scr"; }
  if (<fn>.prototype.__type === undefined) { <fn>.prototype.__type = "…"; }
  { if (_inst.__yyIsGMLObject) Object.setPrototypeOf( _inst, <fn>.prototype);
    { var $$args = Array.prototype.slice.call(arguments);
      _inst.gmlhp_current=50; _inst.gmlbuffs=$$args[__yy_gml_array_check_index(2+ (0), $$args)]; ... } } }
// static (G24):
if (!global.gml_Script_Foo_prototype_yy_staticInitialiser) { gml_Script_Foo.prototype.gmlbar = __yy_method(undefined, gml_Script_anon_...); }
global.gml_Script_Foo_prototype_yy_staticInitialiser = true;
var gml_w = __yy_gml_object_create(_inst, gml_Script_Foo, arg);                                   // new Foo(arg)
```
Struct literals therefore become **hidden constructors**: constant fields are inlined, and non-constant values are passed as extra arguments. Emitting a plain object literal `{__type:"___struct___", __yyIsGMLObject:true, gmla:1}` also works with the runner (that is what `json_parse` builds).

**Control flow:**
```js
try { … } catch (gml_e) { gml_e = __yy__processException(gml_e); { … } }
for( var __yy__v39=0, __yy__v40=yyGetInt32(n); __yy__v39<__yy__v40; __yy__v39++) {{ … }}   // repeat(n)
do { … } while( !(!yyGetBool(cond)))                                                       // do … until(!cond)
var gmli = 0 ; for (; yyfless(gmli, n) ; <inc>) {{ … }}                                    // for
var ___sw2___ = expr; var ___swc3___ = -1;                                                 // switch
if (yyCompareVal(___sw2___,"a",g_GMLMathEpsilon, false)==0 || yyCompareVal(___sw2___,"b",g_GMLMathEpsilon,false)==0) { ___swc3___ = 0; } else if (…) { ___swc3___ = 1; }
switch( ___swc3___ ) { case 0: { …; break; } default: { … } }
```
`exit` becomes `return;`.

**Not seen in any sample:**
- `constructor : Parent()` inheritance. Use `__yy_gml_copy_prototype` / `Object.setPrototypeOf` on the prototypes.
- `[# ]`, `[@ ]`, `~`, `??`, `finally`.

## 4. The frame loop

### 4.1 Scheduling (_GameMaker.js:2339–2473, Function_Game.js:1847–1924)

- The game runs **one `GameMaker_DoAStep()` per `GameMaker_Tick()`**. It never catches up with several steps per tick, and there is no fixed-timestep accumulator.
- `GameMaker_Tick` works out the next frame time as `g_FrameStartTime + 1000/TargetSpeed`:
  - if the delay is more than 4 ms, it waits with `setTimeout(delay)` and then calls `requestAnimationFrame(animate)`;
  - otherwise it calls `requestAnimationFrame(animate)` directly.
  - So the frame rate is capped at `min(display refresh, TargetSpeed)`. A slow frame makes the game run in slow motion; frames are not skipped.
- `TargetSpeed = g_GameTimer.GetFPS()`. `CTimingSource.SetFrameRate(n)` fixes `m_fps = n`.
  - It is set from `Options.GameSpeed` at init (only when `AssetCompilerMajorVersion > 1`, see §1.2).
  - It is also set by the GML assignment `room_speed = n`, which compiles to `g_pBuiltIn.set_room_speed(n)` (yyBuiltIn.js) and calls `g_GameTimer.SetFrameRate`.
  - **A room's `speed` field does NOT change the timer.** `yyRoom.SetSpeed` only stores `m_speed` and `g_pBuiltIn.room_speed` (yyRoom.js:113). So `room_speed` reads return `g_GameTimer.GetFPS()`, which is the game speed.
  - If `m_fps` is 0 (not Zeus and no GameSpeed), `GetFPS()` derives the rate from the measured delta. Always emit `GameSpeed: 30`.
- When not paused (`Run_Paused`), each tick runs:
  - `ProcessMisc()` (canvas resize and fullscreen handling), then
  - `Graphics_StartFrame(); GameMaker_DoAStep(); Graphics_EndFrame();`.
  - After that, the `New_Room` switch handles room change / restart / end, with up to 10 iterations.
  - A room change runs `SwitchRoom → StartRoom` in the **same tick** and then **immediately runs another full DoAStep** (`done = false`), exactly like the loop in the native runner.

### 4.2 Order inside `GameMaker_DoAStep()` (_GameMaker.js:1741–1880)

The steps are listed below. **"⟳" means: after this step `UpdateActiveLists()` runs, and if `New_Room != -1` the rest of the step is abandoned.**

1. `delta_time` update; `g_pIOManager.StartStep()`; `HandleOSEvents()`; gamepad update.
2. `g_pInstanceManager.RememberOldPositions()` sets xprevious/yprevious.
3. `g_pInstanceManager.UpdateImages()` **advances `image_index` by `image_speed` (and fires Animation End) at the START of the frame, before Begin Step** (yyInstance.js:3620ff). ⟳
4. `g_pLayerManager.UpdateLayers()`.
5. Sequences begin-step, then **Begin Step** (`EVENT_STEP_BEGIN`). ⟳
6. Draw-Resize event, if the canvas size changed.
7. `g_pASyncManager.Process()`, which fires **async events** (http, image/sound loaded, save/load, dialogs). ⟳
8. `HandleTimeLine()` for **timelines**. ⟳ Then `HandleTimeSources()`. ⟳
9. `HandleAlarm()` for **alarms 0–11**. An alarm only counts down if the object or a parent has that alarm event (Events.js:659–690). ⟳
10. `HandleKeyboard()` for **keyboard / key press / key release** events. ⟳ Then `HandleMouse()`. ⟳
11. Layer effects step; sequences step; then **Step** (`EVENT_STEP_NORMAL`). ⟳
12. `UpdateInstancePositions()` applies speed/direction/gravity/friction and paths.
13. `HandleOther()` for **Outside Room / Intersect Boundary / outside-view / boundary-view** events. ⟳
14. `YYPushEventsDispatch()`. ⟳
15. `UpdateCollisions()` for **Collision events**, or the physics world step. ⟳
16. Sequences end-step, then **End Step** (`EVENT_STEP_END`). ⟳
17. `ParticleSystem_UpdateAll()`.
18. `g_RunRoom.RemoveMarked()` (destroyed instances are removed here), then **if `Draw_Automatic`** `g_RunRoom.Draw()` (yyRoom.js:4210):
    - `PreDraw` runs **Pre-Draw** (`EVENT_DRAW_PRE`);
    - `DrawViews` handles each view: **Draw Begin**, then the layers with the per-instance **Draw** event (or default `draw_self` if the object has no Draw event), then **Draw End**;
    - the application-surface target is reset;
    - `PostDraw` runs **Post-Draw**;
    - `DrawApplicationSurface`;
    - `DrawGUI` runs **Draw GUI Begin → GUI-layer draw → Draw GUI → Draw GUI End** (yyRoom.js:4174–4179);
    - then the cursor.
19. `ScrollBackground()`; system overlays; `audio_update()`.

Instances created during an event dispatch are not processed by that same dispatch. Each dispatcher snapshots `g_currentCreateCounter` and skips instances whose `createCounter` is greater (yyInstance.js:3744–3749, Events.js:661).

Instance event dispatch (`yyInstanceManager.PerformEvent`, yyInstance.js:3736):
- It iterates `g_RunRoom.m_Active.pool` **from last to first**. Compare this with the Windows VM on ordering-sensitive code (unverified).
- For each instance whose object (or an ancestor) has the event (`REvent`), it calls `yyInstance.PerformEvent`. That walks up the parent chain until an object that actually has the handler is found, then calls it as `handler(_inst, _other)` with `_other === _inst`.

### 4.3 Room start order (`StartRoom`, _GameMaker.js:1173–1545)

1. Room End on the old room.
2. Persistent instances are carried over.
3. The new room is created from storage.
4. For each stored instance, in `m_creationOrder`:
   - `PerformEvent(EVENT_PRE_CREATE)`;
   - `pPreCreateCode(inst, inst)`, if present;
   - `PerformEvent(EVENT_CREATE)`;
   - **then the instance creation code `pCode(inst, inst)`**. This is **after** the Create event, the GMS2 default. The instance's own creation code (`pCode`) runs after that instance's Create event.
5. Game Start, if this is the first room.
6. **Room creation code** `m_code(dummy, dummy)`, called with a dummy `yyInstance` as self and other (1515–1520).
7. Room Start.

### 4.4 Forcing deterministic 30 fps stepping / hooking per-frame logic

- **Rate:** emit `Options.AssetCompilerMajorVersion: 2, GameSpeed: 30`. `room_speed` assignments from game code still change the timer. If that is unwanted, compile `room_speed = x` to a no-op or patch `g_pBuiltIn.set_room_speed`.
- **Hook points.** All of these are plain global functions looked up by name at call time, so they can be reassigned from our own JS loaded after runner.js.
  - Wrap `GameMaker_DoAStep`, e.g. `var _orig = GameMaker_DoAStep; GameMaker_DoAStep = function(){ preStep(); _orig(); postStep(); }`. This is called once per game frame.
  - Or wrap `GameMaker_Tick`.
  - Or replace `animate`'s state-3 path entirely.
- **Fully deterministic / headless stepping** (tests, replay, TAS):
  - Replace `GameMaker_Tick` with your own driver. It should reproduce only the body of the `if (!Run_Paused)` block (_GameMaker.js:2395–2460):
    - `ProcessMisc(); SetCanvasSize(); Graphics_StartFrame(); GameMaker_DoAStep(); Graphics_EndFrame();`
    - then the same `switch (New_Room)` handling (`SwitchRoom(New_Room)` and loop, `Run_EndGame`, restart).
  - Drive it from your own clock: fixed N steps per `requestAnimationFrame`, or synchronously in a loop for headless runs.
  - `animate` re-arms itself only through `GameMaker_Tick`, so once state 3 is reached a replaced `GameMaker_Tick` owns the loop. Call `window.requestAnimationFrame(animate)` yourself if you still want rAF.
  - Make time deterministic:
    - `delta_time` comes from `g_CurrentTime` (set from `Date.now()` in `GameMaker_Tick`); `current_time` and `get_timer()` read real time.
    - Set `g_CurrentTime += 1000/30` yourself per step, and stub `get_timer` if the game reads it.
    - `random*` uses a seeded WELL512 generator (`InitRandom`, `random_set_seed`, Function_Maths.js:476–620). `randomize()` seeds from `Date`.
- **Alternative in-GML hook:** a persistent controller object whose Begin Step / End Step events are emitted by us. This is the least invasive option, but it runs inside the event order, not around it.

## 5. Gaps: HTML5 runner vs the Windows VM, for a GMS2022-era game

This runner is a **2024–2026 runtime**. It has `YYRef` handles, `string_split`, `struct_*`, `dbg_*` stubs and UI layers, so several gaps come from the version mismatch rather than from HTML5 itself. **[HIGH]** marks items likely to break or visibly change a Deltarune-like game.

### 5.1 Language/runtime semantics

- **[HIGH] A missing builtin function ends the game.**
  - Calling a global that doesn't exist throws `ReferenceError`. The `window 'error'` handler then prints "Unhandled Exception" and calls `game_end(-1)` (_GameMaker.js:196–203, 273).
  - At compile time, check every called function name against the set of global functions in the runner, and emit stubs for the rest. This covers extension functions (Steam etc.) and missing builtins such as `display_get_frequency`, `window_enable_borderless_fullscreen`, `window_get_borderless_fullscreen` and `is_instanceof` (map it to `YYIsInstanceof`).
- **[HIGH] Instance and object values are `YYRef` objects**, not numbers (yyTypes.js:78–86).
  - Sources:
    - `instance_create_*` (Function_Layers.js:5192)
    - `instance_find` (Function_Instance.js:45)
    - `collision_*`, `instance_place`, `instance_nearest` (Function_Collision.js:29, 42, 256…)
    - the `object_index` getter (yyInstance.js:438)
  - Plain JS `==`, `<`, `+`, `Map`/`ds_map` keys and array indices break on them.
  - `string(ref)` gives `"ref instance 100001"`; GMS2022 gives `"100001"`.
  - Route comparisons through `yyfequal`/`yyCompareVal` and convert with `yyGetInt32`. Alternatively, patch the runner to return plain numbers, which is the simplest way to get 2022 semantics.
- **[MED] Conversions are strict.** `yyGetInt32(undefined)` / `yyGetReal(undefined)` throw `yyError` (yyTypes.js:321). Deltarune code that relied on the 2022 VM's undefined→0 leniency, if any, will crash. Consider a lenient build of these helpers.
- `script_execute(idx)` with `idx < 100000` indexes a table of *all window functions* in enumeration order (yyVariable.js:345–362). Builtin-function indices never match Windows.
- **Runner bug:** `Function_YoYo.js:1043, 1116` contain `_index == yyGetInt32(_index);`, a comparison instead of an assignment. A string or ref script index is not converted. Emit numeric or function script refs.
- `string(real)` gives 2 decimals for non-integers (`toFixed(2)`, yyTypes.js:497–503); integers ≥ 2³¹ print as `"3000000000.00"`.
- The equality epsilon is `g_GMLMathEpsilon = 1e-5` (Function_Maths.js:19), the same as the VM default.

### 5.2 Rendering

- **WebGL 1 only** (libWebGL.js:291–292). The context uses `antialias:false`, `premultipliedAlpha:false`, and gets a stencil buffer only if the game has SWFs (yyWebGL.js:290–294).
- **[HIGH] Canvas2D fallback** (when WebGL is unavailable) loses:
  - shaders (Function_Shaders.js:30–49);
  - `draw_set_blend_mode_ext` (Function_Graphics.js:1750);
  - all `gpu_*` (Function_D3D.js:134–257);
  - multi-colour text.
- **Blend modes.** `gpu_set_blendmode` 0–3 are implemented. `bm_subtract` uses `FUNC_REVERSE_SUBTRACT`. `bm_min`/`max` need `EXT_blend_minmax` (yyCommandBuilder.js:705–721). `gpu_set_blendmode_ext` / `_sepalpha` work.
  - *Uncertain:* `_ext` does not reset the blend equation after `bm_subtract` (Function_D3D.js:1283–1305).
- **Texture repeat** is ignored on non-power-of-two textures, because WebGL1 can't wrap them (yyCommandBuilder.js:1203–1221). Shader effects that sample a surface with wrap will look different.
- **Surfaces.**
  - `surface_create`, `surface_set_target`, `surface_reset_target`, `surface_copy`, `surface_getpixel`, `draw_getpixel` and `application_surface_*` work.
  - `surface_get_texture` returns an **object**, not a number (Function_Surface.js:378).
  - `surface_set_target_ext` (MRT), `draw_surface_tiled_ext`, `surface_save` and `surface_save_part` are stubs.
  - Pixel reads stall the GPU.
- **Shaders.**
  - GLSL ES 1.00 only, compiled from the `Shaders[]` source strings.
  - **[HIGH]** A shader that fails to compile makes `shader_get_uniform` return `undefined`. The next `shader_set_uniform_f` then throws and ends the game (yyWebGL.js:4884–4915).
  - Test every Deltarune shader.
- `texture_set_interpolation` / `gpu_set_texfilter` work per stage. The default comes from `Options.interpolatePixels`.

### 5.3 Audio

- WebAudio only when `UseNewAudio` or Zeus is set (_GameMaker.js:721). Otherwise most `audio_*` functions no-op.
- **[HIGH] The audio context only unlocks on pointer events** (pointerdown/up, mouse or touch; Function_Sound.js:1062–1100), **not on keydown**.
  - Any `audio_play_sound` while the context is suspended returns −1 and is **dropped** (AudioPlaybackProps.js:88–91), so title music played before the first click is lost.
  - Add a keydown → `g_WebAudioContext.resume()` listener, and re-issue music after unlock.
- **Files:** only `.ogg` (if the browser can play Vorbis) or `.mp3` are fetched (§2.6).
- **[HIGH] "Streamed" sounds** (`kind:1`) are re-fetched with XHR and **fully decoded on every play** (Function_Sound.js:465–491). `audio_create_stream` downloads and decodes the whole file (3167–3211), and `audio_sound_length` is −1 until that finishes.
  - For Deltarune music, consider `kind:0` with lazy group loading, or patch `Audio_PrepareStream` to cache decoded buffers.
- `audio_play_sound(index, priority, loop, gain, offset, pitch)`, `audio_sound_pitch`, `audio_sound_gain` (with ramp) and `audio_group_*` work.
  - Quirks: `audio_group_load` returns `undefined`/0; a group with no sounds never reports loaded (Function_Sound.js:2876–2912).
- All `audio_*_sync_group*`, emitter velocity and listener-mask functions are stubs (Unsupported.js:208–233).
- Audio pauses while the tab is hidden.

### 5.4 Files, saves, ini

- **Writes go to `localStorage`** under the key `<DisplayName>.<gameId>.<filename>` (LocalStorage.js:35–50, yyIniFile.js:809–829).
- **Reads** try localStorage first, then a **synchronous XHR** to `g_RootDir/<file>` (yyIniFile.js:841–905). `file_exists` on a missing file sends a sync HEAD request **on every call** (yyIniFile.js:705–719).
- The ~5 MB quota is enforced and failures are silent.
- `file_text_*`:
  - The file is buffered in memory and written only on `file_text_close` (Function_File.js:169–190).
  - `file_text_readln` returns the line **including** CR/LF (422–467); unverified whether Windows does the same.
  - `file_text_read_real` doesn't parse exponents.
  - `file_text_write_real` writes JS number formatting.
- `ini_*` works and is written on `ini_close` only if it changed. Values are always quoted. `ini_read_real` is `parseFloat`.
- **[MED–HIGH]** All `file_bin_*`, `directory_*` and `file_find_*` are stubs (Function_File.js:613–980). `environment_get_variable` returns `""`. `game_save` / `game_load` are stubs.
- `buffer_save` / `buffer_load` store base64 in localStorage. `ds_*_write` / `read` accept only format versions 302/303. `json_*` works.

### 5.5 Window, input, OS

- **[HIGH] `game_change` is a stub** (Unsupported.js:167). Deltarune's chapter select (the launcher's `game_change` to `chapterN_windows/data.win`) must be reimplemented: reload the page with a different game JS.
- **[HIGH] `window_set_fullscreen` is a no-op** (Function_Window.js:97–104). F11 is swallowed before the game sees it (yyIOManager.js:742–750). F10 toggles fullscreen only with `Options.allowFullScreenKey`.
  - `window_set_cursor` with an unsupported cursor **throws** (Function_Window.js:351).
  - Many `window_*` setters are ErrorFunction or empty.
- **`keyboard_string`** gets one character per frame, with no IME (yyIOManager.js:1697–1718). Japanese text entry is unavailable.
- **Gamepad** uses the browser "standard" mapping; slots are `navigator.getGamepads()` indices; vibration and hats are no-ops. (Function_Gamepad.js)
- `os_type` is the host OS (e.g. `os_linux`), and `os_get_info()` returns −1. `parameter_*` read the URL query string.
- The loop pauses in background tabs, whereas Windows keeps running.
- `game_end` stops the loop and leaves a dead canvas. `game_restart` resets rooms but not globals (_GameMaker.js:2438–2448).

### 5.6 Other stubs likely to matter

- `sprite_add` is **asynchronous** (Function_Sprite.js:~780–813).
- `font_add` gives a canvas/CSS font, which some WebGL paths don't render (yyFont.js:2445).
- `object_set_mask`, `object_set_parent`, `timeline_moment_add` and `instance_deactivate_region_special` are missing.
- `gc_*`, `show_question`, `dbg_*`, `get_open_filename` and `clipboard_*` (async/permission) are stubs.
- The full list is in `scripts/Unsupported.js`. Grep for `ErrorFunction(` and `MissingFunction(`.

## 6. Existing tools: prior art

**No open-source tool was found that converts a data.win (or an UndertaleModTool dump) into this runner's `JSON_game` + `gml_*` JS format. None transpiles GML bytecode or decompiled GML to HTML5-runner JS either.** The existing routes are listed below.

| Route | Project | Notes |
|---|---|---|
| Separate VM reading data.win directly, compiled to WASM | **Butterscotch**, https://github.com/ButterscotchRunner/Butterscotch | C reimplementation of the YoYo runner (bytecode 8–17). Runs Undertale and Deltarune on the web (https://butterscotch.mrpowergamerbr.com/web/). **AGPL-3.0**, very active. The README explains why it chose not to transpile. |
| Separate VM (desktop) | **OpenGM**, https://github.com/misternebula/OpenGM | .NET runner, MIT. Runs Deltarune Ch1–4 (built with GMS 2022.0.3.104), which makes it a useful behavioural reference for 2022 semantics. |
| Separate VM | AcornRunner, https://github.com/BioTomateDE/AcornRunner | Rust, early. |
| YoYo's closed-source WASM (GX.games) runner with `game.unx` swapped in | e.g. `Katsugachi/deltarune`, `genizy/web-port` | Proprietary runner binary. Proof of concept only. |
| Decompile → GMS project → official IDE/Igor HTML5 build | **Barkley web port**, https://github.com/Wyatt-Stanke/barkley | The only proven route to real HTML5-runner output. It needs a GameMaker licence and Igor. Its `src/README.md` lists the GML-on-HTML5 fixes it needed: undefined no longer reads as 0; assigning to a missing instance crashes. |
| data.win → GMS2 project | **UndertaleModTool**, https://github.com/UnderminersTeam/UndertaleModTool (GPL-3.0) | Underanalyzer decompiler |
| data.win → GMS2 project | burnedpopcorn/UnderAnalyzer-Decompiler | .yyp export scripts |
| data.win → GMS1 project | cubeww/UndertaleModTool-ExportToProjectScript | GMS1 .gmx export |
| GML → JS on the HTML5 runtime | GMLive.js, https://yal.cc/introducing-gmlive/ | **Closed source.** Proves that the concept works. |
| Sample compiled HTML5 output (format reference) | garrlker/GameMakerPS2, `examples/*/html5game/*.js` | **GMS1-era** output: `_inst.setx(...)`, `array_set_1D(...)`. Confirms `gml_Object_<obj>_<Event>_<n>(_inst,_other)`, `gml_Script_<n>(_inst,_other,argument0..)`, `var gml<local>`, `_inst.gml<var>`, `global.gml<var>`, `g_pBuiltIn.room_width`, `pCode: gml_RoomCC_<room>_<n>_Create`, `parent: -100`, and room instance ids from 100000. |
| Background reading | yal.cc, "On GameMaker game decompilation", https://yal.cc/on-gamemaker-studio-game-decompilation/ | |

For our purposes, Butterscotch and OpenGM are the best **behavioural oracles**: they run the same data.win, so their output can be compared against ours. UTMT/Underanalyzer is the natural front end (decompiled GML or bytecode → our emitter).

## Appendix A: Minimal bootable game (verified)

**What was run.** The files below were run against this runner checkout in headless Chromium (Playwright `chrome-headless-shell`, SwiftShader WebGL), served over HTTP.

**Layout:**
- `index.html`
- `scripts/`, a symlink to `tools/gm-html5/scripts`
- `html5game/names.js`, the two commented tables from yyVariable.js, extracted verbatim with `awk '/^var g_global_names = \{/{f=1} f{print} f&&/^\s*\};/{exit}'` (and the same for `g_instance_names`)
- `html5game/game.js`

**Observed after 2.5 s:**
- **WebGL and timing:** WebGL on, Zeus mode on, `GetFPS()=30`, about 76 steps (about 30 steps per second).
- **Startup order:** `gmlInitGlobal` ran the global script before the first room, and `script_execute(global,global,100000,2,3)` returned 5.
- **Events:** Create ran for the room instance. `event_inherited` inside the child's Create ran the parent's Create.
- **Instance creation:** `instance_create_depth` returned a `YYRef` with id **1000000**; `string(ref)` gave `"ref instance 1000000"`.
- **Comparisons:**
  - `yyInst(_inst,_other,ref).gmlfoo = 42` stuck.
  - `object_index == 1` in plain JS was **false**, while `yyfequal(object_index, 1)` was **true**.
  - `ref == MAKE_REF(...)` was false, while `yyfequal(ref, id)` was true.
- **Audio worklet:** its 404 fell back to dummy buses, as described in §1.3.
- **Missing arrays:** without `Sequences: []`/`AnimCurves: []` boot died in `new yyFontManager → asset_get_index` (§2.1).

`index.html`:
```html
<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
<canvas id="canvas" width="640" height="480"></canvas>
<script src="scripts/runner.js"></script>
<script src="html5game/names.js"></script>
<script src="html5game/game.js"></script>
<script>window.addEventListener("load", function(){ GameMaker_Init(); });</script>
</body></html>
```

`html5game/game.js`:
```js
var Tags = [], IDToTagList = [];
window.__steps = 0; window.__log = [];
function gml_Object_obj_hello_Create_0(_inst, _other) {
    _inst.gmlt = 0;
    window.__log.push("create id=" + _inst.id + " x=" + _inst.x + " counter=" + global.gmlcounter);
}
function gml_Object_obj_hello_Step_0(_inst, _other) {
    _inst.gmlt = yyfplus(_inst.gmlt, 1);
    window.__steps = _inst.gmlt;
    if (yyfequal(_inst.gmlt, 3)) {
        var r = instance_create_depth(10, 20, 0, 1);
        window.__log.push("created ref type=" + (r instanceof YYRef) + " val=" + yyGetInt32(r) + " str=" + yyGetString(r));
        yyInst(_inst, _other, r).gmlfoo = 42;
        var w = GetWithArray(1);
        for (var k=0;k<w.length;k++) window.__log.push("with["+k+"] id=" + w[k].id + " foo=" + w[k].gmlfoo + " objidx==1? " + yyfequal(w[k].object_index, 1) + " js== " + (w[k].object_index == 1) + " refEq " + (r == MAKE_REF(REFID_INSTANCE, yyGetInt32(r))) + " yyfequal(ref,id) " + yyfequal(r, w[k].id));
        window.__log.push("room_speed=" + g_pBuiltIn.get_room_speed() + " room=" + g_pBuiltIn.get_current_room());
    }
}
function gml_Object_obj_hello_Draw_0(_inst, _other) {
    draw_text(32, 32, yyfplus("t = ", string(_inst.gmlt)));
}
function gml_Object_obj_child_Create_0(_inst, _other) {
    window.__log.push("child create, calling inherited");
    event_inherited(_inst, _other);
}
function gml_Object_obj_base_Create_0(_inst, _other) { window.__log.push("base create ran on " + _inst.id); }
function gml_Script_add2(_inst, _other, argument0, argument1) { return yyfplus(argument0, argument1); }
function gml_GlobalScript_scr_init(_inst, _other) { global.gmlcounter = 7; }
function gmlInitGlobal() {
    for (var i = 0; i < JSON_game.ScriptNames.length; i++)
        if (JSON_game.ScriptNames[i].startsWith("gml_GlobalScript_")) JSON_game.Scripts[i](global, global);
    window.__log.push("script_execute=" + script_execute(global, global, 100000, 2, 3));
}
var JSON_game = {
    Options: { AssetCompilerMajorVersion: 2, GameSpeed: 30, WebGL: 2, UseNewAudio: true,
               interpolatePixels: false, DrawColour: 0xffffffff, ViewColour: 0, debugMode: false,
               scale: 1, showCursor: true, DisplayName: "boottest", gameId: 0 },
    Textures: [], TexturesBlocks: [], TPageEntries: [],
    Sprites: [], Backgrounds: [], Fonts: [], Sounds: [], AudioGroups: [{name:"audiogroup_default", enabled:true}],
    Paths: [], Timelines: [], Sequences: [], AnimCurves: [], Shaders: [], Extensions: [], GMUILayers: [], Triggers: [],
    Scripts: [gml_Script_add2, gml_GlobalScript_scr_init], ScriptNames: ["gml_Script_add2", "gml_GlobalScript_scr_init"],
    GMObjects: [
        { pName: "obj_hello", spriteIndex: -1, visible: true, solid: false, persistent: false, depth: 0, parent: -1, spritemask: -1,
          CreateEvent: gml_Object_obj_hello_Create_0, StepNormalEvent: gml_Object_obj_hello_Step_0, DrawEvent: gml_Object_obj_hello_Draw_0, CollisionEvents: [] },
        { pName: "obj_base", spriteIndex: -1, visible: true, solid: false, persistent: false, depth: 0, parent: -1, spritemask: -1,
          CreateEvent: gml_Object_obj_base_Create_0, CollisionEvents: [] },
        { pName: "obj_child", spriteIndex: -1, visible: true, solid: false, persistent: false, depth: 0, parent: 1, spritemask: -1,
          CreateEvent: gml_Object_obj_child_Create_0, CollisionEvents: [] }
    ],
    GMRooms: [
        { pName: "room_start", width: 640, height: 480, speed: 30, persistent: false, colour: 0, showColour: true, enableViews: false,
          views: [0,1,2,3,4,5,6,7].map(function(){ return { visible:false, index:-1 }; }),
          backgrounds: [],
          pInstances: [ { x: 5, y: 6, index: 0, id: 100000, colour: 0xFFFFFFFF }, { x: 0, y: 0, index: 2, id: 100001, colour: 0xFFFFFFFF } ],
          LayerCount: 1,
          layers: [ { pName: "Instances", id: 1, type: 2, depth: 0, visible: true, icount: 2, iinstIDs: [100000, 100001] } ] }
    ],
    RoomOrder: [0]
};
```

Checklist for the real emitter:
- Keep asset indices identical to data.win, using `null` holes.
- Always emit `spriteIndex`, `visible` and `parent: -1` on objects.
- Instance `colour` must include alpha (`0xFFFFFFFF`).
- Emit one TPE per sprite frame.
- Crop masks to the bbox and RLE them.
- Transcode audio to `.ogg` + `.mp3`.
- Concatenate the audio worklets.
- Declare `Tags`, `IDToTagList`, `g_global_names` and `g_instance_names`.
- Emit every top-level array listed in §2.1, even when empty.
- Run `gml_GlobalScript_*` from `gmlInitGlobal`, and set the builtin self/other flags there.
- Stub every called function that the runner lacks.
