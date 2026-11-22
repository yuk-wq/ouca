// code-module.js と dist/index.html から、delivery-flow.md §6.2 の形のバンドル JSON を作る。
// 使い方: node spikes/T1-1-loader/make-bundle.mjs <A|B> [リリースのバージョン] [--pad=<KB>]
//   B  -> out/ouca-bundle.json（リリースに添付する）
//   A  -> out/ouca-bundle-A.json と、ローダーに同梱する gas/InitialBundle.js
//   --pad は HTML にコメントを足し、バンドルを大きくする（読み込み時間を大きさ別に測るため）
// 先に npm run build で dist/index.html を作っておく。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const args = process.argv.slice(2);
const padArg = args.find((a) => a.startsWith('--pad='));
const positional = args.filter((a) => !a.startsWith('--'));
const [label = 'B', version = `0.0.0-spike-${label}`] = positional;
const padKb = padArg ? Number(padArg.slice(6)) : 0;

if (!/^[A-Za-z0-9]+$/.test(label) || !Number.isFinite(padKb) || padKb < 0) {
  console.error('使い方: make-bundle.mjs <英数字のコードの区別> [バージョン] [--pad=<KB>]');
  process.exit(1);
}
const htmlPath = resolve(root, 'dist/index.html');
if (!existsSync(htmlPath)) {
  console.error('dist/index.html がありません。先に npm run build を実行してください。');
  process.exit(1);
}

const declaration = /^const CODE_LABEL = '[^']*';$/gm;
const template = readFileSync(resolve(here, 'code-module.js'), 'utf8');
if ((template.match(declaration) ?? []).length !== 1) {
  console.error('code-module.js に CODE_LABEL の宣言が 1 つだけ必要です。');
  process.exit(1);
}
const serverSource = template.replace(declaration, () => `const CODE_LABEL = '${label}';`);
const pad = padKb ? `<!-- pad ${'x'.repeat(padKb * 1024)} -->\n` : '';
const rawHtml = readFileSync(htmlPath, 'utf8');
const marker = `<div id="t11-html-marker" style="font:12px sans-serif;background:#eef">HTML コード ${label}</div>`;
const bodyTag = /<body[^>]*>/.exec(rawHtml);
if (!bodyTag) {
  console.error('dist/index.html に <body> がありません。');
  process.exit(1);
}
const at = bodyTag.index + bodyTag[0].length;
const html = `<!-- T1-1 コード ${label} -->\n${pad}${rawHtml.slice(0, at)}${marker}${rawHtml.slice(at)}`;
const manifest = readFileSync(resolve(here, 'gas/appsscript.json'), 'utf8');

const bundle = {
  app: 'ouca',
  version,
  schemaVersion: 1,
  notes: `T1-1 の検証用（コード ${label}）`,
  files: [
    { name: 'appsscript', type: 'JSON', source: manifest },
    { name: 'Code', type: 'SERVER_JS', source: serverSource },
    { name: 'index', type: 'HTML', source: html },
  ],
};
const json = JSON.stringify(bundle);

const outDir = resolve(here, 'out');
mkdirSync(outDir, { recursive: true });
const out = resolve(outDir, label === 'B' ? 'ouca-bundle.json' : `ouca-bundle-${label}.json`);
writeFileSync(out, json);
console.log(
  `作りました: ${out}（コード ${label}、バージョン ${version}、${Buffer.byteLength(json)} バイト、` +
    `サーバーのモジュール ${Buffer.byteLength(serverSource)} バイト、HTML ${Buffer.byteLength(html)} バイト）`,
);

if (label === 'A') {
  const initial = resolve(here, 'gas/InitialBundle.js');
  writeFileSync(
    initial,
    `// make-bundle.mjs A が作る。ローダーに同梱する最初のコード（コード A）。手で直さない。\nconst INITIAL_BUNDLE = ${json};\n`,
  );
  console.log(`作りました: ${initial}`);
}
