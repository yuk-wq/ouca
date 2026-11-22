// テスト用スクリプトにだけ送る。既定の .clasp.json は使わない（間違った先に送らないため）。
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readTestScriptId } from './test-script-id.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const config = resolve(root, '.clasp.test.json');

readTestScriptId(root);

const run = (cmd, args) => spawnSync(cmd, args, { cwd: root, stdio: 'inherit' });

if (run(process.execPath, [resolve(root, 'scripts/build.mjs')]).status !== 0) process.exit(1);
// -P で設定ファイルを明示する。rootDir（dist）は設定ファイルのあるフォルダからの相対
// --force: マニフェストの上書きを確かめる問いを出さない（リポジトリの appsscript.json を正とする）
// テスト用スクリプトの中身とマニフェストは dist/ で丸ごと置き換わる。エディタでの変更は残らない
const push = run('npx', ['clasp', '-P', config, 'push', '--force']);
process.exit(push.status ?? 1);
