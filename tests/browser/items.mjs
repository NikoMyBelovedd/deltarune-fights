// Opens Pink's setup -> ITEMS -> picker and screenshots, scrolling down.
import { chromium } from 'playwright';
const out = process.argv[2];
const b = await chromium.launch();
const c = await b.newContext({ ignoreHTTPSErrors: true, viewport: { width: 960, height: 720 } });
const p = await c.newPage();
p.on('pageerror', (e) => console.log('pageerror', e.message));
const press = async (k, n = 1) => { for (let i = 0; i < n; i++) { await p.keyboard.press(k); await p.waitForTimeout(90); } };
await p.goto('https://localhost:5318/');
await p.waitForTimeout(1500);
await press('z'); await p.waitForTimeout(300);          // FIGHT
await press('ArrowLeft'); await press('z'); await p.waitForTimeout(600); // PINK (last card) -> setup
await p.screenshot({ path: `${out}/it-1.png` });
// rows: MODE, VARIANT, BEGIN AT, INTRO, EQUIPMENT, ITEMS...
await press('ArrowDown', 5); await press('z'); await p.waitForTimeout(400);
await p.screenshot({ path: `${out}/it-2.png` });
await press('z'); await p.waitForTimeout(400);
await p.screenshot({ path: `${out}/it-3.png` });
await press('ArrowDown', 30); await p.waitForTimeout(200);
await p.screenshot({ path: `${out}/it-4.png` });
await b.close();
