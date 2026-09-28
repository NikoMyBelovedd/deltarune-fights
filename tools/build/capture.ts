// Records a boss's real in-battle idle animation for the menus.
// Runs the patched chapter in capture mode (everything but the boss hidden over a key colour), screenshots a range
// of frames with desktop Butterscotch, keys out the background, crops, and writes an animation strip into public/ui.
// Usage: node tools/build/capture.ts <chapter> <ini> <alias> [frames=188] [step=2]
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { PNG } from 'pngjs';

const ROOT = join(dirname(new URL(import.meta.url).pathname), '../..');
const [chapter, ini, alias, framesArg = '188', stepArg = '2', mode = 'key'] = process.argv.slice(2);
// mode 'black': the boss is recorded over black (no keying), for translucent effects like the Knight's afterimages.
const BLACK = mode === 'black';
const FRAMES = Number(framesArg);
const STEP = Number(stepArg);
const KEY = [1, 0, 254];
const WORK = join(ROOT, '.gamedata/capture', alias);
rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });

function run(frames: number[], dir: string): void {
  mkdirSync(dir, { recursive: true });
  const args = [chapter, ini, '--headless', '--playback-inputs', join(ROOT, 'tests/inputs/none.json'), '--screenshot', join(dir, '%d.png')];
  for (const f of frames) args.push('--screenshot-at-frame', String(f));
  args.push('--exit-at-frame', String(Math.max(...frames) + 1));
  execFileSync(join(ROOT, 'tools/patch/run-desktop.sh'), args, { stdio: 'ignore', timeout: 900_000 });
}

const isKey = (d: Buffer, i: number) => BLACK ? d[i] < 3 && d[i + 1] < 3 && d[i + 2] < 3 : Math.abs(d[i] - KEY[0]) <= 2 && Math.abs(d[i + 1] - KEY[1]) <= 2 && Math.abs(d[i + 2] - KEY[2]) <= 2;
function keyShare(p: PNG): number {
  let n = 0;
  for (let i = 0; i < p.data.length; i += 16) if (isKey(p.data, i)) n++;
  return n / (p.data.length / 16);
}

// 1. Find when the capture backdrop appears.
const sweep = Array.from({ length: 150 }, (_, i) => 60 + i * 10);
run(sweep, join(WORK, 'sweep'));
// The backdrop draws a 4x4 key-colour marker at the view's top-left corner.
const marker = (p: PNG) => { const d = p.data; return Math.abs(d[4 * (1 * p.width + 1)] - KEY[0]) <= 2 && Math.abs(d[4 * (1 * p.width + 1) + 1] - KEY[1]) <= 2 && Math.abs(d[4 * (1 * p.width + 1) + 2] - KEY[2]) <= 2; };
const start = sweep.find((f) => {
  const p = join(WORK, 'sweep', `${f}.png`);
  return existsSync(p) && marker(PNG.sync.read(readFileSync(p)));
});
if (start === undefined) throw new Error('capture backdrop never appeared');
console.log(`capture starts by frame ${start}`);

// 2. Record the idle loop.
const frames = Array.from({ length: Math.ceil(FRAMES / STEP) }, (_, i) => start + 10 + i * STEP);
run(frames, join(WORK, 'loop'));
const imgs = frames.map((f) => PNG.sync.read(readFileSync(join(WORK, 'loop', `${f}.png`))));

// 3. Union bounding box of everything that isn't the key colour.
let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
for (const p of imgs) {
  for (let y = 0; y < p.height; y++) {
    for (let x = 0; x < p.width; x++) {
      const i = (y * p.width + x) * 4;
      if (x < 6 && y < 6) continue; // capture marker
      if (!isKey(p.data, i)) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
  }
}
// Puppet strings run off the top of the screen: keep ~40px of them above the first non-string row.
const isString = (d: Buffer, i: number) => d[i + 1] >= 40 && d[i] < 40 && d[i + 2] < 40; // the green wires (two shades)
let bodyTop = Infinity;
for (const p of imgs) {
  for (let y = y0; y <= y1 && y < bodyTop; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = (y * p.width + x) * 4;
      if (!isKey(p.data, i) && !isString(p.data, i)) { bodyTop = Math.min(bodyTop, y); break; }
    }
  }
}
if (bodyTop !== Infinity) y0 = Math.max(y0, bodyTop - 40);
const w = x1 - x0 + 1, h = y1 - y0 + 1;
const strip = new PNG({ width: w * imgs.length, height: h });
imgs.forEach((p, k) => {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = ((y0 + y) * p.width + (x0 + x)) * 4;
      const di = (y * strip.width + k * w + x) * 4;
      if ((isKey(p.data, si) && !BLACK) || (x0 + x < 6 && y0 + y < 6)) continue;
      strip.data[di] = p.data[si]; strip.data[di + 1] = p.data[si + 1]; strip.data[di + 2] = p.data[si + 2]; strip.data[di + 3] = 255;
    }
  }
});
writeFileSync(join(ROOT, 'public/ui/sprites', `${alias}.png`), PNG.sync.write(strip));
const manifestPath = join(ROOT, 'public/ui/manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
manifest.sprites[alias] = { w, h, frames: imgs.length, ox: 0, oy: 0, fps: 30 / STEP };
writeFileSync(manifestPath, JSON.stringify(manifest));
// Keep a copy so ui-assets.ts can restore it without re-recording.
mkdirSync(join(ROOT, '.gamedata/captured'), { recursive: true });
writeFileSync(join(ROOT, '.gamedata/captured', `${alias}.png`), PNG.sync.write(strip));
writeFileSync(join(ROOT, '.gamedata/captured', `${alias}.json`), JSON.stringify(manifest.sprites[alias]));
console.log(`${alias}: ${imgs.length} frames of ${w}x${h} (box ${x0},${y0}-${x1},${y1})`);
void readdirSync;
