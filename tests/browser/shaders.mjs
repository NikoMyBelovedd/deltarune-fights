// Starts a fight and reports shader compilation results from the runner log.
import { chromium } from 'playwright';
const [query = 'auto&boss=tenna&intro=0', secs = '25'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.goto(`http://localhost:5317/dev.html?${query}`);
await page.waitForTimeout(Number(secs) * 1000);
const logs = await page.evaluate(() => window.__events.filter((e) => e.type === 'log').map((e) => e.text));
const failed = logs.filter((t) => /Failed to compile/.test(t));
const es3 = logs.filter((t) => /GLSL ES 3\.00/.test(t));
const total = logs.filter((t) => /GL: Compiling .* vertex shader/.test(t)).length;
console.log(`compile attempts: ${total}, failed: ${failed.length}, recovered as ES3: ${es3.length}`);
for (const f of failed) console.log('  ', f);
for (const e of es3) console.log('  ', e);
await browser.close();
