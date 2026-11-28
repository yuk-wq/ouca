// 画面（Vite）とサーバー（esbuild）をビルドして dist/ に出す。
import { build as viteBuild } from 'vite';
import { build as esbuild } from 'esbuild';
import { copyFileSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GAS_ENTRIES } from './gas-globals.mjs';
import { checkEntries, makeEntryFooter } from './gas-entries.mjs';

process.env.NODE_ENV = 'production';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
const { version } = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));

// 0. 入口の一覧の決まりを確かめる
checkEntries(GAS_ENTRIES);

// 1. 画面。emptyOutDir で dist/ を空にするので、必ず最初に動かす
await viteBuild({ configFile: resolve(root, 'vite.config.ts'), logLevel: 'warn' });

// 2. サーバー。IIFE の中の関数は GAS から見えないので、入口の関数をトップレベルに生成する
const footer = makeEntryFooter(GAS_ENTRIES);

await esbuild({
  entryPoints: [resolve(root, 'src/server/main.ts')],
  outfile: resolve(dist, 'Code.js'),
  bundle: true,
  format: 'iife',
  globalName: 'OUCA_',
  target: 'es2020',
  platform: 'neutral',
  footer: { js: footer },
  define: { __APP_VERSION__: JSON.stringify(version) },
  logLevel: 'warning',
});

// 3. マニフェスト
copyFileSync(resolve(root, 'appsscript.json'), resolve(dist, 'appsscript.json'));
console.log('built: dist/Code.js, dist/index.html, dist/appsscript.json');
