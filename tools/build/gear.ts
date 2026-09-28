// Extracts weapon / armor / item tables from a chapter's scr_weaponinfo, scr_armorinfo and scr_iteminfo.
// Output: public/data/gear-chN.json  (derived from game files, so it lives outside git)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parse, type Expr, type Stmt } from '../gml/parser.ts';

const ROOT = join(dirname(new URL(import.meta.url).pathname), '../..');

type Val = number | string | null;

function evalExpr(e: Expr, lang: Record<string, string>): Val {
  switch (e.t) {
    case 'num': return e.v;
    case 'str': return e.v;
    case 'unary': {
      const v = evalExpr(e.arg, lang);
      return e.op === '-' && typeof v === 'number' ? -v : null;
    }
    case 'bin': {
      const l = evalExpr(e.l, lang); const r = evalExpr(e.r, lang);
      if (typeof l === 'number' && typeof r === 'number') {
        if (e.op === '+') return l + r;
        if (e.op === '*') return l * r;
        if (e.op === '-') return l - r;
      }
      if (e.op === '+' && typeof l === 'string' && typeof r === 'string') return l + r;
      return null;
    }
    case 'call': {
      if (e.callee.t !== 'id') return null;
      const fn = e.callee.name;
      const args = e.args.map((a) => evalExpr(a, lang));
      if (fn === 'scr_84_get_lang_string') return lang[String(args[0])] ?? null;
      if (fn === 'stringsetloc' || fn === 'stringset') return typeof args[0] === 'string' ? args[0] : null;
      if (fn === 'stringsetsubloc') return typeof args[0] === 'string' ? args[0] : null;
      return null;
    }
  }
  return null;
}

/** Collect assignments in a case body; the first assignment wins (later ones are usually conditional overrides). */
function collect(body: Stmt[], lang: Record<string, string>, out: Record<string, Val>, conditional = false): void {
  for (const s of body) {
    if (s.t === 'assign' && s.op === '=' && s.target.t === 'id') {
      const v = evalExpr(s.value, lang);
      if (!(s.target.name in out) || !conditional) {
        if (!(s.target.name in out)) out[s.target.name] = v;
      }
    } else if (s.t === 'if') {
      collect(s.then, lang, out, true);
      if (s.else) collect(s.else, lang, out, true);
    } else if (s.t === 'block') collect(s.body, lang, out, conditional);
  }
}

function cases(file: string, lang: Record<string, string>): Map<number, Record<string, Val>> {
  const prog = parse(readFileSync(file, 'utf8'));
  const res = new Map<number, Record<string, Val>>();
  const visit = (stmts: Stmt[]) => {
    for (const s of stmts) {
      if (s.t === 'func') visit(s.fn.body);
      else if (s.t === 'switch') {
        let pending: number[] = [];
        for (const c of s.cases) {
          if (c.test && c.test.t === 'num') pending.push(c.test.v);
          if (c.body.length) {
            const vals: Record<string, Val> = {};
            collect(c.body, lang, vals);
            for (const id of pending) res.set(id, vals);
            pending = [];
          }
        }
      }
    }
  };
  visit(prog);
  return res;
}

const clean = (s: Val) => (typeof s === 'string' ? s.replace(/#/g, ' ').replace(/\s+/g, ' ').trim() : '');

for (const ch of process.argv.slice(2).map(Number)) {
  const dir = join(ROOT, '.gamedata', `ch${ch}`);
  const langFile = join(dir, 'lang/lang_en.json');
  const lang: Record<string, string> = existsSync(langFile) ? JSON.parse(readFileSync(langFile, 'utf8')) : {};
  const code = join(dir, 'CodeEntries');
  const weapons = [...cases(join(code, 'gml_GlobalScript_scr_weaponinfo.gml'), lang)]
    .filter(([id]) => id > 0)
    .map(([id, v]) => ({
      id, name: clean(v.weaponnametemp), desc: clean(v.weapondesctemp),
      at: v.weaponattemp ?? 0, df: v.weapondftemp ?? 0, mag: v.weaponmagtemp ?? 0,
      ability: clean(v.weaponabilitytemp),
      who: [1, 2, 3, 4].filter((c) => v[`weaponchar${c}temp`] === 1),
    }));
  const armors = [...cases(join(code, 'gml_GlobalScript_scr_armorinfo.gml'), lang)]
    .filter(([id]) => id > 0)
    .map(([id, v]) => ({
      id, name: clean(v.armornametemp), desc: clean(v.armordesctemp),
      at: v.armorattemp ?? 0, df: v.armordftemp ?? 0, mag: v.armormagtemp ?? 0,
      ability: clean(v.armorabilitytemp),
      who: [1, 2, 3, 4].filter((c) => v[`armorchar${c}temp`] === 1),
    }));
  const items = [...cases(join(code, 'gml_GlobalScript_scr_iteminfo.gml'), lang)]
    .filter(([id]) => id > 0)
    .map(([id, v]) => ({ id, name: clean(v.itemnameb), desc: clean(v.itemdescb), usable: v.usable === 1, target: v.itemtarget ?? 0 }));
  // Some names are built at runtime (e.g. scr_text lookups); borrow them from an earlier chapter's table.
  for (let prev = ch - 1; prev >= 1; prev--) {
    const f = join(ROOT, 'public/data', `gear-ch${prev}.json`);
    if (!existsSync(f)) continue;
    const old = JSON.parse(readFileSync(f, 'utf8')) as Record<'weapons' | 'armors' | 'items', { id: number; name: string; desc: string }[]>;
    for (const [list, oldList] of [[weapons, old.weapons], [armors, old.armors], [items, old.items]] as const) {
      for (const e of list) {
        if (e.name) continue;
        const o = oldList.find((x) => x.id === e.id && x.name);
        if (o) { e.name = o.name; e.desc ||= o.desc; }
      }
    }
  }
  mkdirSync(join(ROOT, 'public/data'), { recursive: true });
  writeFileSync(join(ROOT, 'public/data', `gear-ch${ch}.json`), JSON.stringify({ chapter: ch, weapons, armors, items }, null, 1));
  console.log(`ch${ch}: ${weapons.length} weapons, ${armors.length} armors, ${items.length} items`);
}
