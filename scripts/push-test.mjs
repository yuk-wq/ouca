// テスト用スクリプトにだけ送る。既定の .clasp.json は使わない（間違った先に送らないため）。
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const config = resolve(root, '.clasp.test.json');

const steps = [
  '  1. cp .clasp.test.example.json .clasp.test.json',
  '  2. .clasp.test.json の scriptId を、テスト用スクリプトの ID に書き換える',
  '     （スクリプトのエディタの「プロジェクトの設定」にある「スクリプト ID」）',
  '  3. script.google.com/home/usersettings で「Google Apps Script API」をオンにする（初回だけ）',
  '  4. npx clasp login（初回だけ）',
  '.clasp.test.json はコミットしません（.gitignore 済み）。',
];

const stop = (message) => {
  console.error([message, ...steps].join('\n'));
  process.exit(1);
};

if (!existsSync(config)) stop('.clasp.test.json がありません。次の手順で作ってください。');

let scriptId;
try {
  scriptId = JSON.parse(readFileSync(config, 'utf8')).scriptId;
} catch {
  stop('.clasp.test.json を JSON として読めません。次の手順で作り直してください。');
}
if (typeof scriptId !== 'string' || scriptId.trim() === '' || scriptId.startsWith('<')) {
  stop('.clasp.test.json の scriptId がまだ書き換えられていません。次の手順を確かめてください。');
}

const run = (cmd, args) => spawnSync(cmd, args, { cwd: root, stdio: 'inherit' });

if (run(process.execPath, [resolve(root, 'scripts/build.mjs')]).status !== 0) process.exit(1);
// -P で設定ファイルを明示する。rootDir（dist）は設定ファイルのあるフォルダからの相対
// --force: マニフェストの上書きを確かめる問いを出さない（リポジトリの appsscript.json を正とする）
// テスト用スクリプトの中身とマニフェストは dist/ で丸ごと置き換わる。エディタでの変更は残らない
const push = run('npx', ['clasp', '-P', config, 'push', '--force']);
process.exit(push.status ?? 1);
