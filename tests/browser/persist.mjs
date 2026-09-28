// Changes Jevil's mode, reloads the page, and checks the setup came back.
import { chromium } from 'playwright';
const out = process.argv[2];
const b = await chromium.launch();
const c = await b.newContext({ ignoreHTTPSErrors: true, viewport: { width: 960, height: 720 } });
const p = await c.newPage();
const press = async (k, n = 1) => { for (let i = 0; i < n; i++) { await p.keyboard.press(k); await p.waitForTimeout(90); } };
await p.goto('https://localhost:5318/'); await p.waitForTimeout(1500);
await press('z'); await p.waitForTimeout(300); await p.screenshot({ path: `${out}/ps-0.png` });
await press('ArrowRight', 3); await press('z'); await p.waitForTimeout(500);   // Queen
await press('ArrowRight', 2); await p.waitForTimeout(200);                     // MODE -> PRACTICE
await press('x'); await press('x');
await p.reload(); await p.waitForTimeout(1500);
await press('z'); await p.waitForTimeout(300); await p.screenshot({ path: `${out}/ps-1.png` });
await press('z'); await p.waitForTimeout(500); await p.screenshot({ path: `${out}/ps-2.png` });
await b.close();
