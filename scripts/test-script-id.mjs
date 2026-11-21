// テスト用スクリプトの ID を .clasp.test.json から読む。push-test.mjs と push-spike.mjs が使う。
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

export const testConfigPath = (root) => resolve(root, '.clasp.test.json');

// 読めなければ案内を出して終了する
export const readTestScriptId = (root) => {
  const config = testConfigPath(root);
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
  return scriptId;
};
