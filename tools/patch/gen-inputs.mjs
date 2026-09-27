// node gen-inputs.mjs <out.json> <spec...>   spec: "mash:KEY:from:to:every" | "hold:KEY:from:to" | "tap:KEY:frame"
import { writeFileSync } from 'node:fs';
const KEYS = { Z: 90, X: 88, C: 67, ENTER: 13, SHIFT: 16, LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40 };
const frames = {};
const at = (f) => (frames[f] ??= { keysPressed: [], keysReleased: [] });
const [out, ...specs] = process.argv.slice(2);
for (const s of specs) {
  const [kind, k, a, b, c] = s.split(':');
  const key = KEYS[k] ?? Number(k);
  if (kind === 'tap') { at(+a).keysPressed.push(key); at(+a + 2).keysReleased.push(key); }
  if (kind === 'hold') { at(+a).keysPressed.push(key); at(+b).keysReleased.push(key); }
  if (kind === 'mash') for (let f = +a; f < +b; f += +c) { at(f).keysPressed.push(key); at(f + 2).keysReleased.push(key); }
}
writeFileSync(out, JSON.stringify(frames));
