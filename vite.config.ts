import { defineConfig } from 'vite';

// SharedArrayBuffer (threads + audio ring) requires cross-origin isolation.
const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  server: { headers: isolation, port: 5317 },
  preview: { headers: isolation, port: 5318 },
  build: { target: 'es2022' },
});
