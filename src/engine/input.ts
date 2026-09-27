// Keyboard + gamepad input, translated to GameMaker virtual key codes and forwarded to the runner.

export const VK = {
  BACKSPACE: 8, TAB: 9, ENTER: 13, SHIFT: 16, CONTROL: 17, ESCAPE: 27, SPACE: 32,
  LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40,
  C: 67, X: 88, Z: 90,
} as const;

/** KeyboardEvent.code -> GameMaker vk code. */
export function vkFromCode(code: string): number | null {
  if (/^Key[A-Z]$/.test(code)) return code.charCodeAt(3);
  if (/^Digit[0-9]$/.test(code)) return code.charCodeAt(5);
  if (/^Numpad[0-9]$/.test(code)) return 96 + Number(code.slice(6));
  if (/^F([1-9]|1[0-2])$/.test(code)) return 111 + Number(code.slice(1));
  switch (code) {
    case 'ArrowLeft': return VK.LEFT;
    case 'ArrowUp': return VK.UP;
    case 'ArrowRight': return VK.RIGHT;
    case 'ArrowDown': return VK.DOWN;
    case 'Enter': case 'NumpadEnter': return VK.ENTER;
    case 'ShiftLeft': case 'ShiftRight': return VK.SHIFT;
    case 'ControlLeft': case 'ControlRight': return VK.CONTROL;
    case 'Escape': return VK.ESCAPE;
    case 'Space': return VK.SPACE;
    case 'Backspace': return VK.BACKSPACE;
    case 'Tab': return VK.TAB;
  }
  return null;
}

export type Action = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'cancel' | 'menu';
export const ACTIONS: Action[] = ['up', 'down', 'left', 'right', 'confirm', 'cancel', 'menu'];

/** Which game key each action presses, and which physical keys trigger it. */
export const ACTION_VK: Record<Action, number> = {
  up: VK.UP, down: VK.DOWN, left: VK.LEFT, right: VK.RIGHT, confirm: VK.Z, cancel: VK.X, menu: VK.C,
};

export interface Bindings {
  keys: Record<Action, string[]>;
  pad: Record<Action, number[]>;
}

export const DEFAULT_BINDINGS: Bindings = {
  keys: {
    up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'],
    confirm: ['KeyZ', 'Enter'], cancel: ['KeyX', 'ShiftLeft', 'ShiftRight'], menu: ['KeyC', 'ControlLeft', 'ControlRight'],
  },
  // Standard gamepad mapping: 0=A/Cross 1=B/Circle 2=X/Square 3=Y/Triangle 12-15=dpad
  pad: { up: [12], down: [13], left: [14], right: [15], confirm: [0], cancel: [1], menu: [3] },
};

type Sink = (vk: number, down: boolean) => void;

/**
 * Collects keyboard + gamepad state. Physical keys that are bound to an action are sent as the action's
 * game key (so remapping works); unbound keys pass through unchanged so the game still sees e.g. Escape.
 */
export class InputRouter {
  private held = new Map<number, number>(); // vk -> number of sources holding it
  private padHeld = new Set<string>();
  private raf = 0;
  bindings: Bindings;
  private sink: Sink | null = null;
  private deadzone = 0.5;

  constructor(bindings: Bindings = DEFAULT_BINDINGS) {
    this.bindings = bindings;
  }

  attach(sink: Sink): void {
    this.sink = sink;
    window.addEventListener('keydown', this.onKey, true);
    window.addEventListener('keyup', this.onKey, true);
    window.addEventListener('blur', this.releaseAll);
    const poll = () => { this.pollPads(); this.raf = requestAnimationFrame(poll); };
    this.raf = requestAnimationFrame(poll);
  }

  detach(): void {
    this.releaseAll();
    window.removeEventListener('keydown', this.onKey, true);
    window.removeEventListener('keyup', this.onKey, true);
    window.removeEventListener('blur', this.releaseAll);
    cancelAnimationFrame(this.raf);
    this.sink = null;
  }

  private press(vk: number, down: boolean): void {
    const n = this.held.get(vk) ?? 0;
    const next = down ? n + 1 : Math.max(0, n - 1);
    this.held.set(vk, next);
    if (down && n === 0) this.sink?.(vk, true);
    if (!down && n > 0 && next === 0) this.sink?.(vk, false);
  }

  private actionForKey(code: string): Action | null {
    for (const a of ACTIONS) if (this.bindings.keys[a].includes(code)) return a;
    return null;
  }

  private onKey = (e: KeyboardEvent): void => {
    if (e.repeat) { e.preventDefault(); return; }
    const action = this.actionForKey(e.code);
    const vk = action ? ACTION_VK[action] : vkFromCode(e.code);
    if (vk === null) return;
    if (e.code === 'F11' || e.code === 'F12' || (e.ctrlKey && e.code === 'KeyR')) return; // leave browser shortcuts alone
    e.preventDefault();
    this.press(vk, e.type === 'keydown');
  };

  private releaseAll = (): void => {
    for (const [vk, n] of this.held) if (n > 0) this.sink?.(vk, false);
    this.held.clear();
    this.padHeld.clear();
  };

  private pollPads(): void {
    const pads = navigator.getGamepads?.() ?? [];
    const now = new Set<string>();
    for (const pad of pads) {
      if (!pad) continue;
      for (const a of ACTIONS) {
        let on = this.bindings.pad[a].some((b) => pad.buttons[b]?.pressed);
        if (!on && pad.axes.length >= 2) {
          const [ax, ay] = pad.axes;
          if (a === 'left') on = ax < -this.deadzone;
          if (a === 'right') on = ax > this.deadzone;
          if (a === 'up') on = ay < -this.deadzone;
          if (a === 'down') on = ay > this.deadzone;
        }
        if (on) now.add(a);
      }
    }
    for (const a of now) if (!this.padHeld.has(a)) this.press(ACTION_VK[a as Action], true);
    for (const a of this.padHeld) if (!now.has(a)) this.press(ACTION_VK[a as Action], false);
    this.padHeld = now;
  }
}
