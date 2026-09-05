import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root,
  base: '/high/',
  publicDir: 'public',
  build: {
    outDir: '../dist/high',
    emptyOutDir: true,
    sourcemap: true
  }
});
