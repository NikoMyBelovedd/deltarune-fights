// The site shell: DELTARUNE-style menus drawn on a 640x480 canvas, and the running fight underneath.
import { GameHost, type HostEvent } from '../engine/host.ts';
import { ACTION_VK, ACTIONS, DEFAULT_BINDINGS, InputRouter, VK, type Action } from '../engine/input.ts';
import { CHAR_HEADS, CHAR_NAMES, defaultLoadout, DEFAULTS_VERSION, FIGHTS, isLegal, MODE_NAMES, partyOf, type FightDef, type Loadout, type ModeId } from '../fights.ts';
import { configToIni, dataHash, DEFAULT_DIALS, dialsModified, packEvents, startFight, startReplay, type Dials, type FightConfig, type Replay } from '../play.ts';
import { store } from '../store.ts';
import { C, Gfx } from './gfx.ts';
import { decodeShare, encodeShare } from './share.ts';

interface GearEntry { id: number; name: string; desc: string; at: number; df: number; mag: number; ability?: string; who?: number[]; usable?: boolean }
interface GearTable { weapons: GearEntry[]; armors: GearEntry[]; items: GearEntry[] }

type MenuKey = Action | 'escape';

interface Setup {
  fight: FightDef;
  mode: ModeId;
  variant: string;
  attack: number;
  phase: number;
  intro: boolean;
  sandbox: boolean;
  loadout: Loadout;
  stats: Record<number, { hp?: number; at?: number; df?: number; mag?: number }>;
  dials: Dials;
}

interface Screen {
  draw(g: Gfx): void;
  key(k: MenuKey): void;
  /** true when the game canvas should show beneath this screen */
  overlay?: boolean;
}

export const SOURCE_URL = 'https://github.com/NikoMyBelovedd/deltarune-fights';

const fmtTime = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return `${m}:${sec.toFixed(2).padStart(5, '0')}`;
};

export class App {
  g: Gfx;
  host = new GameHost();
  input: InputRouter;
  private stack: Screen[] = [];
  private gear = new Map<number, Promise<GearTable>>();
  gearCache = new Map<number, GearTable>();
  private repeatKey: MenuKey | null = null;
  private repeatAt = 0;
  private playing = false;
  private hud: HTMLElement;
  private stage: HTMLElement;
  private gameMount: HTMLElement;
  audio: AudioContext;
  run: {
    setup: Setup; started: number; pausedAt: number; pausedTotal: number; battleAt: number;
    hits: number; attempts: number; restarts: number; endless: number; done: boolean;
    clean: number; hitsAtAttack: number; attacksSeen: number;
    ini: string; replay: Replay | null;
  } | null = null;
  lastReplay: Replay | null = null;
  loading: { loaded: number; total: number; error?: string } | null = null;

  constructor(root: HTMLElement) {
    this.stage = root.querySelector('#stage')!;
    this.gameMount = root.querySelector('#game')!;
    this.hud = root.querySelector('#hud')!;
    const canvas = root.querySelector<HTMLCanvasElement>('#ui')!;
    this.g = new Gfx(canvas);
    this.audio = new AudioContext();
    this.input = new InputRouter(store.settings.bindings);
    this.host.on((e) => this.onHost(e));
    window.addEventListener('resize', () => this.fit());
    this.fit();
  }

  async boot(): Promise<void> {
    await this.g.load();
    this.g.attachAudio(this.audio);
    this.g.sfxVolume = store.settings.sfxVolume;
    this.host.setVolume(store.settings.volume);
    this.input.attach((vk, down) => this.onKey(vk, down));
    // Escape is always ours (pause), never the game's.
    window.addEventListener('keydown', (e) => { if (e.code === 'Escape') { e.preventDefault(); this.menuKey('escape'); } }, true);
    const shared = new URLSearchParams(location.search).get('s');
    this.push(new TitleScreen(this));
    if (shared) {
      const s = decodeShare(shared);
      if (s) {
        const fight = FIGHTS.find((f) => f.id === s.boss);
        if (fight?.available) this.push(new SetupScreen(this, fight, s));
      }
    }
    const tick = () => {
      this.g.time++;
      this.repeat();
      this.draw();
      this.updateHud();
    };
    setInterval(tick, 1000 / 30);
  }

  fit(): void {
    const vw = window.innerWidth, vh = window.innerHeight;
    let w = Math.min(vw, (vh * 4) / 3);
    if (store.settings.scale === 'integer' && w >= 640) w = Math.floor(w / 640) * 640;
    this.stage.style.width = `${Math.floor(w)}px`;
    this.stage.style.height = `${Math.floor((w * 3) / 4)}px`;
  }

  // ---------------- gear data ----------------
  gearFor(ch: number): Promise<GearTable> {
    let p = this.gear.get(ch);
    if (!p) {
      p = fetch(`/data/gear-ch${ch}.json`).then((r) => r.json()).then((t: GearTable) => { this.gearCache.set(ch, t); return t; });
      this.gear.set(ch, p);
    }
    return p;
  }

  // ---------------- screens ----------------
  push(s: Screen): void { this.stack.push(s); }
  pop(): void { if (this.stack.length > 1) this.stack.pop(); }
  replace(s: Screen): void { this.stack[this.stack.length - 1] = s; }
  get top(): Screen { return this.stack[this.stack.length - 1]; }
  popTo(pred: (s: Screen) => boolean): void {
    while (this.stack.length > 1 && !pred(this.top)) this.stack.pop();
  }

  private draw(): void {
    const g = this.g;
    const top = this.top;
    g.ctx.clearRect(0, 0, 640, 480);
    if (this.playing && !(top instanceof LoadingScreen)) {
      // The fight shows through; only the pause menu draws on top of it.
      if (top instanceof PauseScreen) top.draw(g);
      return;
    }
    g.clear();
    top.draw(g);
  }

  private updateHud(): void {
    const r = this.run;
    if (!r || !this.playing || !store.settings.showHud) { this.hud.textContent = ''; return; }
    const t = this.elapsed();
    const parts = [r.replay ? `REPLAY · ${MODE_NAMES[r.setup.mode]}` : MODE_NAMES[r.setup.mode], `TIME ${fmtTime(t)}`, `HITS ${r.hits}`];
    if (r.setup.mode === 'hitless' || r.setup.mode === 'normal') parts.push(`TRY ${r.attempts + 1}`);
    if (r.setup.mode === 'endless') parts.push(`SURVIVED ${r.endless}`, `BEST ${store.record(this.recordKey(r.setup)).endlessBest}`);
    if (r.setup.mode === 'single') parts.push(`CLEAN ${r.clean} / ${Math.max(0, r.attacksSeen - 1)}`);
    this.hud.textContent = parts.join('\n');
  }

  elapsed(): number {
    const r = this.run;
    if (!r || !r.battleAt) return 0;
    const now = r.pausedAt || performance.now();
    return Math.max(0, (now - r.battleAt - r.pausedTotal) / 1000);
  }

  // ---------------- input ----------------
  /** While a fight runs (and no pause/loading screen is up) every key goes to the game. */
  private get routingToGame(): boolean {
    return this.playing && !(this.top instanceof LoadingScreen) && !(this.top instanceof PauseScreen);
  }

  private onKey(vk: number, down: boolean): void {
    if (this.routingToGame) {
      if (!this.run?.replay) this.host.key(vk, down);
      return;
    }
    const action = (Object.keys(ACTION_VK) as Action[]).find((a) => ACTION_VK[a] === vk);
    if (!action) return;
    if (down) {
      this.menuKey(action);
      this.repeatKey = ['up', 'down', 'left', 'right'].includes(action) ? action : null;
      this.repeatAt = performance.now() + 300;
    } else if (this.repeatKey === action) this.repeatKey = null;
  }

  private repeat(): void {
    if (!this.repeatKey || this.routingToGame) return;
    const now = performance.now();
    if (now >= this.repeatAt) {
      this.menuKey(this.repeatKey);
      this.repeatAt = now + 70;
    }
  }

  menuKey(k: MenuKey): void {
    void this.audio.resume();
    this.host.resumeAudio();
    if (k === 'escape') {
      if (this.routingToGame) { this.pauseGame(); return; }
      if (this.top instanceof PauseScreen) { (this.top as PauseScreen).resume(); return; }
      k = 'cancel';
    }
    this.top.key(k);
  }

  // ---------------- running fights ----------------
  async launch(setup: Setup): Promise<void> {
    store.saveLoadout(setup.fight.id, { loadout: setup.loadout, mode: setup.mode, variant: setup.variant, attack: setup.attack, phase: setup.phase, intro: setup.intro, sandbox: setup.sandbox, stats: setup.stats, dials: setup.dials, dv: DEFAULTS_VERSION });
    const introKey = `${setup.fight.id}:${setup.variant}`;
    const playIntro = setup.intro && (setup.mode === 'normal' || setup.mode === 'practice');
    const cfg: FightConfig = {
      fight: setup.fight,
      variant: setup.variant,
      mode: setup.mode,
      intro: playIntro,
      attack: setup.mode === 'single' ? setup.attack : -1,
      phase: setup.phase,
      seed: 1 + Math.floor(Math.random() * 2147483000),
      weapons: setup.loadout.weapons,
      armors: setup.loadout.armors,
      items: setup.loadout.items,
      stats: setup.sandbox ? setup.stats : undefined,
      dials: setup.dials,
    };
    store.settings.seenIntro[introKey] = true;
    store.saveSettings();
    const ini = configToIni(cfg);
    this.run = { setup, started: performance.now(), pausedAt: 0, pausedTotal: 0, battleAt: 0, hits: 0, attempts: 0, restarts: 0, endless: 0, done: false, clean: 0, hitsAtAttack: 0, attacksSeen: 0, ini, replay: null };
    this.loading = { loaded: 0, total: 0 };
    this.playing = true;
    this.push(new LoadingScreen(this));
    store.updateRecord(this.recordKey(setup), (r) => { r.attempts++; });
    try {
      await startFight(this.host, this.gameMount, cfg);
    } catch (e) {
      this.loading = { loaded: 0, total: 0, error: String((e as Error).message ?? e) };
    }
  }

  /** Plays a recorded run back. Nothing is saved to records. */
  async watch(r: Replay): Promise<void> {
    const fight = FIGHTS.find((f) => f.id === r.boss);
    if (!fight) return;
    const setup = setupFromIni(fight, r.ini);
    this.run = { setup, started: performance.now(), pausedAt: 0, pausedTotal: 0, battleAt: 0, hits: 0, attempts: 0, restarts: 0, endless: 0, done: false, clean: 0, hitsAtAttack: 0, attacksSeen: 0, ini: r.ini, replay: r };
    this.loading = { loaded: 0, total: 0 };
    this.playing = true;
    this.push(new LoadingScreen(this));
    try {
      if (r.data && r.data !== (await dataHash(fight))) console.warn('replay was recorded against a different game build; it may desync');
      await startReplay(this.host, this.gameMount, fight, r);
    } catch (e) {
      this.loading = { loaded: 0, total: 0, error: String((e as Error).message ?? e) };
    }
  }

  recordKey(s: Setup): string {
    return `${s.fight.id}|${s.variant}|${s.mode}${dialsModified(s.dials) ? '|mod' : ''}`;
  }

  private onHost(e: HostEvent): void {
    const r = this.run;
    switch (e.type) {
      case 'progress':
        if (this.loading) { this.loading.loaded = e.loaded; this.loading.total = e.total; }
        break;
      case 'started':
        break;
      case 'error':
        if (this.loading) this.loading.error = e.message;
        else console.error(e.message);
        break;
      case 'log':
        if (e.level === 'error') console.warn('[game]', e.text);
        break;
      case 'event':
        if (!r) break;
        if (e.name === 'start') {
          if (this.top instanceof LoadingScreen) this.pop();
          this.loading = null;
        } else if (e.name === 'battle') {
          r.battleAt = performance.now();
          r.pausedTotal = 0;
        } else if (e.name === 'hit') {
          r.hits++;
        } else if (e.name === 'restart') {
          if (r.setup.mode === 'endless' && !r.replay) this.saveEndless();
          r.attempts++;
          r.restarts++;
          if (r.setup.mode === 'hitless' || r.setup.mode === 'endless') r.hits = 0;
          r.endless = 0;
          r.attacksSeen = 0;
          r.battleAt = 0;
        } else if (e.name === 'attack') {
          // An attack counts as clean when no hit landed since the previous one started.
          if (r.attacksSeen > 0 && r.hits === r.hitsAtAttack) r.clean++;
          r.attacksSeen++;
          r.hitsAtAttack = r.hits;
          if (r.attacksSeen > 1) r.endless = r.attacksSeen - 1;
        } else if (e.name === 'win') {
          this.finish(e.data);
        }
        break;
    }
  }

  /** Endless: attacks fully survived before the party fell. */
  private saveEndless(): void {
    const r = this.run;
    if (!r) return;
    const n = r.endless;
    store.updateRecord(this.recordKey(r.setup), (x) => { if (n > x.endlessBest) x.endlessBest = n; });
  }

  private finish(how: string): void {
    const r = this.run;
    if (!r || r.done) return;
    r.done = true;
    const time = this.elapsed();
    if (r.replay) {
      this.host.stop();
      this.playing = false;
      this.popTo((s) => s instanceof TitleScreen || s instanceof SetupScreen);
      this.push(new ResultScreen(this, r.setup, { how, time, hits: r.hits, attempts: r.attempts + 1, newBest: false, replay: true }));
      return;
    }
    // Grab the input log before the runner goes away.
    const ini = r.ini;
    void Promise.all([this.host.replay(), dataHash(r.setup.fight)]).then(([rep, data]) => {
      this.lastReplay = { v: 1, boss: r.setup.fight.id, ini, data, events: packEvents(rep.events), result: { time, hits: r.hits, how }, date: new Date().toISOString() };
      this.host.stop();
    });
    const rec = store.updateRecord(this.recordKey(r.setup), (x) => {
      x.clears++;
      if (x.bestTime === null || time < x.bestTime) x.bestTime = time;
      if (x.bestHits === null || r.hits < x.bestHits) x.bestHits = r.hits;
      if (r.hits === 0) x.hitless = true;
    });
    this.playing = false;
    this.popTo((s) => s instanceof SetupScreen);
    this.push(new ResultScreen(this, r.setup, { how, time, hits: r.hits, attempts: r.attempts + 1, newBest: rec.bestTime === time }));
  }

  pauseGame(): void {
    const r = this.run;
    if (r) r.pausedAt = performance.now();
    this.input.releaseAll(); // key-ups reach the game before it freezes
    this.host.pause(true);
    this.push(new PauseScreen(this));
  }

  resumeGame(): void {
    const r = this.run;
    if (r && r.pausedAt) { r.pausedTotal += performance.now() - r.pausedAt; r.pausedAt = 0; }
    this.pop();
    this.host.pause(false);
  }

  quitGame(): void {
    if (this.run?.setup.mode === 'endless' && !this.run.replay) this.saveEndless();
    this.host.stop();
    this.playing = false;
    this.run = null;
    this.popTo((s) => s instanceof SetupScreen);
  }

  restartGame(skipIntro = false): void {
    const setup = this.run?.setup;
    this.quitGame();
    if (setup) void this.launch(skipIntro ? { ...setup, intro: false } : setup);
  }

  applySettings(): void {
    this.host.setVolume(store.settings.volume);
    this.g.sfxVolume = store.settings.sfxVolume;
    this.input.bindings = store.settings.bindings;
    store.saveSettings();
    this.fit();
  }
}

// =============================================================================================
// Replay files
// =============================================================================================

function pickReplay(done: (r: Replay) => void): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.drreplay,application/json';
  input.onchange = async () => {
    const f = input.files?.[0];
    if (!f) return;
    try {
      const r = JSON.parse(await f.text()) as Replay;
      if (r.v === 1 && r.ini && r.events && FIGHTS.some((x) => x.id === r.boss)) done(r);
    } catch { /* not a replay */ }
  };
  input.click();
}

/** Rebuilds a Setup from a replay's ini, for labels and records display. */
function setupFromIni(fight: FightDef, ini: string): Setup {
  const get = (k: string) => ini.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1] ?? '';
  const num = (k: string, d: number) => { const v = Number(get(k)); return Number.isFinite(v) && get(k) !== '' ? v : d; };
  return {
    fight, mode: (get('mode') || 'normal') as ModeId, variant: get('variant'), attack: num('attack', -1), phase: num('phase', 0),
    intro: get('intro') === '1', sandbox: false, loadout: structuredClone(fight.gear.defaults), stats: {},
    dials: { speed: num('speed', 100), damage: num('damage', 100), iframes: num('iframes', 100) },
  };
}

// =============================================================================================
// Shared widgets
// =============================================================================================

function drawOptions(g: Gfx, opts: { label: string; value?: string; dim?: boolean }[], sel: number, x: number, y: number, rowH = 36, valueX = x + 220): void {
  opts.forEach((o, i) => {
    const yy = y + i * rowH;
    const col = o.dim ? C.gray : i === sel ? C.yellow : C.white;
    g.text('fnt_mainbig', o.label, x + 30, yy, col);
    if (o.value !== undefined) g.text('fnt_mainbig', o.value, valueX, yy, o.dim ? C.gray : C.white);
    if (i === sel) g.heart(x, yy + 8);
  });
}

function drawBoss(g: Gfx, f: FightDef, cx: number, cy: number, maxW: number, maxH: number, _frame: number, dim = false): void {
  const m = g.spriteMeta(f.sprite);
  if (!m) return;
  const fit = Math.min(maxW / m.w, maxH / m.h);
  const scale = fit >= 1 ? Math.min(Math.floor(fit), 3) : fit;
  const alpha = dim ? 0.35 : 1;
  // Recorded idles carry their own frame rate; other sprites animate at the game's usual 5 fps.
  const frame = (g.time * (m.fps ?? 5)) / 30;
  // Single-frame sprites get a gentle hover so every boss feels alive.
  const bob = m.frames === 1 ? Math.round(Math.sin(g.time / 9) * 3 * scale) : 0;
  const x = cx - (m.w * scale) / 2 + m.ox * scale;
  const y = cy - (m.h * scale) / 2 + m.oy * scale + bob;
  // Recorded idles (Spamton NEO, the Knight) already contain everything; plain sprites get a white outline to read on black.
  if (!m.fps) for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) g.sprite(f.sprite, frame, x + dx * 2, y + dy * 2, scale, scale, alpha * 0.9, C.white);
  g.sprite(f.sprite, frame, x, y, scale, scale, alpha);
}

// =============================================================================================
// Screens
// =============================================================================================

class TitleScreen implements Screen {
  sel = 0;
  opts = ['FIGHT', 'WATCH A REPLAY', 'SETTINGS', 'CREDITS'];
  constructor(private app: App) {}
  draw(g: Gfx): void {
    const t = g.time;
    g.text('fnt_mainbig', 'DELTARUNE', 320, 110, C.white, 2, 1);
    g.text('fnt_mainbig', 'BOSS FIGHTS', 320, 180, C.gray, 1, 1);
    this.opts.forEach((o, i) => {
      const y = 250 + i * 44;
      g.text('fnt_mainbig', o, 320, y, i === this.sel ? C.yellow : C.white, 1, 1);
      if (i === this.sel) g.heart(320 - g.textWidth('fnt_mainbig', o) / 2 - 30, y + 8);
    });
    g.text('fnt_main', 'Z / ENTER: SELECT     X / SHIFT: BACK     ESC: PAUSE', 320, 450, C.dark, 1, 1);
    g.text('fnt_small', 'fan-made. runs the original game code from your install.', 320, 468, t % 60 < 60 ? C.dark : C.dark, 1, 1);
  }
  key(k: MenuKey): void {
    const g = this.app.g;
    if (k === 'up' || k === 'down') { this.sel = (this.sel + (k === 'up' ? -1 : 1) + this.opts.length) % this.opts.length; g.sfx('snd_menumove'); }
    if (k === 'confirm') {
      g.sfx('snd_select');
      if (this.sel === 0) this.app.push(new BossSelectScreen(this.app));
      if (this.sel === 1) pickReplay((r) => void this.app.watch(r));
      if (this.sel === 2) this.app.push(new SettingsScreen(this.app));
      if (this.sel === 3) this.app.push(new CreditsScreen(this.app));
    }
  }
}

class BossSelectScreen implements Screen {
  sel = Math.max(0, FIGHTS.findIndex((f) => f.id === store.settings.lastFight));
  constructor(private app: App) {}
  draw(g: Gfx): void {
    g.text('fnt_mainbig', 'SELECT A FIGHT', 320, 24, C.white, 1, 1);
    const cols = 5;
    FIGHTS.forEach((f, i) => {
      const cx = 64 + (i % cols) * 128;
      const cy = 130 + Math.floor(i / cols) * 150;
      const on = i === this.sel;
      if (on) g.outline(cx - 58, cy - 58, 116, 140, C.yellow, 2);
      drawBoss(g, f, cx, cy, 104, 96, g.time / 6, !f.available);
      g.text('fnt_main', f.name, cx, cy + 50, on ? C.yellow : f.available ? C.white : C.gray, 1, 1);
      g.text('fnt_main', f.available ? `CHAPTER ${f.chapter}` : 'SOON', cx, cy + 66, C.gray, 1, 1);
    });
    const f = FIGHTS[this.sel];
    g.darkbox(20, 372, 620, 470);
    if (f.available) {
      g.text('fnt_mainbig', `* ${f.name}`, 50, 392);
      const best = FIGHTS.filter((x) => x.id === f.id).map(() => store.record(`${f.id}|${f.variants?.[0]?.id ?? ''}|normal`))[0];
      const line = best.clears ? `CLEARS ${best.clears}   BEST ${best.bestTime !== null ? fmtTime(best.bestTime) : '--'}   ${best.hitless ? 'HITLESS!' : ''}` : 'NOT CLEARED YET';
      g.text('fnt_mainbig', `* ${line}`, 50, 426, C.gray);
    } else {
      g.text('fnt_mainbig', `* ${f.name} is still being ported.`, 50, 392);
      g.text('fnt_mainbig', '* Check back soon.', 50, 426, C.gray);
    }
  }
  key(k: MenuKey): void {
    const g = this.app.g;
    const n = FIGHTS.length;
    const move = (d: number) => { this.sel = (this.sel + d + n) % n; g.sfx('snd_menumove'); };
    if (k === 'left') move(-1);
    if (k === 'right') move(1);
    if (k === 'up') move(-5);
    if (k === 'down') move(5);
    if (k === 'cancel') { g.sfx('snd_menumove'); this.app.pop(); }
    if (k === 'confirm') {
      const f = FIGHTS[this.sel];
      if (!f.available) { g.sfx('snd_cantselect'); return; }
      g.sfx('snd_select');
      store.settings.lastFight = f.id;
      store.saveSettings();
      this.app.push(new SetupScreen(this.app, f));
    }
  }
}

interface SavedSetup { loadout: Loadout; mode: ModeId; variant: string; attack: number; phase: number; intro: boolean; sandbox: boolean; stats: Setup['stats']; dials?: Dials; dv?: number }

class SetupScreen implements Screen {
  sel = 0;
  setup: Setup;
  msg = '';
  msgT = 0;
  constructor(private app: App, fight: FightDef, shared?: ReturnType<typeof decodeShare>) {
    const saved = store.loadout<SavedSetup>(fight.id);
    const base: Setup = {
      fight,
      mode: fight.modes[0],
      variant: fight.variants?.[0]?.id ?? '',
      attack: fight.attacks[0]?.id ?? -1,
      phase: 0,
      intro: !store.settings.seenIntro[`${fight.id}:${fight.variants?.[0]?.id ?? ''}`],
      sandbox: false,
      loadout: defaultLoadout(fight, fight.variants?.[0]?.id ?? ''),
      stats: {},
      dials: { ...DEFAULT_DIALS },
    };
    if (saved) {
      // Saved setups from before the current default loadouts keep their choices but take the new loadout.
      const fresh = saved.dv !== DEFAULTS_VERSION;
      Object.assign(base, { ...saved, fight, dials: { ...DEFAULT_DIALS, ...saved.dials } });
      base.loadout = fresh || !saved.loadout ? defaultLoadout(fight, base.variant) : saved.loadout;
    }
    if (shared) {
      Object.assign(base, {
        mode: shared.mode, variant: shared.variant, attack: shared.attack, phase: shared.phase, sandbox: shared.sandbox,
        loadout: shared.loadout, stats: shared.stats ?? {}, dials: { ...DEFAULT_DIALS, ...shared.dials },
      });
    }
    if (!fight.modes.includes(base.mode)) base.mode = fight.modes[0];
    this.setup = base;
    void app.gearFor(fight.chapter);
  }

  rows(): { id: string; label: string; value?: string; dim?: boolean }[] {
    const s = this.setup;
    const f = s.fight;
    const rows: { id: string; label: string; value?: string; dim?: boolean }[] = [];
    rows.push({ id: 'mode', label: 'MODE', value: `< ${MODE_NAMES[s.mode]} >` });
    if (f.variants) rows.push({ id: 'variant', label: 'VARIANT', value: `< ${f.variants.find((v) => v.id === s.variant)?.name ?? '?'} >` });
    if (s.mode === 'single') rows.push({ id: 'attack', label: 'ATTACK', value: `< ${f.attacks.find((a) => a.id === s.attack)?.name ?? '?'} >` });
    else if (f.phases.length) rows.push({ id: 'phase', label: 'BEGIN AT', value: `< ${s.phase === 0 ? 'WHOLE FIGHT' : f.phases.find((p) => p.id === s.phase)?.name} >` });
    rows.push({ id: 'intro', label: 'INTRO', value: s.mode === 'normal' || s.mode === 'practice' ? (s.intro ? 'ON' : 'OFF') : 'SKIPPED', dim: !(s.mode === 'normal' || s.mode === 'practice') });
    rows.push({ id: 'equip', label: 'EQUIPMENT' });
    rows.push({ id: 'items', label: 'ITEMS' });
    if (s.sandbox) rows.push({ id: 'stats', label: 'STATS' });
    rows.push({ id: 'dials', label: 'DIALS', value: dialsModified(s.dials) ? 'CUSTOM' : 'DEFAULT' });
    rows.push({ id: 'sandbox', label: 'SANDBOX', value: s.sandbox ? 'ON' : 'OFF' });
    rows.push({ id: 'share', label: 'SHARE SETUP' });
    rows.push({ id: 'start', label: 'START' });
    return rows;
  }

  private savedJson = '';

  /** Every change is kept (mode, variant, gear, items, dials, stats), not only when a fight starts. */
  persist(): void {
    const s = this.setup;
    const saved: SavedSetup = { loadout: s.loadout, mode: s.mode, variant: s.variant, attack: s.attack, phase: s.phase, intro: s.intro, sandbox: s.sandbox, stats: s.stats, dials: s.dials, dv: DEFAULTS_VERSION };
    const json = JSON.stringify(saved);
    if (json !== this.savedJson) {
      this.savedJson = json;
      store.saveLoadout(s.fight.id, saved);
    }
  }

  draw(g: Gfx): void {
    const s = this.setup;
    this.persist();
    g.text('fnt_mainbig', s.fight.name, 320, 16, C.white, 1, 1);
    g.darkbox(16, 56, 400, 436);
    const rows = this.rows();
    const rowH = Math.min(40, Math.floor(340 / rows.length));
    drawOptions(g, rows, this.sel, 40, 76, rowH, 190);
    // right panel: boss, record, loadout summary
    drawBoss(g, s.fight, 520, 150, 180, 160, g.time / 6);
    const rec = store.record(this.app.recordKey(s));
    g.text('fnt_main', `${MODE_NAMES[s.mode]} RECORD`, 520, 250, C.gray, 1, 1);
    g.text('fnt_main', `CLEARS ${rec.clears}  TRIES ${rec.attempts}`, 520, 268, C.white, 1, 1);
    if (s.mode === 'endless') g.text('fnt_main', `MOST ATTACKS SURVIVED ${rec.endlessBest}`, 520, 286, C.white, 1, 1);
    else if (s.mode !== 'single') g.text('fnt_main', `BEST ${rec.bestTime !== null ? fmtTime(rec.bestTime) : '--'}  FEWEST HITS ${rec.bestHits ?? '--'}`, 520, 286, C.white, 1, 1);
    const gear = this.app.gearCache.get(s.fight.chapter);
    partyOf(s.fight, s.variant).forEach((c, i) => {
      const y = 320 + i * 44;
      g.sprite(CHAR_HEADS[c], 0, 420, y);
      const w = gear?.weapons.find((x) => x.id === s.loadout.weapons[c]);
      const armors = s.loadout.armors[c];
      const an = armors ? armors.map((a) => gear?.armors.find((x) => x.id === a)?.name).filter(Boolean).join(', ') : 'game default';
      g.text('fnt_main', s.loadout.weapons[c] === undefined ? 'game default' : w?.name ?? '---', 462, y + 2, C.white);
      g.text('fnt_main', an || '---', 462, y + 18, C.gray);
    });
    if (this.msgT > 0) { this.msgT--; g.text('fnt_mainbig', this.msg, 320, 444, C.yellow, 1, 1); }
    const row = rows[this.sel];
    const help: Record<string, string> = {
      mode: MODE_HELP[s.mode],
      intro: 'Play the story scene before the battle.',
      equip: 'Weapons and armor for each party member.',
      items: 'What you carry into battle.',
      sandbox: 'ON: any gear from this chapter + stat editing.',
      dials: 'Game speed, damage taken, invincibility.',
      share: 'Z: copy a link.  C: paste a code.',
      start: '',
      variant: 'Which version of the fight.',
      attack: 'The attack to practice, forever.',
      phase: 'Where the fight starts.',
    };
    if (this.msgT <= 0 && help[row.id]) g.text('fnt_main', help[row.id], 320, 452, C.gray, 1, 1);
  }

  key(k: MenuKey): void {
    const g = this.app.g;
    const s = this.setup;
    const rows = this.rows();
    const row = rows[this.sel];
    if (k === 'up' || k === 'down') { this.sel = (this.sel + (k === 'up' ? -1 : 1) + rows.length) % rows.length; g.sfx('snd_menumove'); return; }
    if (k === 'cancel') { g.sfx('snd_menumove'); this.app.pop(); return; }
    const cycle = <T,>(list: T[], cur: T, d: number): T => list[(list.indexOf(cur) + d + list.length) % list.length];
    const d = k === 'left' ? -1 : k === 'right' ? 1 : k === 'confirm' ? 1 : 0;
    if (row.id === 'mode' && d) { s.mode = cycle(s.fight.modes, s.mode, d); g.sfx('snd_menumove'); this.sel = Math.min(this.sel, this.rows().length - 1); }
    if (row.id === 'variant' && d && s.fight.variants) {
      const untouched = JSON.stringify(s.loadout) === JSON.stringify(defaultLoadout(s.fight, s.variant));
      s.variant = cycle(s.fight.variants.map((v) => v.id), s.variant, d);
      if (untouched) s.loadout = defaultLoadout(s.fight, s.variant);
      g.sfx('snd_menumove');
    }
    if (row.id === 'attack' && d && s.fight.attacks.length) { s.attack = cycle(s.fight.attacks.map((a) => a.id), s.attack, d); g.sfx('snd_menumove'); }
    if (row.id === 'phase' && d) { s.phase = cycle([0, ...s.fight.phases.map((p) => p.id)], s.phase, d); g.sfx('snd_menumove'); }
    if (row.id === 'intro' && d && (s.mode === 'normal' || s.mode === 'practice')) { s.intro = !s.intro; g.sfx('snd_menumove'); }
    if (row.id === 'sandbox' && d) { s.sandbox = !s.sandbox; g.sfx('snd_menumove'); if (!s.sandbox) this.enforceLegal(); }
    if (k !== 'confirm' && k !== 'menu') return;
    if (row.id === 'equip' && k === 'confirm') { g.sfx('snd_select'); this.app.push(new EquipScreen(this.app, s)); }
    if (row.id === 'items' && k === 'confirm') { g.sfx('snd_select'); this.app.push(new ItemsScreen(this.app, s)); }
    if (row.id === 'stats' && k === 'confirm') { g.sfx('snd_select'); this.app.push(new StatsScreen(this.app, s)); }
    if (row.id === 'dials' && k === 'confirm') { g.sfx('snd_select'); this.app.push(new DialsScreen(this.app, s)); }
    if (row.id === 'share') {
      if (k === 'confirm') {
        const url = `${location.origin}${location.pathname}?s=${encodeShare(s)}`;
        void navigator.clipboard?.writeText(url).then(() => { this.msg = 'LINK COPIED!'; this.msgT = 60; }, () => { this.msg = 'COPY FAILED'; this.msgT = 60; });
        g.sfx('snd_select');
      } else {
        const code = window.prompt('Paste a setup link or code:');
        const dec = code ? decodeShare(code.includes('s=') ? new URL(code, location.href).searchParams.get('s') ?? '' : code.trim()) : null;
        if (dec && dec.boss === s.fight.id) {
          Object.assign(s, { mode: dec.mode, variant: dec.variant, attack: dec.attack, phase: dec.phase, sandbox: dec.sandbox, loadout: dec.loadout, stats: dec.stats ?? {}, dials: { ...DEFAULT_DIALS, ...dec.dials } });
          this.msg = 'SETUP LOADED!'; this.msgT = 60; g.sfx('snd_equip');
        } else if (code) { this.msg = 'BAD CODE'; this.msgT = 60; g.sfx('snd_error'); }
      }
    }
    if (row.id === 'start' && k === 'confirm') { g.sfx('snd_select'); void this.app.launch(s); }
  }

  /** Drop anything not obtainable when leaving sandbox. */
  enforceLegal(): void {
    const s = this.setup;
    const rules = s.fight.gear;
    for (const c of partyOf(s.fight, s.variant)) {
      if (s.loadout.weapons[c] !== undefined && !isLegal(rules.weapons, s.loadout.weapons[c], 'weapons') && s.loadout.weapons[c] !== rules.defaults.weapons[c]) s.loadout.weapons[c] = rules.defaults.weapons[c];
      if (s.loadout.armors[c]) s.loadout.armors[c] = s.loadout.armors[c].map((a) => (a === 0 || isLegal(rules.armors, a, 'armors') ? a : 0)) as [number, number];
    }
    s.loadout.items = s.loadout.items.map((i) => (isLegal(rules.items, i, 'items') ? i : 0));
    s.stats = {};
  }
}

const MODE_HELP: Record<ModeId, string> = {
  normal: 'The whole fight, exactly like the game.',
  hitless: 'Any damage to anyone restarts instantly.',
  practice: 'No game over. Counts every hit.',
  single: 'One attack, over and over.',
  endless: 'Attacks forever, shuffled. How long can you last?',
};

class EquipScreen implements Screen {
  col = 0;
  row = 0;
  constructor(private app: App, private s: Setup) {}

  private slots(_c: number): { label: string; kind: 'weapon' | 'armor'; idx: number }[] {
    return [{ label: 'WEAPON', kind: 'weapon', idx: 0 }, { label: 'ARMOR', kind: 'armor', idx: 0 }, { label: 'ARMOR', kind: 'armor', idx: 1 }];
  }

  statsFor(c: number): { at: number; df: number; mag: number } {
    const gear = this.app.gearCache.get(this.s.fight.chapter);
    const w = gear?.weapons.find((x) => x.id === this.s.loadout.weapons[c]);
    const [a1, a2] = this.s.loadout.armors[c] ?? [0, 0];
    const arms = [a1, a2].map((a) => gear?.armors.find((x) => x.id === a));
    const sum = (k: 'at' | 'df' | 'mag') => (w?.[k] ?? 0) + arms.reduce((t, a) => t + (a?.[k] ?? 0), 0);
    return { at: sum('at'), df: sum('df'), mag: sum('mag') };
  }

  draw(g: Gfx): void {
    const gear = this.app.gearCache.get(this.s.fight.chapter);
    g.text('fnt_mainbig', 'EQUIPMENT', 320, 16, C.white, 1, 1);
    const party = partyOf(this.s.fight, this.s.variant);
    const colW = 600 / party.length;
    party.forEach((c, i) => {
      const x = 20 + i * colW;
      g.darkbox(x, 60, x + colW - 8, 380);
      g.sprite(CHAR_HEADS[c], i === this.col ? 1 : 0, x + 24, 80);
      g.text('fnt_mainbig', CHAR_NAMES[c], x + 70, 80, i === this.col ? C.yellow : C.white);
      this.slots(c).forEach((sl, j) => {
        const y = 140 + j * 70;
        const id = sl.kind === 'weapon' ? this.s.loadout.weapons[c] : (this.s.loadout.armors[c] ?? [0, 0])[sl.idx];
        const e = sl.kind === 'weapon' ? gear?.weapons.find((w) => w.id === id) : gear?.armors.find((a) => a.id === id);
        const on = i === this.col && j === this.row;
        const unset = sl.kind === 'weapon' ? this.s.loadout.weapons[c] === undefined : this.s.loadout.armors[c] === undefined;
        g.text('fnt_main', sl.label, x + 40, y, C.gray);
        g.text('fnt_mainbig', unset ? 'GAME DEFAULT' : e?.name || '(NONE)', x + 40, y + 16, on ? C.yellow : unset ? C.gray : C.white);
        if (on) g.heart(x + 16, y + 24);
      });
      const st = this.statsFor(c);
      g.text('fnt_main', `+AT ${st.at}  +DF ${st.df}  +MG ${st.mag}`, x + colW / 2 - 4, 350, C.white, 1, 1);
    });
    // description of highlighted
    const c = party[this.col];
    const sl = this.slots(c)[this.row];
    const id = sl.kind === 'weapon' ? this.s.loadout.weapons[c] : (this.s.loadout.armors[c] ?? [0, 0])[sl.idx];
    const e = sl.kind === 'weapon' ? gear?.weapons.find((w) => w.id === id) : gear?.armors.find((a) => a.id === id);
    g.darkbox(20, 390, 620, 470);
    const lines = g.wrap('fnt_mainbig', e ? `* ${e.desc}` : '* Nothing equipped.', 560).slice(0, 2);
    lines.forEach((l, i) => g.text('fnt_mainbig', l, 44, 402 + i * 30));
    if (e?.ability && lines.length < 2) g.text('fnt_main', e.ability, 44, 444, C.gray);
    g.text('fnt_main', 'C: DEFAULT LOADOUT', 600, 20, C.gray, 1, 2);
  }

  key(k: MenuKey): void {
    const g = this.app.g;
    const n = partyOf(this.s.fight, this.s.variant).length;
    if (k === 'left' || k === 'right') { this.col = (this.col + (k === 'left' ? -1 : 1) + n) % n; g.sfx('snd_menumove'); }
    if (k === 'up' || k === 'down') { this.row = (this.row + (k === 'up' ? -1 : 1) + 3) % 3; g.sfx('snd_menumove'); }
    if (k === 'cancel') { g.sfx('snd_menumove'); this.app.pop(); }
    if (k === 'menu') {
      // Back to the typical loadout for this fight (equipment and items).
      this.s.loadout = defaultLoadout(this.s.fight, this.s.variant);
      g.sfx('snd_equip');
    }
    if (k === 'confirm') {
      const gear = this.app.gearCache.get(this.s.fight.chapter);
      if (!gear) return;
      g.sfx('snd_select');
      const c = partyOf(this.s.fight, this.s.variant)[this.col];
      const sl = this.slots(c)[this.row];
      const rules = this.s.fight.gear;
      if (sl.kind === 'weapon') {
        const cur = this.s.loadout.weapons[c];
        const usedElsewhere = new Set(partyOf(this.s.fight, this.s.variant).filter((o) => o !== c).map((o) => this.s.loadout.weapons[o]).filter((w) => rules.unique.weapons.includes(w)));
        const list = gear.weapons.filter((w) => (w.who?.includes(c) || w.id === rules.defaults.weapons[c]) && (this.s.sandbox || isLegal(rules.weapons, w.id, 'weapons')) && !usedElsewhere.has(w.id));
        this.app.push(new PickScreen(this.app, 'WEAPON', list, cur, false, (id) => { this.s.loadout.weapons[c] = id; }));
      } else {
        const arm = (this.s.loadout.armors[c] ??= [0, 0]);
        const cur = arm[sl.idx];
        const used = new Set<number>();
        for (const o of partyOf(this.s.fight, this.s.variant)) (this.s.loadout.armors[o] ?? [0, 0]).forEach((a, k2) => { if (!(o === c && k2 === sl.idx) && rules.unique.armors.includes(a)) used.add(a); });
        const list = gear.armors.filter((a) => a.who?.includes(c) && (this.s.sandbox || isLegal(rules.armors, a.id, 'armors')) && !used.has(a.id));
        this.app.push(new PickScreen(this.app, 'ARMOR', list, cur, true, (id) => { arm[sl.idx] = id; }));
      }
    }
  }
}

class DialsScreen implements Screen {
  sel = 0;
  constructor(private app: App, private s: Setup) {}
  private rows() {
    const d = this.s.dials;
    const iframe = d.iframes === 100 ? 'NORMAL' : `${d.iframes}%`;
    return [
      { id: 'speed', label: 'GAME SPEED', value: `< ${d.speed}% >` },
      { id: 'damage', label: 'DAMAGE TAKEN', value: `< ${d.damage}% >` },
      { id: 'iframes', label: 'INVINCIBILITY', value: `< ${iframe} >` },
      { id: 'reset', label: 'RESET' },
      { id: 'back', label: 'BACK' },
    ];
  }
  draw(g: Gfx): void {
    g.text('fnt_mainbig', 'DIALS', 320, 16, C.white, 1, 1);
    g.darkbox(40, 70, 600, 330);
    drawOptions(g, this.rows(), this.sel, 70, 96, 44, 360);
    g.darkbox(40, 346, 600, 460);
    const help = [
      'Slows down or speeds up the whole game. Great for learning patterns.',
      'Scales every hit you take. Hitless still fails on any hit.',
      'How long you stay invincible after getting hit.',
      'Back to the real game.',
      '',
    ][this.sel];
    g.wrap('fnt_mainbig', help, 520).slice(0, 2).forEach((l, i) => g.text('fnt_mainbig', l, 64, 364 + i * 32));
    if (dialsModified(this.s.dials)) g.text('fnt_main', 'Records with custom dials are kept separately.', 320, 436, C.gray, 1, 1);
  }
  key(k: MenuKey): void {
    const g = this.app.g;
    const rows = this.rows();
    const d = this.s.dials;
    if (k === 'up' || k === 'down') { this.sel = (this.sel + (k === 'up' ? -1 : 1) + rows.length) % rows.length; g.sfx('snd_menumove'); return; }
    if (k === 'cancel') { this.app.pop(); return; }
    const dir = k === 'left' ? -1 : k === 'right' ? 1 : 0;
    const step = (v: number, list: number[]) => list[Math.max(0, Math.min(list.length - 1, list.indexOf(v) + dir))] ?? v;
    const id = rows[this.sel].id;
    if (id === 'speed' && dir) d.speed = step(d.speed, [25, 50, 75, 100, 125, 150, 200]);
    if (id === 'damage' && dir) d.damage = step(d.damage, [0, 25, 50, 100, 150, 200, 300]);
    if (id === 'iframes' && dir) d.iframes = step(d.iframes, [25, 50, 100, 150, 200, 300]);
    if (dir) g.sfx('snd_menumove');
    if (id === 'reset' && k === 'confirm') { Object.assign(d, DEFAULT_DIALS); g.sfx('snd_equip'); }
    if (id === 'back' && k === 'confirm') this.app.pop();
  }
}

class StatsScreen implements Screen {
  col = 0;
  row = 0;
  constructor(private app: App, private s: Setup) {}
  private static KEYS = ['hp', 'at', 'df', 'mag'] as const;
  draw(g: Gfx): void {
    g.text('fnt_mainbig', 'STATS (SANDBOX)', 320, 16, C.white, 1, 1);
    const party = partyOf(this.s.fight, this.s.variant);
    const colW = 600 / party.length;
    party.forEach((c, i) => {
      const x = 20 + i * colW;
      g.darkbox(x, 60, x + colW - 8, 380);
      g.sprite(CHAR_HEADS[c], 0, x + 24, 80);
      g.text('fnt_mainbig', CHAR_NAMES[c], x + 70, 80, i === this.col ? C.yellow : C.white);
      StatsScreen.KEYS.forEach((k, j) => {
        const y = 140 + j * 56;
        const v = this.s.stats[c]?.[k];
        const on = i === this.col && j === this.row;
        g.text('fnt_mainbig', k.toUpperCase(), x + 40, y, on ? C.yellow : C.white);
        g.text('fnt_mainbig', v === undefined ? 'GAME' : `< ${v} >`, x + colW - 30, y, v === undefined ? C.gray : C.white, 1, 2);
        if (on) g.heart(x + 16, y + 8);
      });
    });
    g.text('fnt_main', 'LEFT/RIGHT: CHANGE   C: BACK TO GAME VALUE   X: DONE', 320, 420, C.gray, 1, 1);
  }
  key(k: MenuKey): void {
    const g = this.app.g;
    const party = partyOf(this.s.fight, this.s.variant);
    const c = party[this.col];
    const key = StatsScreen.KEYS[this.row];
    if (k === 'up' || k === 'down') { this.row = (this.row + (k === 'up' ? -1 : 1) + 4) % 4; g.sfx('snd_menumove'); return; }
    if (k === 'cancel') { this.app.pop(); return; }
    if (k === 'confirm') { this.col = (this.col + 1) % party.length; g.sfx('snd_menumove'); return; }
    const st = (this.s.stats[c] ??= {});
    if (k === 'menu') { delete st[key]; g.sfx('snd_equip'); return; }
    const dir = k === 'left' ? -1 : k === 'right' ? 1 : 0;
    if (!dir) return;
    const base = key === 'hp' ? 100 : key === 'at' ? 10 : key === 'df' ? 2 : 0;
    const stepSize = key === 'hp' ? 10 : 1;
    const max = key === 'hp' ? 999 : 99;
    st[key] = Math.max(key === 'hp' ? 1 : 0, Math.min(max, (st[key] ?? base) + dir * stepSize));
    g.sfx('snd_menumove');
  }
}

class ItemsScreen implements Screen {
  sel = 0;
  constructor(private app: App, private s: Setup) {}
  draw(g: Gfx): void {
    const gear = this.app.gearCache.get(this.s.fight.chapter);
    g.text('fnt_mainbig', 'ITEMS', 320, 16, C.white, 1, 1);
    g.darkbox(20, 60, 620, 380);
    for (let i = 0; i < 12; i++) {
      const x = 60 + (i % 2) * 290;
      const y = 84 + Math.floor(i / 2) * 46;
      const id = this.s.loadout.items[i] ?? 0;
      const it = gear?.items.find((x2) => x2.id === id);
      const label = this.s.loadout.items.length === 0 ? (i === 0 ? 'GAME DEFAULT' : '') : it?.name || '---';
      g.text('fnt_mainbig', label, x, y, i === this.sel ? C.yellow : id ? C.white : C.gray);
      if (i === this.sel) g.heart(x - 30, y + 8);
    }
    const it = gear?.items.find((x) => x.id === (this.s.loadout.items[this.sel] ?? 0));
    g.darkbox(20, 390, 620, 470);
    g.wrap('fnt_mainbig', it ? `* ${it.desc}` : '* An empty slot.', 560).slice(0, 1).forEach((l) => g.text('fnt_mainbig', l, 44, 406));
    g.text('fnt_main', 'Z: CHOOSE   C: CLEAR   X: BACK', 44, 444, C.gray);
  }
  key(k: MenuKey): void {
    const g = this.app.g;
    const move = (d: number) => { this.sel = (this.sel + d + 12) % 12; g.sfx('snd_menumove'); };
    if (k === 'left' || k === 'right') move(k === 'left' ? -1 : 1);
    if (k === 'up' || k === 'down') move(k === 'up' ? -2 : 2);
    if (k === 'cancel') { g.sfx('snd_menumove'); this.app.pop(); }
    if (k === 'menu') { this.s.loadout.items[this.sel] = 0; this.compact(); g.sfx('snd_equip'); }
    if (k === 'confirm') {
      const gear = this.app.gearCache.get(this.s.fight.chapter);
      if (!gear) return;
      g.sfx('snd_select');
      const list = gear.items.filter((i) => this.s.sandbox || isLegal(this.s.fight.gear.items, i.id, 'items'));
      this.app.push(new PickScreen(this.app, 'ITEM', list, this.s.loadout.items[this.sel] ?? 0, true, (id) => { this.s.loadout.items[this.sel] = id; this.compact(); }));
    }
  }
  /** The game's inventory has no gaps. Editing an untouched ("game default") inventory starts from empty. */
  compact(): void {
    const it = this.s.loadout.items.filter((x) => x > 0);
    while (it.length < 12) it.push(0);
    this.s.loadout.items = it;
  }
}

class PickScreen implements Screen {
  sel = 0;
  top = 0;
  entries: (GearEntry | null)[];
  private static VIS = 8;
  constructor(private app: App, private title: string, list: GearEntry[], cur: number, allowNone: boolean, private done: (id: number) => void) {
    this.entries = allowNone ? [null, ...list.filter((e) => e.name)] : list.filter((e) => e.name);
    this.sel = Math.max(0, this.entries.findIndex((e) => (e?.id ?? 0) === cur));
  }
  draw(g: Gfx): void {
    g.rect(0, 0, 640, 480, C.black, 0.85);
    g.darkbox(60, 30, 580, 450);
    g.text('fnt_mainbig', `CHOOSE ${this.title}`, 320, 48, C.white, 1, 1);
    const vis = PickScreen.VIS;
    if (this.sel < this.top) this.top = this.sel;
    if (this.sel >= this.top + vis) this.top = this.sel - vis + 1;
    for (let i = 0; i < vis && this.top + i < this.entries.length; i++) {
      const idx = this.top + i;
      const e = this.entries[idx];
      const y = 92 + i * 36;
      const on = idx === this.sel;
      g.text('fnt_mainbig', e ? e.name : '(NONE)', 120, y, on ? C.yellow : C.white);
      if (e && this.title !== 'ITEM') {
        const st = [e.at ? `AT${e.at}` : '', e.df ? `DF${e.df}` : '', e.mag ? `MG${e.mag}` : ''].filter(Boolean).join(' ');
        g.text('fnt_main', st, 540, y + 8, C.gray, 1, 2);
      }
      if (on) g.heart(90, y + 8);
    }
    // Scroll hints: there is almost always more than one page.
    const bob = Math.round(Math.sin(g.time / 6) * 2);
    if (this.top > 0) g.text('fnt_mainbig', '^', 320, 70 + bob, C.white, 1, 1);
    if (this.top + vis < this.entries.length) g.text('fnt_mainbig', 'v', 320, 376 - bob, C.white, 1, 1);
    g.text('fnt_main', `${this.sel + 1} / ${this.entries.length}   LEFT/RIGHT: PAGE`, 552, 404, C.gray, 1, 2);
    const e = this.entries[this.sel];
    if (e) g.wrap('fnt_main', e.desc, 440).slice(0, 2).forEach((l, i) => g.text('fnt_main', l, 90, 404 + i * 18, C.gray));
  }
  key(k: MenuKey): void {
    const g = this.app.g;
    const n = this.entries.length;
    if (k === 'up' || k === 'down') { this.sel = (this.sel + (k === 'up' ? -1 : 1) + n) % n; g.sfx('snd_menumove'); }
    if (k === 'left' || k === 'right') {
      this.sel = Math.max(0, Math.min(n - 1, this.sel + (k === 'left' ? -1 : 1) * PickScreen.VIS));
      g.sfx('snd_menumove');
    }
    if (k === 'cancel') { g.sfx('snd_menumove'); this.app.pop(); }
    if (k === 'confirm') { g.sfx('snd_equip'); this.done(this.entries[this.sel]?.id ?? 0); this.app.pop(); }
  }
}

class LoadingScreen implements Screen {
  constructor(private app: App) {}
  draw(g: Gfx): void {
    const l = this.app.loading;
    if (l?.error) {
      g.text('fnt_mainbig', 'SOMETHING WENT WRONG', 320, 180, C.red, 1, 1);
      const msg = l.error.split('\n')[0].slice(0, 70);
      g.text('fnt_main', msg, 320, 230, C.white, 1, 1);
      g.text('fnt_main', 'X: BACK', 320, 300, C.gray, 1, 1);
      return;
    }
    g.heart(312, 200 + Math.sin(g.time / 8) * 4);
    if (l && l.total > 0 && l.loaded < l.total) {
      g.text('fnt_mainbig', 'LOADING', 320, 250, C.white, 1, 1);
      g.text('fnt_main', `${(l.loaded / 1048576).toFixed(1)} / ${(l.total / 1048576).toFixed(1)} MB`, 320, 290, C.gray, 1, 1);
      g.rect(170, 320, 300, 6, C.dark);
      g.rect(170, 320, (300 * l.loaded) / l.total, 6, C.white);
    } else {
      g.text('fnt_mainbig', 'STARTING', 320, 250, C.white, 1, 1);
    }
  }
  key(k: MenuKey): void {
    if (k === 'cancel' && this.app.loading?.error) { this.app.loading = null; this.app.quitGame(); }
  }
}

class PauseScreen implements Screen {
  overlay = true;
  sel = 0;
  opts: string[];
  constructor(private app: App) {
    const inIntro = !!app.run && !app.run.battleAt && app.run.setup.intro && app.run.restarts === 0;
    this.opts = inIntro ? ['RESUME', 'SKIP INTRO', 'RESTART', 'QUIT'] : ['RESUME', 'RESTART', 'QUIT'];
  }
  draw(g: Gfx): void {
    g.rect(0, 0, 640, 480, C.black, 0.6);
    const h = 100 + this.opts.length * 40;
    const top = 240 - h / 2;
    g.darkbox(170, top, 470, top + h);
    g.text('fnt_mainbig', 'PAUSED', 320, top + 20, C.white, 1, 1);
    drawOptions(g, this.opts.map((label) => ({ label })), this.sel, 220, top + 66, 40);
    const r = this.app.run;
    if (r) g.text('fnt_main', `TIME ${fmtTime(this.app.elapsed())}   HITS ${r.hits}`, 320, top + h - 26, C.gray, 1, 1);
  }
  key(k: MenuKey): void {
    const g = this.app.g;
    const n = this.opts.length;
    if (k === 'up' || k === 'down') { this.sel = (this.sel + (k === 'up' ? -1 : 1) + n) % n; g.sfx('snd_menumove'); }
    if (k === 'cancel') this.resume();
    if (k === 'confirm') {
      g.sfx('snd_select');
      const o = this.opts[this.sel];
      if (o === 'RESUME') this.resume();
      if (o === 'SKIP INTRO') this.app.restartGame(true);
      if (o === 'RESTART') this.app.restartGame();
      if (o === 'QUIT') this.app.quitGame();
    }
  }
  resume(): void { this.app.resumeGame(); }
}

class ResultScreen implements Screen {
  sel = 0;
  opts: string[];
  msg = '';
  constructor(private app: App, private s: Setup, private r: { how: string; time: number; hits: number; attempts: number; newBest: boolean; replay?: boolean }) {
    this.opts = r.replay ? ['WATCH AGAIN', 'BACK'] : ['FIGHT AGAIN', 'WATCH REPLAY', 'SAVE REPLAY', 'CHANGE SETUP', 'FIGHT SELECT'];
  }
  draw(g: Gfx): void {
    g.text('fnt_mainbig', this.r.replay ? 'REPLAY OVER' : 'YOU WON!', 320, 24, C.yellow, 2, 1);
    drawBoss(g, this.s.fight, 150, 150, 140, 110, g.time / 6);
    g.darkbox(260, 90, 620, 214);
    g.text('fnt_mainbig', `TIME  ${fmtTime(this.r.time)}`, 286, 106, this.r.newBest ? C.yellow : C.white);
    if (this.r.newBest) g.text('fnt_main', 'NEW BEST!', 600, 114, C.yellow, 1, 2);
    g.text('fnt_mainbig', `HITS  ${this.r.hits}`, 286, 140, this.r.hits === 0 ? C.yellow : C.white);
    if (this.r.hits === 0) g.text('fnt_main', 'NO HIT!', 600, 148, C.yellow, 1, 2);
    g.text('fnt_mainbig', `TRIES ${this.r.attempts}`, 286, 174, C.white);
    g.darkbox(120, 236, 520, 250 + this.opts.length * 36);
    drawOptions(g, this.opts.map((label) => ({ label })), this.sel, 160, 256, 36);
    if (this.msg) g.text('fnt_main', this.msg, 320, 460, C.gray, 1, 1);
  }
  key(k: MenuKey): void {
    const g = this.app.g;
    const n = this.opts.length;
    if (k === 'up' || k === 'down') { this.sel = (this.sel + (k === 'up' ? -1 : 1) + n) % n; g.sfx('snd_menumove'); }
    if (k === 'cancel') { this.app.pop(); return; }
    if (k !== 'confirm') return;
    g.sfx('snd_select');
    const o = this.opts[this.sel];
    const rep = this.app.lastReplay;
    if (o === 'FIGHT AGAIN') { this.app.pop(); void this.app.launch(this.s); }
    if (o === 'WATCH REPLAY' || o === 'WATCH AGAIN') {
      const r = this.r.replay ? this.app.run?.replay ?? rep : rep;
      if (r) { this.app.pop(); void this.app.watch(r); } else this.msg = 'Replay not ready yet.';
    }
    if (o === 'SAVE REPLAY') {
      if (!rep) { this.msg = 'Replay not ready yet.'; return; }
      const blob = new Blob([JSON.stringify(rep)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${rep.boss}-${rep.date.slice(0, 19).replace(/[:T]/g, '-')}.drreplay`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      this.msg = 'Saved!';
    }
    if (o === 'CHANGE SETUP' || o === 'BACK') this.app.pop();
    if (o === 'FIGHT SELECT') { this.app.pop(); this.app.popTo((s) => s instanceof BossSelectScreen); }
  }
}

class SettingsScreen implements Screen {
  sel = 0;
  constructor(private app: App) {}
  rows() {
    const s = store.settings;
    return [
      { id: 'volume', label: 'GAME VOLUME', value: `< ${Math.round(s.volume * 100)}% >` },
      { id: 'sfx', label: 'MENU SOUNDS', value: `< ${Math.round(s.sfxVolume * 100)}% >` },
      { id: 'scale', label: 'SCALING', value: s.scale === 'fit' ? 'FIT' : 'PIXEL PERFECT' },
      { id: 'hud', label: 'TIMER / HITS', value: s.showHud ? 'SHOW' : 'HIDE' },
      { id: 'controls', label: 'CONTROLS' },
      { id: 'fullscreen', label: 'FULLSCREEN' },
      { id: 'back', label: 'BACK' },
    ];
  }
  draw(g: Gfx): void {
    g.text('fnt_mainbig', 'SETTINGS', 320, 24, C.white, 1, 1);
    g.darkbox(40, 80, 600, 420);
    drawOptions(g, this.rows(), this.sel, 70, 110, 42, 330);
  }
  key(k: MenuKey): void {
    const g = this.app.g;
    const rows = this.rows();
    const s = store.settings;
    if (k === 'up' || k === 'down') { this.sel = (this.sel + (k === 'up' ? -1 : 1) + rows.length) % rows.length; g.sfx('snd_menumove'); return; }
    if (k === 'cancel') { g.sfx('snd_menumove'); this.app.pop(); return; }
    const id = rows[this.sel].id;
    const d = k === 'left' ? -1 : k === 'right' ? 1 : 0;
    const clamp = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 10) / 10;
    if (id === 'volume' && d) s.volume = clamp(s.volume + d * 0.1);
    if (id === 'sfx' && d) s.sfxVolume = clamp(s.sfxVolume + d * 0.1);
    if (id === 'scale' && (d || k === 'confirm')) s.scale = s.scale === 'fit' ? 'integer' : 'fit';
    if (id === 'hud' && (d || k === 'confirm')) s.showHud = !s.showHud;
    if (id === 'controls' && k === 'confirm') this.app.push(new ControlsScreen(this.app));
    if (id === 'fullscreen' && k === 'confirm') {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void document.documentElement.requestFullscreen?.();
    }
    if (id === 'back' && k === 'confirm') { this.app.pop(); return; }
    if (d || k === 'confirm') g.sfx('snd_menumove');
    this.app.applySettings();
  }
}

class ControlsScreen implements Screen {
  sel = 0;
  waiting = false;
  constructor(private app: App) {}
  private label(a: Action): string {
    return { up: 'UP', down: 'DOWN', left: 'LEFT', right: 'RIGHT', confirm: 'CONFIRM', cancel: 'CANCEL', menu: 'MENU' }[a];
  }
  private keyName(code: string): string {
    return code.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Arrow/, '').replace(/(Left|Right)$/, '').toUpperCase();
  }
  draw(g: Gfx): void {
    g.text('fnt_mainbig', 'CONTROLS', 320, 16, C.white, 1, 1);
    g.darkbox(40, 60, 600, 440);
    const b = store.settings.bindings;
    const rows = [...ACTIONS.map((a) => ({ label: this.label(a), value: this.waiting && ACTIONS[this.sel] === a ? 'PRESS A KEY...' : [...new Set(b.keys[a].map((c) => this.keyName(c)))].join(' / ') })),
      { label: 'RESET', value: '' }, { label: 'BACK', value: '' }];
    drawOptions(g, rows, this.sel, 70, 84, 38, 260);
    g.text('fnt_main', 'Gamepads work automatically (A = confirm, B = cancel, Y = menu).', 320, 420, C.gray, 1, 1);
  }
  key(k: MenuKey): void {
    const g = this.app.g;
    const n = ACTIONS.length + 2;
    if (this.waiting) return;
    if (k === 'up' || k === 'down') { this.sel = (this.sel + (k === 'up' ? -1 : 1) + n) % n; g.sfx('snd_menumove'); return; }
    if (k === 'cancel') { this.app.pop(); return; }
    if (k !== 'confirm') return;
    if (this.sel === ACTIONS.length) { store.settings.bindings = structuredClone(DEFAULT_BINDINGS); this.app.applySettings(); g.sfx('snd_equip'); return; }
    if (this.sel === ACTIONS.length + 1) { this.app.pop(); return; }
    this.waiting = true;
    const action = ACTIONS[this.sel];
    setTimeout(() => {
      const capture = (e: KeyboardEvent) => {
        e.preventDefault();
        e.stopImmediatePropagation();
        window.removeEventListener('keydown', capture, true);
        if (e.code !== 'Escape') {
          const b = store.settings.bindings;
          for (const a of ACTIONS) b.keys[a] = b.keys[a].filter((c) => c !== e.code);
          b.keys[action] = [e.code, ...b.keys[action]].slice(0, 3);
          this.app.applySettings();
          g.sfx('snd_equip');
        }
        this.waiting = false;
      };
      window.addEventListener('keydown', capture, true);
    }, 150);
  }
}

class CreditsScreen implements Screen {
  constructor(private app: App) {}
  draw(g: Gfx): void {
    g.text('fnt_mainbig', 'CREDITS', 320, 30, C.white, 1, 1);
    const lines = [
      ['DELTARUNE', 'Toby Fox and team'],
      ['GAME RUNNER', 'Butterscotch (AGPL-3.0)'],
      ['DECOMPILER', 'UndertaleModTool'],
      ['INSPIRED BY', 'DEVICE_KNIGHT'],
      ['', ''],
      ['This is a fan project.', ''],
      ['Please buy DELTARUNE.', ''],
    ];
    lines.forEach(([a, b], i) => {
      g.text('fnt_mainbig', a, 60, 100 + i * 42, b ? C.gray : C.white);
      if (b) g.text('fnt_mainbig', b, 580, 100 + i * 42, C.white, 1, 2);
    });
    g.text('fnt_main', `SOURCE (AGPL-3.0): ${SOURCE_URL.replace('https://', '')}`, 320, 404, C.gray, 1, 1);
    g.text('fnt_main', 'C: OPEN SOURCE CODE     X: BACK', 320, 450, C.gray, 1, 1);
  }
  key(k: MenuKey): void {
    if (k === 'menu') { window.open(SOURCE_URL, '_blank', 'noopener'); return; }
    if (k === 'cancel' || k === 'confirm') this.app.pop();
  }
}

export { VK };
