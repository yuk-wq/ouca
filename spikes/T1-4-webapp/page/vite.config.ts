// 本番の vite.config.ts と同じプラグインと target。出力は out/index.html で、make-page.mjs が gas/Page.html にする。
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  root: import.meta.dirname,
  plugins: [preact(), viteSingleFile()],
  build: {
    outDir: resolve(import.meta.dirname, '../out'),
    emptyOutDir: true,
    target: 'es2020',
  },
});
