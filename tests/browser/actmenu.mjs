// Plays a fight until the battle starts, then opens Kris's ACT menu and screenshots it.
import { chromium } from 'playwright';
const [query, out] = process.argv.slice(2);
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 700, height: 560 } });
await p.goto(`http://localhost:5317/dev.html?auto&${query}`);
const tap = async (k) => { await p.keyboard.down(k); await p.waitForTimeout(70); await p.keyboard.up(k); await p.waitForTimeout(120); };
for (let i = 0; i < 400; i++) {
  if (await p.evaluate(() => window.__events.some((e) => e.type === 'event' && e.name === 'battle'))) break;
  await tap('z');
}
await p.waitForTimeout(3500);
await p.screenshot({ path: `${out}-0.png` });
const who = process.argv[4] ?? 'kris';
if (who === 'kris') {
  await tap('ArrowRight'); await tap('z'); await p.waitForTimeout(300);
  await p.screenshot({ path: `${out}-1.png` });
  await tap('z'); await p.waitForTimeout(300);
} else {
  // Kris defends, then open the partner's MAGIC menu (Susie first, Ralsei after Susie defends).
  await tap('ArrowLeft'); await tap('z'); await p.waitForTimeout(300);
  if (who === 'ralsei') { await tap('ArrowLeft'); await tap('z'); await p.waitForTimeout(300); }
  await tap('ArrowRight'); await tap('z'); await p.waitForTimeout(300);
}
await p.screenshot({ path: `${out}-2.png` });
await b.close();
