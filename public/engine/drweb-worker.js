// Runs the Butterscotch WASM runner inside a dedicated worker.
// Protocol (main -> worker): init, start, key, stop.  (worker -> main): progress, event, log, started, exit, error.

let Module = null;
let audio = null; // { ring: Float32Array, idx: Int32Array, cap: number, heapPtr: number, heapFrames: number, timer }
let keyDownPtr = 0;
let keyUpPtr = 0;
let running = false;
let opfsMounted = false;
let paused = false;
const keyDownAt = {};

const post = (msg, transfer) => self.postMessage(msg, transfer || []);

function onPrint(text) {
  const i = text.indexOf('@@DRWEB ');
  if (i >= 0) {
    const rest = text.slice(i + 8);
    const sp = rest.indexOf(' ');
    post({ type: 'event', name: sp < 0 ? rest : rest.slice(0, sp), data: sp < 0 ? '' : rest.slice(sp + 1) });
    return;
  }
  post({ type: 'log', level: 'info', text });
}

async function opfsDir(path, create = true) {
  let dir = await navigator.storage.getDirectory();
  for (const part of path.split('/').filter(Boolean)) dir = await dir.getDirectoryHandle(part, { create });
  return dir;
}

async function readText(dir, name) {
  try {
    const fh = await dir.getFileHandle(name);
    return await (await fh.getFile()).text();
  } catch {
    return null;
  }
}

async function writeFile(dir, name, data) {
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  if (data instanceof ReadableStream) await data.pipeTo(w);
  else { await w.write(data); await w.close(); }
}

/** Download the chapter bundle into OPFS, skipping files whose hash is already cached. */
async function syncFiles(bundle, files) {
  const root = await opfsDir(`games/${bundle}`);
  const cacheRaw = await readText(root, '.drweb-cache.json');
  const cache = cacheRaw ? JSON.parse(cacheRaw) : {};
  const todo = files.filter((f) => cache[f.path] !== f.hash);
  const total = todo.reduce((a, f) => a + f.size, 0);
  let loaded = 0;
  post({ type: 'progress', loaded, total });
  for (const f of todo) {
    const parts = f.path.split('/');
    const name = parts.pop();
    const dir = parts.length ? await opfsDir(`games/${bundle}/${parts.join('/')}`) : root;
    const res = await fetch(f.url);
    if (!res.ok) throw new Error(`download failed: ${f.url} (${res.status})`);
    const counter = new TransformStream({
      transform(chunk, ctl) {
        loaded += chunk.byteLength;
        post({ type: 'progress', loaded, total });
        ctl.enqueue(chunk);
      },
    });
    await writeFile(dir, name, res.body.pipeThrough(counter));
    cache[f.path] = f.hash;
    await writeFile(root, '.drweb-cache.json', JSON.stringify(cache));
  }
  post({ type: 'progress', loaded: total, total });
}

function startAudioPump(sab, idxSab, sampleRate) {
  const ring = new Float32Array(sab);
  const idx = new Int32Array(idxSab); // [writeFrame, readFrame]
  const cap = ring.length / 2;
  const heapFrames = 1024;
  const heapPtr = Module._malloc(heapFrames * 2 * 4);
  const target = Math.round(sampleRate * 0.06); // keep ~60ms buffered
  const pump = () => {
    if (!running || paused) return;
    let w = Atomics.load(idx, 0);
    const r = Atomics.load(idx, 1);
    let want = target - (w - r);
    while (want > 0) {
      const n = Math.min(want, heapFrames);
      Module._pullAudioFrames(heapPtr, n);
      const src = Module.HEAPF32.subarray(heapPtr >> 2, (heapPtr >> 2) + n * 2);
      for (let i = 0; i < n; i++) {
        const o = ((w + i) % cap) * 2;
        ring[o] = src[i * 2];
        ring[o + 1] = src[i * 2 + 1];
      }
      w += n;
      Atomics.store(idx, 0, w);
      want -= n;
    }
  };
  audio = { timer: setInterval(pump, 5), heapPtr };
}

async function start(msg) {
  try {
    await syncFiles(msg.bundle, msg.files);
    const saves = await opfsDir(`saves/${msg.bundle}`);
    await writeFile(saves, 'drweb.ini', msg.ini);

    if (!opfsMounted) {
      if (Module._mountOpfs() !== 0) throw new Error('could not mount OPFS');
      opfsMounted = true;
    }
    keyDownPtr = Module._getKeyDownPtr();
    keyUpPtr = Module._getKeyUpPtr();
    Module._setAudioSampleRate(msg.sampleRate);
    running = true;
    Module.ccall('startRunner', null, ['string', 'string'], [
      `/butterscotch/games/${msg.bundle}/${msg.dataPath}`,
      `/butterscotch/saves/${msg.bundle}`,
    ]);
    if (msg.audioSab) startAudioPump(msg.audioSab, msg.audioIdx, msg.sampleRate);
    post({ type: 'started' });
  } catch (e) {
    post({ type: 'error', message: String(e && e.stack ? e.stack : e) });
  }
}

self.onmessage = async (ev) => {
  const msg = ev.data;
  switch (msg.type) {
    case 'init': {
      try {
        const { default: createButterscotch } = await import(msg.engineUrl);
        Module = await createButterscotch({
          print: onPrint,
          printErr: (t) => post({ type: 'log', level: 'error', text: t }),
          locateFile: (p) => new URL(p, msg.engineUrl).href,
        });
        Module.specialHTMLTargets['#canvas'] = msg.canvas;
        post({ type: 'ready' });
      } catch (e) {
        post({ type: 'error', message: String(e && e.stack ? e.stack : e) });
      }
      break;
    }
    case 'start':
      await start(msg);
      break;
    case 'key': {
      if (!Module || !keyDownPtr) break;
      // Every press must be visible for at least one game frame (33ms), or the game never sees a quick tap.
      const now = performance.now();
      if (msg.down) {
        keyDownAt[msg.code] = now;
        Module.HEAPU8[keyDownPtr + msg.code] = 1;
      } else {
        const wait = 40 - (now - (keyDownAt[msg.code] ?? 0));
        const code = msg.code;
        if (wait > 0) setTimeout(() => { Module.HEAPU8[keyUpPtr + code] = 1; }, wait);
        else Module.HEAPU8[keyUpPtr + code] = 1;
      }
      break;
    }
    case 'pause':
      paused = !!msg.paused;
      if (Module && running) Module._setPaused(paused ? 1 : 0);
      break;
    case 'stop':
      if (Module && running) Module._stopRunner();
      running = false;
      break;
  }
};

