import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from './parser.ts';
const dir = process.argv[2];
let ok = 0, bad = 0;
for (const f of readdirSync(dir)) {
  try { parse(readFileSync(join(dir, f), 'utf8')); ok++; }
  catch (e) { bad++; if (bad <= 15) console.log(f, (e as Error).message); }
}
console.log({ ok, bad });
