import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

// dist/ を使うテストのために、テストの前に画面とサーバーをビルドする
export default function setup(): void {
  execFileSync(process.execPath, [resolve(__dirname, '../scripts/build.mjs')], {
    stdio: 'inherit',
  });
}
