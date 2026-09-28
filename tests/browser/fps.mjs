// Starts a fight on the dev page and reports game frames per second once the battle is running.
import { chromium } from 'playwright';
const [query = 'boss=jevil&intro=0&mode=single&attack=1', secs = '8', shot] = process.argv.slice(2);
const b = await chromium.launch({ args: process.env.GPU ? ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=gl', '--autoplay-policy=no-user-gesture-required'] : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage();
p.on('pageerror', (e) => console.log('pageerror:', e.message.slice(0, 200)));
await p.goto(`http://localhost:5317/dev.html?auto&${query}`);
for (let i = 0; i < 160; i++) {
  if (await p.evaluate(() => window.__events.some((e) => e.type === 'event' && e.name === 'battle'))) break;
  await p.keyboard.press('z'); await p.waitForTimeout(250);
}
await p.waitForTimeout(2000);
const frame = () => p.evaluate(async () => (await window.__host.replay()).frame);
const f0 = await frame(); const t0 = Date.now();
await p.waitForTimeout(Number(secs) * 1000);
const f1 = await frame();
console.log(`fps ${((f1 - f0) / ((Date.now() - t0) / 1000)).toFixed(1)}`);
if (shot) await p.screenshot({ path: shot });
await b.close();
