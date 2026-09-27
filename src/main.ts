import { App } from './ui/app.ts';

const root = document.getElementById('root')!;
const app = new App(root);
app.boot().catch((e: unknown) => {
  const el = document.getElementById('fatal')!;
  el.textContent = String((e as Error)?.message ?? e);
  el.hidden = false;
});
