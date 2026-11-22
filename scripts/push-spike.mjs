// spikes/<名前>/gas をテスト用スクリプトに丸ごと送る（技術検証用）。本番には送らない。
// 使い方: npm run push:spike -- T1-1-self-update
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readTestScriptId } from './test-script-id.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const name = process.argv[2];

if (!name || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) {
  console.error('使い方: npm run push:spike -- <spikes 以下のフォルダ名>（例 T1-1-self-update）');
  process.exit(1);
}
const rootDir = `spikes/${name}/gas`;
if (!existsSync(resolve(root, rootDir, 'appsscript.json'))) {
  console.error(`${rootDir}/appsscript.json がありません。フォルダ名を確かめてください。`);
  process.exit(1);
}

const scriptId = readTestScriptId(root);

// .clasp*.json は .gitignore 済み。rootDir は設定ファイルのあるフォルダからの相対
const tmpConfig = resolve(root, '.clasp.spike-tmp.json');
writeFileSync(tmpConfig, JSON.stringify({ scriptId, rootDir }));
try {
  // --force: マニフェストの上書きを確かめる問いを出さない（spikes 側のマニフェストを正とする）
  const push = spawnSync('npx', ['clasp', '-P', tmpConfig, 'push', '--force'], {
    cwd: root,
    stdio: 'inherit',
  });
  process.exitCode = push.status ?? 1;
} finally {
  rmSync(tmpConfig, { force: true });
}
