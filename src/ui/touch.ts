// On-screen controls for phones and tablets: an 8-way D-pad, Z / X / C, and pause. Only shown on touch devices.
import type { Action } from '../engine/input.ts';

type Press = (action: Action, down: boolean) => void;

const DIRS: Action[] = ['up', 'down', 'left', 'right'];

export function isTouchDevice(): boolean {
  // iPadOS Safari reports itself as a Mac, so also trust maxTouchPoints.
  return window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window || navigator.maxTouchPoints > 1;
}

export function mountTouchControls(root: HTMLElement, press: Press, pause: () => void): void {
  const wrap = document.createElement('div');
  wrap.id = 'touch';
  wrap.innerHTML = `
    <div class="t-pad" aria-label="D-pad"><div class="t-cross"></div></div>
    <div class="t-btns">
      <button class="t-btn t-c" aria-label="Menu (C)">C</button>
      <button class="t-btn t-x" aria-label="Cancel (X)">X</button>
      <button class="t-btn t-z" aria-label="Confirm (Z)">Z</button>
    </div>
    <button class="t-pause" aria-label="Pause">II</button>`;
  root.appendChild(wrap);
  document.body.classList.add('has-touch');

  // ---- D-pad: the touch position picks up to two directions (diagonals), updated as the thumb slides.
  const pad = wrap.querySelector<HTMLElement>('.t-pad')!;
  const held = new Set<Action>();
  const setHeld = (next: Set<Action>) => {
    for (const a of DIRS) {
      if (next.has(a) && !held.has(a)) { held.add(a); press(a, true); }
      if (!next.has(a) && held.has(a)) { held.delete(a); press(a, false); }
    }
  };
  let padPointer: number | null = null;
  const fromPoint = (e: PointerEvent) => {
    const r = pad.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    const next = new Set<Action>();
    const dead = r.width * 0.12;
    if (Math.hypot(dx, dy) > dead) {
      const ang = Math.atan2(dy, dx); // 8 sectors of 45 degrees
      const sector = Math.round(ang / (Math.PI / 4));
      const map: Record<number, Action[]> = {
        0: ['right'], 1: ['right', 'down'], 2: ['down'], 3: ['down', 'left'],
        4: ['left'], [-4]: ['left'], [-3]: ['left', 'up'], [-2]: ['up'], [-1]: ['up', 'right'],
      };
      for (const a of map[sector] ?? []) next.add(a);
    }
    setHeld(next);
    pad.dataset.dir = [...next].join(' ');
  };
  pad.addEventListener('pointerdown', (e) => { e.preventDefault(); padPointer = e.pointerId; pad.setPointerCapture(e.pointerId); fromPoint(e); });
  pad.addEventListener('pointermove', (e) => { if (e.pointerId === padPointer) fromPoint(e); });
  const padUp = (e: PointerEvent) => { if (e.pointerId !== padPointer) return; padPointer = null; setHeld(new Set()); pad.dataset.dir = ''; };
  pad.addEventListener('pointerup', padUp);
  pad.addEventListener('pointercancel', padUp);

  // ---- Buttons
  const bind = (sel: string, action: Action) => {
    const el = wrap.querySelector<HTMLElement>(sel)!;
    const down = (e: PointerEvent) => { e.preventDefault(); el.setPointerCapture(e.pointerId); el.classList.add('on'); press(action, true); };
    const up = (e: PointerEvent) => { if (!el.classList.contains('on')) return; e.preventDefault(); el.classList.remove('on'); press(action, false); };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  };
  bind('.t-z', 'confirm');
  bind('.t-x', 'cancel');
  bind('.t-c', 'menu');
  wrap.querySelector<HTMLElement>('.t-pause')!.addEventListener('pointerdown', (e) => { e.preventDefault(); pause(); });

  // No pinch-zoom, double-tap zoom or pull-to-refresh while playing.
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault());
}
