// module-code.js と小さな HTML から、delivery-flow.md §6.2 の形のバンドル JSON を作る。
// 使い方: node spikes/T1-2-template/make-bundle.mjs
//   gas/InitialBundle.js: ローダーに同梱する初期のコード。手で直さない
//   out/ouca-bundle.json: 同じバンドルの JSON（確認用。送られない）
// アプリのビルド（npm run build）は要らない。HTML は小さなものをここに書いている。
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const version = '0.0.0-spike-T12';

const serverSource = readFileSync(resolve(here, 'module-code.js'), 'utf8');
const html = `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <title>T1-2 テンプレート</title>
  </head>
  <body>
    <h1>OUCA T1-2 テンプレートの検証</h1>
    <p>非表示のタブ「_コード」に保存した HTML。画面の隅の帯は、保存したコードが足す。</p>
  </body>
</html>
`;

const bundle = {
  app: 'ouca',
  version,
  schemaVersion: 1,
  notes: 'T1-2 の検証用（初期のコード）',
  files: [
    { name: 'Code', type: 'SERVER_JS', source: serverSource },
    { name: 'index', type: 'HTML', source: html },
  ],
};
const json = JSON.stringify(bundle);

const outDir = resolve(here, 'out');
mkdirSync(outDir, { recursive: true });
const out = resolve(outDir, 'ouca-bundle.json');
writeFileSync(out, json);
console.log(
  `作りました: ${out}（バージョン ${version}、${Buffer.byteLength(json)} バイト、` +
    `サーバーのモジュール ${Buffer.byteLength(serverSource)} バイト、HTML ${Buffer.byteLength(html)} バイト）`,
);

const initial = resolve(here, 'gas/InitialBundle.js');
writeFileSync(
  initial,
  `// make-bundle.mjs が作る。ローダーに同梱する初期のコード。手で直さない。\nconst INITIAL_BUNDLE = ${json};\n`,
);
console.log(`作りました: ${initial}`);
