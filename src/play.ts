// Starting a fight: resolves the file list for a fight, writes its config and hands it to the GameHost.
import type { BundleManifest, GameHost } from './engine/host.ts';
import type { FightDef } from './fights.ts';

export interface Dials { speed: number; damage: number; iframes: number }
export const DEFAULT_DIALS: Dials = { speed: 100, damage: 100, iframes: 100 };
export const dialsModified = (d: Dials) => d.speed !== 100 || d.damage !== 100 || d.iframes !== 100;

export interface FightConfig {
  fight: FightDef;
  variant: string;
  mode: 'normal' | 'hitless' | 'practice' | 'single' | 'endless';
  intro: boolean;
  attack: number;
  phase: number;
  seed: number;
  weapons: Record<number, number>;
  armors: Record<number, [number, number]>;
  items: number[];
  stats?: Record<number, { hp?: number; at?: number; df?: number; mag?: number }>;
  dials: Dials;
}

export function configToIni(c: FightConfig): string {
  const lines = ['[fight]', `boss=${c.fight.id}`, `variant=${c.variant}`, `mode=${c.mode}`, `intro=${c.intro ? 1 : 0}`,
    `attack=${c.attack}`, `phase=${c.phase}`, `seed=${c.seed}`, '[dials]', `speed=${c.dials.speed}`, `damage=${c.dials.damage}`, `iframes=${c.dials.iframes}`, '[party]'];
  for (const [ch, w] of Object.entries(c.weapons)) lines.push(`weapon${ch}=${w}`);
  for (const [ch, [a, b]] of Object.entries(c.armors)) lines.push(`armor${ch}a=${a}`, `armor${ch}b=${b}`);
  // An empty list means "keep the game's own inventory".
  if (c.items.length) {
    lines.push('[items]');
    for (let i = 0; i < 12; i++) lines.push(`item${i}=${c.items[i] ?? 0}`);
  }
  if (c.stats) {
    lines.push('[stats]');
    for (const [ch, s] of Object.entries(c.stats)) {
      for (const k of ['hp', 'at', 'df', 'mag'] as const) if (s[k] !== undefined) lines.push(`${k}${ch}=${s[k]}`);
    }
  }
  return lines.join('\n') + '\n';
}

const manifests = new Map<number, Promise<BundleManifest>>();

async function chapterManifest(ch: number): Promise<BundleManifest> {
  let p = manifests.get(ch);
  if (!p) {
    p = fetch(`/game/ch${ch}/files.json`, { cache: 'no-cache' }).then((r) => {
      if (!r.ok) throw new Error(`Chapter ${ch} files are not available on this server.`);
      return r.json();
    });
    manifests.set(ch, p);
  }
  const m = await p;
  return m;
}

/** Only the files this fight needs: everything except music, plus its own tracks. */
export async function fightManifest(fight: FightDef): Promise<BundleManifest> {
  const m = await chapterManifest(fight.chapter);
  const music = new Set(fight.music.map((f) => `mus/${f}`));
  const files = m.files
    .filter((f) => !f.path.startsWith('mus/') || music.has(f.path))
    .map((f) => ({ ...f, url: `/game/ch${fight.chapter}/${f.path}` }));
  // (parts, when present, replace url: big files ship gzipped and split under the size limit)
  return { bundle: m.bundle, dataPath: m.dataPath, files };
}

export async function startFight(host: GameHost, mount: HTMLElement, cfg: FightConfig, playback?: Int32Array): Promise<void> {
  const manifest = await fightManifest(cfg.fight);
  await host.start(mount, manifest, configToIni(cfg), playback);
}

// ---------------- replays ----------------
export interface Replay {
  v: 1;
  boss: string;
  ini: string;
  /** data.win content hash the replay was recorded against */
  data: string;
  events: string; // base64 of Int32Array [frame, vk, down]*
  result?: { time: number; hits: number; how: string };
  date: string;
}

export function packEvents(ev: Int32Array): string {
  const bytes = new Uint8Array(ev.buffer, ev.byteOffset, ev.byteLength);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function unpackEvents(b64: string): Int32Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Int32Array(bytes.buffer);
}

export async function dataHash(fight: FightDef): Promise<string> {
  const m = await chapterManifest(fight.chapter);
  return m.files.find((f) => f.path === m.dataPath)?.hash ?? '';
}

export async function startReplay(host: GameHost, mount: HTMLElement, fight: FightDef, r: Replay): Promise<void> {
  const manifest = await fightManifest(fight);
  await host.start(mount, manifest, r.ini, unpackEvents(r.events));
}
