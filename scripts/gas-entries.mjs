// 入口の一覧の決まりの確かめと、一番外側の関数の生成（docs/to-be/design.md §3.3）。
// 一覧は { name, kind } の配列。kind ごとに、末尾 _ の有無と名前の制限が決まる。
const KINDS = {
  webapp: { underscore: false, names: ['doGet'] },
  api: { underscore: false },
  admin: { underscore: false, names: ['adminCall'] },
  simpleTrigger: { underscore: false, names: ['onOpen', 'onEdit'] },
  ownerButton: { underscore: false },
  ownerMenu: { underscore: true },
  installedTrigger: { underscore: true },
};

export function checkEntries(list) {
  const seen = new Set();
  for (const { name, kind } of list) {
    const rule = Object.hasOwn(KINDS, kind) ? KINDS[kind] : undefined;
    if (!rule) throw new Error(`知らない種類: ${name} (${kind})`);
    if (!/^[A-Za-z_$][\w$]*$/.test(name)) {
      throw new Error(`名前が JavaScript の識別子の形でない: ${name}`);
    }
    if (name === 'OUCA_') throw new Error('OUCA_ は esbuild の包みの名前なので、入口にできない');
    if (seen.has(name)) throw new Error(`名前が重複している: ${name}`);
    seen.add(name);
    if (name.endsWith('_') !== rule.underscore) {
      throw new Error(
        `${kind} の入口は末尾 _ を${rule.underscore ? '付ける' : '付けない'}: ${name}`,
      );
    }
    if (rule.names && !rule.names.includes(name)) {
      throw new Error(`${kind} の名前は ${rule.names.join('、')} に限る: ${name}`);
    }
  }
}

export function makeEntryFooter(list) {
  return list
    .map(({ name }) => `function ${name}() { return OUCA_.${name}.apply(null, arguments); }`)
    .join('\n');
}
