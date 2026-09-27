// Compact, URL-safe setup codes: boss, mode, variant, attack/phase, sandbox, gear, items, stats.
import type { FightDef, Loadout, ModeId } from '../fights.ts';

interface ShareSource {
  fight: FightDef;
  mode: ModeId;
  variant: string;
  attack: number;
  phase: number;
  sandbox: boolean;
  loadout: Loadout;
  stats: Record<number, { hp?: number; at?: number; df?: number; mag?: number }>;
}

export interface Shared {
  boss: string;
  mode: ModeId;
  variant: string;
  attack: number;
  phase: number;
  sandbox: boolean;
  loadout: Loadout;
  stats?: ShareSource['stats'];
}

const b64 = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s: string) => atob(s.replace(/-/g, '+').replace(/_/g, '/'));

export function encodeShare(s: ShareSource): string {
  const payload = {
    b: s.fight.id, m: s.mode, v: s.variant, a: s.attack, p: s.phase, x: s.sandbox ? 1 : 0,
    w: s.loadout.weapons, r: s.loadout.armors, i: s.loadout.items.filter((n) => n > 0),
    ...(s.sandbox && Object.keys(s.stats).length ? { s: s.stats } : {}),
  };
  return b64(JSON.stringify(payload));
}

export function decodeShare(code: string): Shared | null {
  try {
    const p = JSON.parse(unb64(code));
    if (typeof p.b !== 'string') return null;
    const items: number[] = Array.isArray(p.i) ? p.i.map(Number).slice(0, 12) : [];
    while (items.length < 12) items.push(0);
    return {
      boss: p.b, mode: p.m ?? 'normal', variant: p.v ?? '', attack: Number(p.a ?? -1), phase: Number(p.p ?? 0),
      sandbox: !!p.x, loadout: { weapons: p.w ?? {}, armors: p.r ?? {}, items }, stats: p.s,
    };
  } catch {
    return null;
  }
}
