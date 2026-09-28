// Menu rendering: game sprites, GameMaker-style bitmap fonts and the dark-world text box.

interface SpriteMeta { w: number; h: number; frames: number; ox: number; oy: number; fps?: number }
interface FontMeta { size: number; glyphs: Record<string, [number, number, number, number, number, number]> }
interface UiManifest { sprites: Record<string, SpriteMeta>; fonts: Record<string, FontMeta>; sfx: string[] }

export const C = {
  white: '#ffffff',
  yellow: '#ffff00',
  gray: '#808080',
  dark: '#404040',
  red: '#ff0000',
  orange: '#ff8000',
  aqua: '#00c0ff',
  lime: '#00ff00',
  black: '#000000',
} as const;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load ${src}`));
    img.src = src;
  });
}

export class Gfx {
  readonly W = 640;
  readonly H = 480;
  ctx: CanvasRenderingContext2D;
  private manifest!: UiManifest;
  private sprites = new Map<string, HTMLImageElement>();
  private fontImgs = new Map<string, HTMLImageElement>();
  private tinted = new Map<string, HTMLCanvasElement>();
  private tintedSprites = new Map<string, HTMLCanvasElement>();
  private sfxBuffers = new Map<string, AudioBuffer>();
  private audio: AudioContext | null = null;
  sfxVolume = 1;
  time = 0;

  constructor(readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas unavailable');
    this.ctx = ctx;
    ctx.imageSmoothingEnabled = false;
  }

  async load(): Promise<void> {
    const res = await fetch('/ui/manifest.json');
    if (!res.ok) throw new Error('UI assets missing: run the asset build (npm run assets).');
    this.manifest = await res.json();
    await Promise.all([
      ...Object.keys(this.manifest.sprites).map(async (k) => this.sprites.set(k, await loadImage(`/ui/sprites/${k}.png`))),
      ...Object.keys(this.manifest.fonts).map(async (k) => this.fontImgs.set(k, await loadImage(`/ui/fonts/${k}.png`))),
    ]);
  }

  hasSprite(name: string): boolean {
    return this.sprites.has(name);
  }

  spriteMeta(name: string): SpriteMeta | undefined {
    return this.manifest.sprites[name];
  }

  /** draw_sprite_ext without rotation. Origin-relative, like GameMaker. */
  sprite(name: string, frame: number, x: number, y: number, xs = 1, ys = 1, alpha = 1, tint?: string): void {
    const img = this.sprites.get(name);
    const m = this.manifest.sprites[name];
    if (!img || !m) return;
    const f = ((Math.floor(frame) % m.frames) + m.frames) % m.frames;
    const src: CanvasImageSource = tint ? this.tintSprite(name, img, tint) : img;
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(Math.round(x), Math.round(y));
    ctx.scale(xs, ys);
    ctx.drawImage(src, f * m.w, 0, m.w, m.h, -m.ox, -m.oy, m.w, m.h);
    ctx.restore();
  }

  private tintSprite(name: string, img: HTMLImageElement, color: string): HTMLCanvasElement {
    const key = `${name}|${color}`;
    let c = this.tintedSprites.get(key);
    if (!c) {
      c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext('2d')!;
      g.drawImage(img, 0, 0);
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = color;
      g.fillRect(0, 0, c.width, c.height);
      this.tintedSprites.set(key, c);
    }
    return c;
  }

  private fontAtlas(font: string, color: string): HTMLCanvasElement | null {
    const key = `${font}|${color}`;
    let c = this.tinted.get(key);
    if (!c) {
      const img = this.fontImgs.get(font);
      if (!img) return null;
      c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext('2d')!;
      g.drawImage(img, 0, 0);
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = color;
      g.fillRect(0, 0, c.width, c.height);
      this.tinted.set(key, c);
    }
    return c;
  }

  textWidth(font: string, s: string, scale = 1): number {
    const f = this.manifest.fonts[font];
    let w = 0;
    for (const ch of s) {
      const g = f.glyphs[ch.codePointAt(0)!] ?? f.glyphs[63];
      if (g) w += g[4];
    }
    return w * scale;
  }

  /** Greedy word wrap to a pixel width. */
  wrap(font: string, s: string, maxW: number, scale = 1): string[] {
    const out: string[] = [];
    let line = '';
    for (const word of s.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (line && this.textWidth(font, next, scale) > maxW) {
        out.push(line);
        line = word;
      } else line = next;
    }
    if (line) out.push(line);
    return out;
  }

  /** draw_text: fonts are the game's own atlases. halign: 0 left, 1 center, 2 right. */
  text(font: string, s: string, x: number, y: number, color: string = C.white, scale = 1, halign = 0, alpha = 1): void {
    const f = this.manifest.fonts[font];
    const atlas = this.fontAtlas(font, color);
    if (!f || !atlas) return;
    let cx = x;
    if (halign === 1) cx -= this.textWidth(font, s, scale) / 2;
    if (halign === 2) cx -= this.textWidth(font, s, scale);
    cx = Math.round(cx);
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha = alpha;
    for (const ch of s) {
      const g = f.glyphs[ch.codePointAt(0)!] ?? f.glyphs[63];
      if (!g) continue;
      const [gx, gy, gw, gh, shift, offset] = g;
      if (gw > 0 && gh > 0) ctx.drawImage(atlas, gx, gy, gw, gh, cx + offset * scale, Math.round(y), gw * scale, gh * scale);
      cx += shift * scale;
    }
    ctx.restore();
  }

  rect(x: number, y: number, w: number, h: number, color: string, alpha = 1): void {
    this.ctx.globalAlpha = alpha;
    this.ctx.fillStyle = color;
    this.ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    this.ctx.globalAlpha = 1;
  }

  outline(x: number, y: number, w: number, h: number, color: string, t = 1): void {
    this.rect(x, y, w, t, color);
    this.rect(x, y + h - t, w, t, color);
    this.rect(x, y, t, h, color);
    this.rect(x + w - t, y, t, h, color);
  }

  /** scr_darkbox: the dark-world text box with animated jewel corners. */
  darkbox(x1: number, y1: number, x2: number, y2: number, fill = true): void {
    if (fill) this.rect(x1 + 4, y1 + 4, x2 - x1 - 7, y2 - y1 - 7, C.black);
    const tw = x2 - x1 - 63;
    const th = y2 - y1 - 63;
    const jewel = this.time / 10;
    if (tw > 0) {
      this.sprite('spr_textbox_top', 0, x1 + 32, y1, tw, 2);
      this.sprite('spr_textbox_top', 0, x1 + 32, y2 + 1, tw, -2);
    }
    if (th > 0) {
      this.sprite('spr_textbox_left', 0, x2 + 1, y1 + 32, -2, th);
      this.sprite('spr_textbox_left', 0, x1, y1 + 32, 2, th);
    }
    this.sprite('spr_textbox_topleft', jewel, x1, y1, 2, 2);
    this.sprite('spr_textbox_topleft', jewel, x2 + 1, y1, -2, 2);
    this.sprite('spr_textbox_topleft', jewel, x1, y2 + 1, 2, -2);
    this.sprite('spr_textbox_topleft', jewel, x2 + 1, y2 + 1, -2, -2);
  }

  heart(x: number, y: number): void {
    this.sprite('spr_heart', 0, x, y);
  }

  clear(color: string = C.black): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, this.W, this.H);
  }

  // ---- sound ----
  attachAudio(ctx: AudioContext): void {
    this.audio = ctx;
    for (const f of this.manifest.sfx) {
      void fetch(`/ui/sfx/${f}`).then((r) => r.arrayBuffer()).then((b) => ctx.decodeAudioData(b)).then((buf) => {
        this.sfxBuffers.set(f.replace(/\.[a-z0-9]+$/, ''), buf);
      }).catch(() => {});
    }
  }

  sfx(name: 'snd_menumove' | 'snd_select' | 'snd_cantselect' | 'snd_equip' | 'snd_error' | 'snd_hurt1'): void {
    const buf = this.sfxBuffers.get(name);
    if (!buf || !this.audio) return;
    const src = this.audio.createBufferSource();
    src.buffer = buf;
    const gain = this.audio.createGain();
    gain.gain.value = this.sfxVolume;
    src.connect(gain).connect(this.audio.destination);
    src.start();
  }
}
