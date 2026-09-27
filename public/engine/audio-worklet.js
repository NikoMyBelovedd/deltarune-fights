// Plays interleaved stereo float frames produced by the runner worker through a SharedArrayBuffer ring.
class DrwebRingPlayer extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const { ring, idx } = options.processorOptions;
    this.ring = new Float32Array(ring);
    this.idx = new Int32Array(idx); // [writeFrame, readFrame]
    this.cap = this.ring.length / 2;
    this.volume = 1;
    this.port.onmessage = (e) => { if (typeof e.data.volume === 'number') this.volume = e.data.volume; };
  }

  process(_inputs, outputs) {
    const out = outputs[0];
    const L = out[0];
    const R = out[1] || out[0];
    const n = L.length;
    const w = Atomics.load(this.idx, 0);
    let r = Atomics.load(this.idx, 1);
    const avail = w - r;
    // If the writer ran far ahead (tab was throttled), drop the backlog to keep latency low.
    if (avail > this.cap / 2) r = w - n;
    const v = this.volume;
    for (let i = 0; i < n; i++) {
      if (r < w) {
        const o = (r % this.cap) * 2;
        L[i] = this.ring[o] * v;
        R[i] = this.ring[o + 1] * v;
        r++;
      } else {
        L[i] = 0;
        R[i] = 0;
      }
    }
    Atomics.store(this.idx, 1, r);
    return true;
  }
}

registerProcessor('drweb-ring-player', DrwebRingPlayer);
