// Emulated phone: portrait + landscape screenshots, menu navigation with the on-screen buttons, start a fight.
import { chromium, devices } from 'playwright';
const out = process.argv[2];
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const device = process.env.DEVICE ?? 'Pixel 7';
const base = devices[device].viewport;
for (const [name, viewport] of [['portrait', { width: Math.min(base.width, base.height), height: Math.max(base.width, base.height) }], ['landscape', { width: Math.max(base.width, base.height), height: Math.min(base.width, base.height) }]]) {
  const ctx = await b.newContext({ ...devices[device], viewport });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('pageerror', e.message));
  await p.goto('http://localhost:5317/');
  await p.waitForTimeout(1500);
  const tap = async (sel) => { const r = await p.locator(sel).boundingBox(); await p.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2); await p.waitForTimeout(250); };
  await p.screenshot({ path: `${out}/m-${process.env.TAG ?? ''}${name}-1.png` });
  await tap('.t-z'); await p.waitForTimeout(300);            // FIGHT -> select
  await p.screenshot({ path: `${out}/m-${process.env.TAG ?? ''}${name}-2.png` });
  if (name === (process.env.PLAY ?? 'portrait')) {
    await tap('.t-z'); await p.waitForTimeout(500);          // Jevil -> setup
    // D-pad up = wrap to START
    const r = await p.locator('.t-pad').boundingBox();
    await p.touchscreen.tap(r.x + r.width / 2, r.y + r.height * 0.1); await p.waitForTimeout(300);
    await tap('.t-z');
    await p.waitForTimeout(20000);
    await p.screenshot({ path: `${out}/m-${process.env.TAG ?? ''}${name}-3.png` });
  }
  await ctx.close();
}
await b.close();
