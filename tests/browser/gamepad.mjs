// Drives the whole site with a simulated standard gamepad: menus, starting a fight, pausing with Start.
import { chromium } from 'playwright';
const out = process.argv[2];
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: 960, height: 720 } });
await p.addInitScript(() => {
  const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false }));
  window.__pad = { id: 'Test Pad (STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons, timestamp: 0 };
  navigator.getGamepads = () => [window.__pad, null, null, null];
});
p.on('pageerror', (e) => console.log('pageerror', e.message));
const btn = async (i, ms = 120) => {
  await p.evaluate((i) => { window.__pad.buttons[i].pressed = true; window.__pad.buttons[i].value = 1; }, i);
  await p.waitForTimeout(ms);
  await p.evaluate((i) => { window.__pad.buttons[i].pressed = false; window.__pad.buttons[i].value = 0; }, i);
  await p.waitForTimeout(150);
};
await p.goto('http://localhost:5317/');
await p.waitForTimeout(1500);
await btn(0); await p.waitForTimeout(300);              // A: FIGHT
await btn(15); await btn(0); await p.waitForTimeout(500); // D-pad right -> King, A
await p.screenshot({ path: `${out}/gp-1-setup.png` });
await btn(12); await btn(0);                              // up -> START, A
for (let i = 0; i < 60; i++) {                            // wait for the fight, pressing A through dialogue
  await p.waitForTimeout(700);
  const hud = await p.evaluate(() => document.getElementById('hud').textContent);
  if (hud && i > 25) break;
  await btn(0, 80);
}
await p.screenshot({ path: `${out}/gp-2-fight.png` });
await btn(9); await p.waitForTimeout(400);                // Start: pause
await p.screenshot({ path: `${out}/gp-3-pause.png` });
await btn(9); await p.waitForTimeout(300);                // Start again: resume
const paused = await p.evaluate(() => document.getElementById('ui').style.background);
console.log('after resume ui bg:', paused || '(transparent)');
await b.close();
