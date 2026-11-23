// page/ の型を検査し、Vite でビルドして、gas/Page.html を作る。npm run push:spike の前に動かす。
// 使い方: node spikes/T1-4-webapp/make-page.mjs
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));
process.env.NODE_ENV = 'production';

// 先に型を検査する。誤りがあれば、ビルドせずに止まる
const tsc = spawnSync('npx', ['tsc', '-p', resolve(here, 'page'), '--noEmit'], {
  cwd: resolve(here, '../..'),
  stdio: 'inherit',
});
if (tsc.status !== 0) {
  console.error('page/ の型の検査に失敗しました。');
  process.exit(1);
}

await build({ configFile: resolve(here, 'page/vite.config.ts'), logLevel: 'warn' });

const built = resolve(here, 'out/index.html');
if (!existsSync(built)) {
  console.error('out/index.html ができていません。');
  process.exit(1);
}
copyFileSync(built, resolve(here, 'gas/Page.html'));
console.log('built: spikes/T1-4-webapp/gas/Page.html');
