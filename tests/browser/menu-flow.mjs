// Walks the menus to start Jevil and screenshots each step.  node tests/browser/menu-flow.mjs <outdir>
import { chromium } from 'playwright';
const out = process.argv[2] ?? '/tmp';
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('console:', m.text().slice(0, 200)); });
const snap = (n) => page.screenshot({ path: `${out}/flow-${n}.png` });
const press = async (k, n = 1) => { for (let i = 0; i < n; i++) { await page.keyboard.press(k); await page.waitForTimeout(120); } };
await page.goto('http://localhost:5317/');
await page.waitForTimeout(1500);
await snap('1-title');
await press('z'); await page.waitForTimeout(300); await snap('2-select');
await press('z'); await page.waitForTimeout(500); await snap('3-setup');
await press('ArrowDown', 2); await press('z'); await page.waitForTimeout(400); await snap('4-equip');
await press('z'); await page.waitForTimeout(300); await snap('5-pick');
await press('x'); await press('x'); await press('ArrowDown', 1); await press('z'); await page.waitForTimeout(300); await snap('6-items');
await press('x');
await press('ArrowDown', 3); await press('z');
await page.waitForTimeout(12000); await snap('7-game');
for (let i = 0; i < 12; i++) { await press('z'); await page.waitForTimeout(700); }
await snap('8-game');
await press('Escape'); await page.waitForTimeout(400); await snap('9-pause');
await browser.close();
