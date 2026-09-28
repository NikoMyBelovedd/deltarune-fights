// Records a run with random inputs, plays it back, and checks the event logs match.
import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto('http://localhost:5317/dev.html?auto&mode=practice&intro=0&seed=777');
const keys = ['z', 'z', 'z', 'z', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
let seed = 42;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const t0 = Date.now();
while (Date.now() - t0 < 45000) {
  const k = keys[Math.floor(rnd() * keys.length)];
  await page.keyboard.down(k);
  await page.waitForTimeout(40 + rnd() * 300);
  await page.keyboard.up(k);
  await page.waitForTimeout(rnd() * 100);
}
const rec = await page.evaluate(async () => {
  const r = await window.__host.replay();
  const evs = window.__events.filter((e) => e.type === 'event').map((e) => `${e.name} ${e.data}`);
  return { events: Array.from(r.events), frame: r.frame, log: evs };
});
console.log('recorded', rec.events.length / 3, 'inputs over', rec.frame, 'frames;', rec.log.length, 'events');
await page.evaluate(async ({ events }) => { await window.__playback(window.__ini(), new Int32Array(events)); }, rec);
// wait until playback passes the recorded frame
for (;;) {
  await page.waitForTimeout(1000);
  const f = await page.evaluate(async () => (await window.__host.replay()).frame);
  console.log("playback frame", f, "/", rec.frame);
  if (f >= rec.frame || Date.now() - t0 > 200000) break;
}
const log2 = await page.evaluate(() => window.__events.filter((e) => e.type === 'event').map((e) => `${e.name} ${e.data}`));
const a = rec.log.join('\n'), b = log2.slice(0, rec.log.length).join('\n');
console.log(a === b ? 'REPLAY MATCHES' : 'REPLAY DIFFERS');
if (a !== b) { console.log('--- original\n' + a.slice(0, 800) + '\n--- replay\n' + b.slice(0, 800)); }
await browser.close();
