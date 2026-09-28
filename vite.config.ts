import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// SharedArrayBuffer (threads + audio ring) requires cross-origin isolation.
const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  // HTTPS=1 serves over a self-signed cert so LAN devices get a secure (cross-origin isolated) context.
  plugins: process.env.HTTPS ? [basicSsl()] : [],
  server: { headers: isolation, port: 5317 },
  preview: { headers: isolation, port: 5318 },
  build: { target: 'es2022' },
});