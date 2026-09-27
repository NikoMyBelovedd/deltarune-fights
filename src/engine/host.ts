// Main-thread side of the runner: owns the canvas, audio output and the worker.

export interface BundleFile { path: string; url: string; size: number; hash: string; gzip?: boolean; parts?: { url: string; size: number }[] }
export interface BundleManifest { bundle: string; dataPath: string; files: BundleFile[] }

export type HostEvent =
  | { type: 'progress'; loaded: number; total: number }
  | { type: 'event'; name: string; data: string }
  | { type: 'log'; level: string; text: string }
  | { type: 'started' }
  | { type: 'exit' }
  | { type: 'error'; message: string };

const ENGINE_URL = new URL('/engine/butterscotch.mjs', location.href).href;
const WORKER_URL = '/engine/drweb-worker.js';
const WORKLET_URL = '/engine/audio-worklet.js';

export class GameHost {
  private worker: Worker | null = null;
  private ctx: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private listeners = new Set<(e: HostEvent) => void>();
  private volume = 1;
  canvas: HTMLCanvasElement | null = null;

  on(fn: (e: HostEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(e: HostEvent): void {
    for (const fn of this.listeners) fn(e);
  }

  /** Starts a chapter bundle with the given drweb.ini config. Creates a fresh canvas + worker each time. */
  async start(mount: HTMLElement, manifest: BundleManifest, ini: string): Promise<void> {
    this.stop();
    if (!crossOriginIsolated) throw new Error('This page must be cross-origin isolated (COOP/COEP headers).');

    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    canvas.className = 'game-canvas';
    canvas.id = 'canvas';
    mount.replaceChildren(canvas);
    this.canvas = canvas;
    const offscreen = canvas.transferControlToOffscreen();

    // Audio: 16384-frame stereo ring shared with the worker (writer) and the worklet (reader).
    this.ctx ??= new AudioContext({ latencyHint: 'interactive' });
    const ring = new SharedArrayBuffer(16384 * 2 * 4);
    const idx = new SharedArrayBuffer(8);
    await this.ctx.audioWorklet.addModule(WORKLET_URL);
    this.node = new AudioWorkletNode(this.ctx, 'drweb-ring-player', {
      numberOfOutputs: 1,
      outputChannelCount: [2],
      processorOptions: { ring, idx },
    });
    this.node.port.postMessage({ volume: this.volume });
    this.node.connect(this.ctx.destination);
    void this.ctx.resume();

    const worker = new Worker(WORKER_URL, { type: 'module', name: 'drweb-runner' });
    this.worker = worker;
    await new Promise<void>((resolve, reject) => {
      worker.onmessage = (ev: MessageEvent) => {
        const m = ev.data;
        if (m.type === 'ready') { resolve(); return; }
        if (m.type === 'error') reject(new Error(m.message));
        this.emit(m as HostEvent);
      };
      worker.onerror = (e) => reject(new Error(e.message));
      worker.postMessage({ type: 'init', engineUrl: ENGINE_URL, canvas: offscreen }, [offscreen]);
    });
    worker.onmessage = (ev: MessageEvent) => this.emit(ev.data as HostEvent);
    worker.postMessage({
      type: 'start',
      bundle: manifest.bundle,
      dataPath: manifest.dataPath,
      files: manifest.files,
      ini,
      sampleRate: this.ctx.sampleRate,
      audioSab: ring,
      audioIdx: idx,
    });
  }

  key(code: number, down: boolean): void {
    this.worker?.postMessage({ type: 'key', code, down });
  }

  pause(paused: boolean): void {
    this.worker?.postMessage({ type: 'pause', paused });
  }

  setVolume(v: number): void {
    this.volume = v;
    this.node?.port.postMessage({ volume: v });
  }

  resumeAudio(): void {
    void this.ctx?.resume();
  }

  stop(): void {
    if (this.worker) {
      this.worker.postMessage({ type: 'stop' });
      const w = this.worker;
      setTimeout(() => w.terminate(), 250);
      this.worker = null;
    }
    if (this.node) {
      this.node.disconnect();
      this.node = null;
    }
    this.canvas?.remove();
    this.canvas = null;
  }

  get running(): boolean {
    return this.worker !== null;
  }
}
