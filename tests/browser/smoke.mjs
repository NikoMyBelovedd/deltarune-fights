// Opens the dev page, starts a fight, optionally mashes Z, and screenshots.
// node tests/browser/smoke.mjs <url-query> <seconds> <out-prefix> [mash]
import { chromium } from 'playwright';
const [query = 'auto', secs = '20', out = '/tmp/drweb', mash] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 700, height: 800 } });
page.on('console', (m) => { const t = m.text(); if (!t.includes('[vite]')) console.log('console:', t.slice(0, 300)); });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto(`http://localhost:5317/dev.html?${query}`);
const t0 = Date.now();
let shot = 0;
while (Date.now() - t0 < Number(secs) * 1000) {
  await page.waitForTimeout(1000);
  if (mash) { await page.keyboard.down('z'); await page.waitForTimeout(80); await page.keyboard.up('z'); }
  if ((Date.now() - t0) / 1000 > (shot + 1) * (Number(secs) / 3)) { shot++; await page.screenshot({ path: `${out}-${shot}.png` }); }
}
const events = await page.evaluate(() => window.__events.filter((e) => e.type !== 'log').slice(-20));
console.log(JSON.stringify(events));
const logs = await page.evaluate(() => window.__events.filter((e) => e.type === 'log').slice(-15).map((e) => e.text));
console.log(logs.join('\n'));
await browser.close();
