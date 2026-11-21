// gas/ のコードから、delivery-flow.md §6.2 の形のバンドル JSON を out/ouca-bundle.json に作る。
// 使い方: node spikes/T1-1-self-update/make-bundle.mjs [コードの区別（既定 B）] [リリースのバージョン]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const [label = 'B', version = `0.0.0-spike-${label}`] = process.argv.slice(2);

if (!/^[A-Za-z0-9]+$/.test(label)) {
  console.error('コードの区別は英数字だけにしてください。');
  process.exit(1);
}

const declaration = /^const SPIKE_CODE_LABEL = '[^']*';$/gm;
const source = readFileSync(resolve(here, 'gas/Code.js'), 'utf8');
if ((source.match(declaration) ?? []).length !== 1) {
  console.error('gas/Code.js に SPIKE_CODE_LABEL の宣言が 1 つだけ必要です。');
  process.exit(1);
}
const code = source.replace(declaration, () => `const SPIKE_CODE_LABEL = '${label}';`);
const manifest = readFileSync(resolve(here, 'gas/appsscript.json'), 'utf8');

const bundle = {
  app: 'ouca',
  version,
  schemaVersion: 1,
  notes: `T1-1 の検証用（コード ${label}）`,
  files: [
    { name: 'appsscript', type: 'JSON', source: manifest },
    { name: 'Code', type: 'SERVER_JS', source: code },
  ],
};

const outDir = resolve(here, 'out');
mkdirSync(outDir, { recursive: true });
const out = resolve(outDir, 'ouca-bundle.json');
writeFileSync(out, JSON.stringify(bundle));
console.log(`作りました: ${out}（コード ${label}、バージョン ${version}）`);
