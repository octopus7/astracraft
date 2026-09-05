import { defineConfig } from 'vite';
import { cpSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = import.meta.dirname;
const pages = Object.fromEntries([
  ['portal', resolve(root, 'index.html')],
  ...readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isDirectory()
      && existsSync(resolve(root, entry.name, 'index.html'))
      && (existsSync(resolve(root, entry.name, 'src', 'main.js')) || existsSync(resolve(root, entry.name, 'main.js'))))
    .map(entry => [entry.name, resolve(root, entry.name, 'index.html')])
]);

export default defineConfig({
  appType: 'mpa',
  build: { rollupOptions: { input: pages } },
  plugins: [{
    name: 'copy-portable-game-assets',
    closeBundle() {
      for (const page of Object.keys(pages).filter(name => name !== 'portal')) {
        const from = resolve(root, page, 'assets');
        if (existsSync(from)) cpSync(from, resolve(root, 'dist', page, 'assets'), { recursive: true });
      }
    }
  }]
});
