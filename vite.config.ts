import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

const { version } = JSON.parse(
  readFileSync(resolve(import.meta.dirname, 'package.json'), 'utf8'),
) as {
  version: string;
};

export default defineConfig({
  root: resolve(import.meta.dirname, 'src/client'),
  plugins: [preact(), viteSingleFile()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  build: {
    outDir: resolve(import.meta.dirname, 'dist'),
    emptyOutDir: true,
    target: 'es2020',
  },
});
