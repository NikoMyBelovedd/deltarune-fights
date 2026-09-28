// Extracts the sprites, fonts and sounds the menus use from the chapter exports into public/ui/.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { PNG } from 'pngjs';

const ROOT = join(dirname(new URL(import.meta.url).pathname), '../..');
const OUT = join(ROOT, 'public/ui');

interface Export {
  sprites: ({ name: string; width: number; height: number; originX: number; originY: number; frames: number[] } | null)[];
  tpag: number[][];
  textures: { file: string }[];
  fonts: { name: string; tpag: number; size: number; ascender: number; lineHeight: number; glyphs: { c: number; x: number; y: number; w: number; h: number; shift: number; offset: number }[] }[];
}

const exports = new Map<number, Export>();
const pages = new Map<string, PNG>();

function exp(ch: number): Export {
  let e = exports.get(ch);
  if (!e) {
    e = JSON.parse(readFileSync(join(ROOT, `.gamedata/ch${ch}/export/data.json`), 'utf8')) as Export;
    exports.set(ch, e);
  }
  return e;
}

function page(ch: number, tex: number): PNG {
  const key = `${ch}/${tex}`;
  let p = pages.get(key);
  if (!p) {
    p = PNG.sync.read(readFileSync(join(ROOT, `.gamedata/ch${ch}/export/textures/${tex}.png`)));
    pages.set(key, p);
  }
  return p;
}

/** Draws a texture page item into dst at (dx,dy), honouring the trimmed target offset. */
function blitTpag(ch: number, tp: number, dst: PNG, dx: number, dy: number): void {
  const [sx, sy, sw, sh, tx, ty, , , , , tex] = exp(ch).tpag[tp];
  const src = page(ch, tex);
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const si = ((sy + y) * src.width + (sx + x)) * 4;
      const ox = dx + tx + x, oy = dy + ty + y;
      if (ox < 0 || oy < 0 || ox >= dst.width || oy >= dst.height) continue;
      const di = (oy * dst.width + ox) * 4;
      dst.data[di] = src.data[si];
      dst.data[di + 1] = src.data[si + 1];
      dst.data[di + 2] = src.data[si + 2];
      dst.data[di + 3] = src.data[si + 3];
    }
  }
}

const manifest: Record<string, unknown> = { sprites: {}, fonts: {}, sfx: [] };

function sprite(ch: number, name: string, alias = name): void {
  const s = exp(ch).sprites.find((x) => x?.name === name);
  if (!s) { console.warn(`missing sprite ch${ch}:${name}`); return; }
  const n = s.frames.length;
  const png = new PNG({ width: s.width * n, height: s.height });
  s.frames.forEach((tp, i) => blitTpag(ch, tp, png, i * s.width, 0));
  mkdirSync(join(OUT, 'sprites'), { recursive: true });
  writeFileSync(join(OUT, 'sprites', `${alias}.png`), PNG.sync.write(png));
  (manifest.sprites as Record<string, unknown>)[alias] = { w: s.width, h: s.height, frames: n, ox: s.originX, oy: s.originY };
}

function font(ch: number, name: string): void {
  const f = exp(ch).fonts.find((x) => x.name === name);
  if (!f) { console.warn(`missing font ${name}`); return; }
  const [, , , , , , , , bw, bh] = exp(ch).tpag[f.tpag];
  const png = new PNG({ width: bw, height: bh });
  blitTpag(ch, f.tpag, png, 0, 0);
  mkdirSync(join(OUT, 'fonts'), { recursive: true });
  writeFileSync(join(OUT, 'fonts', `${name}.png`), PNG.sync.write(png));
  const glyphs: Record<number, number[]> = {};
  for (const g of f.glyphs) glyphs[g.c] = [g.x, g.y, g.w, g.h, g.shift, g.offset];
  (manifest.fonts as Record<string, unknown>)[name] = { size: f.size, glyphs };
}

function sfx(ch: number, name: string): void {
  const dir = join(ROOT, `.gamedata/ch${ch}/export/audio`);
  const file = readdirSync(dir).find((f) => f.startsWith(name + '.'));
  if (!file) { console.warn(`missing sound ${name}`); return; }
  mkdirSync(join(OUT, 'sfx'), { recursive: true });
  copyFileSync(join(dir, file), join(OUT, 'sfx', file));
  (manifest.sfx as string[]).push(file);
}

for (const f of ['fnt_main', 'fnt_mainbig', 'fnt_small', 'fnt_tinynoelle']) font(1, f);
for (const s of ['spr_heart', 'spr_heartsmall', 'spr_textbox_topleft', 'spr_textbox_top', 'spr_textbox_left', 'spr_headkris', 'spr_headsusie', 'spr_headralsei', 'spr_tplogo',
  'spr_btfight', 'spr_btact', 'spr_btitem', 'spr_btspare', 'spr_btdefend']) sprite(1, s);
sprite(2, 'spr_headnoelle');
// Boss previews (battle idle sprites)
const bosses: [number, string, string][] = [
  [1, 'spr_joker_main', 'boss_jevil'], [1, 'spr_chainking_idle', 'boss_king'], [2, 'spr_queen_chair_1_old', 'boss_queen'],
  [2, 'spr_sneo_example', 'boss_spamton_neo'], [3, 'spr_tenna_pose_podium', 'boss_tenna'], [3, 'spr_roaringknight_idle', 'boss_knight'],
  [4, 'spr_titan_rumble', 'boss_titan'], [4, 'spr_gerson_idle', 'boss_gerson'], [5, 'spr_flowery_idle', 'boss_flowery'], [5, 'spr_pink_idle', 'boss_pink'],
];
if (process.env.PREVIEW) for (const spec of process.env.PREVIEW.split(',')) { const [c, n] = spec.split(':'); sprite(Number(c), n, `preview_${n}`); }
for (const [ch, name, alias] of bosses) {
  // Recorded in-battle idle animations (tools/build/capture.ts) take priority over the plain sprite.
  const cap = join(ROOT, '.gamedata/captured', alias);
  if (existsSync(`${cap}.png`)) {
    copyFileSync(`${cap}.png`, join(OUT, 'sprites', `${alias}.png`));
    (manifest.sprites as Record<string, unknown>)[alias] = JSON.parse(readFileSync(`${cap}.json`, 'utf8'));
  } else if (existsSync(join(ROOT, `.gamedata/ch${ch}/export/data.json`))) sprite(ch, name, alias);
}
for (const s of ['snd_menumove', 'snd_select', 'snd_cantselect', 'snd_equip', 'snd_error', 'snd_hurt1']) sfx(1, s);

writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest));
console.log(`ui assets: ${Object.keys(manifest.sprites as object).length} sprites, ${Object.keys(manifest.fonts as object).length} fonts, ${(manifest.sfx as string[]).length} sfx`);
