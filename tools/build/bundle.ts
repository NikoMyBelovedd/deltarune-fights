// Assembles public/game/chN/ from the patched data.win and the local DELTARUNE install.
// Usage: node tools/build/bundle.ts [chapters...]
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { homedir } from 'node:os';
import { basename, dirname, join, relative } from 'node:path';
import { FIGHTS } from '../../src/fights.ts';

const ROOT = join(dirname(new URL(import.meta.url).pathname), '../..');
const GAME = process.env.DELTARUNE_DIR ?? join(homedir(), '.var/app/com.valvesoftware.Steam/.local/share/Steam/steamapps/common/DELTARUNE');

function hashFile(p: string): string {
  return createHash('sha1').update(readFileSync(p)).digest('hex').slice(0, 16);
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

const chapters = process.argv.slice(2).map(Number);
for (const ch of chapters.length ? chapters : [...new Set(FIGHTS.filter((f) => f.available).map((f) => f.chapter))]) {
  const src = join(GAME, `chapter${ch}_windows`);
  // Stage everything outside public/, then publish small files as-is and big ones packed.
  const out = join(ROOT, '.gamedata/stage', `ch${ch}`);
  const pub = join(ROOT, 'public/game', `ch${ch}`);
  mkdirSync(out, { recursive: true });
  mkdirSync(pub, { recursive: true });
  const written = new Set<string>();
  const patched = join(ROOT, '.gamedata/build', `ch${ch}`, 'data.win');
  if (!existsSync(patched)) throw new Error(`missing ${patched}; run tools/patch/build.sh ${ch}`);

  const copy = (from: string, to: string) => {
    mkdirSync(dirname(to), { recursive: true });
    if (!existsSync(to) || statSync(to).size !== statSync(from).size || statSync(to).mtimeMs < statSync(from).mtimeMs) copyFileSync(from, to);
  };

  copy(patched, join(out, 'data.win'));
  for (const f of readdirSync(src)) {
    if (/^audiogroup\d+\.dat$/.test(f) || f.endsWith('.ogg')) copy(join(src, f), join(out, f));
  }
  copy(join(src, 'lang/lang_en.json'), join(out, 'lang/lang_en.json'));
  const music = new Set(FIGHTS.filter((f) => f.chapter === ch).flatMap((f) => f.music));
  for (const m of music) {
    const p = join(GAME, 'mus', m);
    if (existsSync(p)) copy(p, join(out, 'mus', m));
    else console.warn(`ch${ch}: music not found: ${m}`);
  }

  // Cloudflare Pages rejects files over 25 MiB, so big files are gzipped and split into parts under /packed.
  const PART = 20 * 1024 * 1024;
  const packed = join(ROOT, 'public/game', `ch${ch}-packed`);
  mkdirSync(packed, { recursive: true });
  const files = walk(out)
    .filter((p) => basename(p) !== 'files.json')
    .map((p) => {
      const rel = relative(out, p);
      const size = statSync(p).size;
      const hash = hashFile(p);
      const entry: { path: string; size: number; hash: string; gzip?: boolean; parts?: { url: string; size: number }[] } = { path: rel, size, hash };
      if (size > 4 * 1024 * 1024 && !rel.endsWith('.ogg')) {
        const gz = gzipSync(readFileSync(p), { level: 9 });
        if (gz.length < size * 0.9 || size > PART) {
          const body = gz.length < size * 0.9 ? gz : readFileSync(p);
          entry.gzip = body === gz;
          entry.parts = [];
          for (let i = 0, n = 0; i < body.length; i += PART, n++) {
            const name = `${rel.replace(/[\/]/g, '_')}.${hash}.${n}${entry.gzip ? '.gz' : ''}.bin`;
            writeFileSync(join(packed, name), body.subarray(i, i + PART));
            written.add(join(packed, name));
            entry.parts.push({ url: `/game/ch${ch}-packed/${name}`, size: Math.min(PART, body.length - i) });
          }
        }
      }
      if (!entry.parts) {
        mkdirSync(dirname(join(pub, rel)), { recursive: true });
        copyFileSync(p, join(pub, rel));
        written.add(join(pub, rel));
      }
      return entry;
    });
  // Prune stale files in place (deleting the folders would upset dev-server watchers).
  for (const dir of [pub, packed]) for (const f of walk(dir)) if (!written.has(f) && basename(f) !== 'files.json') unlinkSync(f);
  writeFileSync(join(pub, 'files.json'), JSON.stringify({ bundle: `ch${ch}`, dataPath: 'data.win', files }, null, 1));
  const total = files.reduce((a, f) => a + f.size, 0);
  console.log(`ch${ch}: ${files.length} files, ${(total / 1048576).toFixed(1)} MB`);
}
