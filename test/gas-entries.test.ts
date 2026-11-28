import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
// @ts-expect-error .mjs には型がない
import { checkEntries, makeEntryFooter } from '../scripts/gas-entries.mjs';

type Entry = { name: string; kind: string };

// 7種類をすべて含む架空の一覧（docs/to-be/design.md §3.3）
const FAKE: Entry[] = [
  { name: 'doGet', kind: 'webapp' },
  { name: 'getCatalog', kind: 'api' },
  { name: 'placeOrder', kind: 'api' },
  { name: 'adminCall', kind: 'admin' },
  { name: 'onOpen', kind: 'simpleTrigger' },
  { name: 'onEdit', kind: 'simpleTrigger' },
  { name: 'ownerButton', kind: 'ownerButton' },
  { name: 'menuAction_', kind: 'ownerMenu' },
  { name: 'onEditInstalled_', kind: 'installedTrigger' },
];

describe('checkEntries', () => {
  it('種類と末尾 _ の決まりに合う一覧は通る', () => {
    expect(() => checkEntries(FAKE)).not.toThrow();
  });

  it('一覧が空でも通る', () => {
    expect(() => checkEntries([])).not.toThrow();
  });

  const bad: [string, Entry[]][] = [
    ['api に _ を付けた', [{ name: 'getCatalog_', kind: 'api' }]],
    ['admin に _ を付けた', [{ name: 'adminCall_', kind: 'admin' }]],
    ['ownerButton に _ を付けた', [{ name: 'doIt_', kind: 'ownerButton' }]],
    ['ownerMenu に _ がない', [{ name: 'menuAction', kind: 'ownerMenu' }]],
    ['installedTrigger に _ がない', [{ name: 'onEditInstalled', kind: 'installedTrigger' }]],
    ['知らない種類', [{ name: 'foo', kind: 'unknown' }]],
    [
      '名前の重複',
      [
        { name: 'getCatalog', kind: 'api' },
        { name: 'getCatalog', kind: 'admin' },
      ],
    ],
    ['simpleTrigger が onOpen と onEdit 以外', [{ name: 'onChange', kind: 'simpleTrigger' }]],
    ['webapp が doGet 以外', [{ name: 'doPost', kind: 'webapp' }]],
  ];
  for (const [title, list] of bad) {
    it(`合わない一覧は例外になる: ${title}`, () => {
      expect(() => checkEntries(list)).toThrow();
    });
  }
});

describe('makeEntryFooter', () => {
  it('各入口の一番外側の function を作る', () => {
    const footer: string = makeEntryFooter(FAKE);
    for (const { name } of FAKE) {
      expect(footer).toContain(
        `function ${name}() { return OUCA_.${name}.apply(null, arguments); }`,
      );
    }
  });

  it('末尾 _ の入口も、評価すると一番外側の関数になる', () => {
    const calls: unknown[][] = [];
    const bundle: Record<string, unknown> = {};
    for (const { name } of FAKE) bundle[name] = (...args: unknown[]) => calls.push([name, ...args]);
    const context = vm.createContext({ OUCA_: bundle });
    vm.runInContext(makeEntryFooter(FAKE), context);
    const names = Object.getOwnPropertyNames(context).filter((n) => n !== 'OUCA_');
    expect(names.sort()).toEqual(FAKE.map((e) => e.name).sort());
    for (const name of names) {
      expect(typeof (context as Record<string, unknown>)[name], name).toBe('function');
    }
    vm.runInContext('menuAction_(1, 2)', context);
    expect(calls).toEqual([['menuAction_', 1, 2]]);
  });

  it('空の一覧では何も作らない', () => {
    expect(makeEntryFooter([]).trim()).toBe('');
  });
});

describe('scripts/build.mjs', () => {
  const src = readFileSync(resolve(__dirname, '../scripts/build.mjs'), 'utf8');

  it('ビルドの前に checkEntries を呼ぶ', () => {
    const check = src.indexOf('checkEntries(');
    expect(check).toBeGreaterThan(-1);
    // import の行でなく呼び出しで、vite と esbuild のビルドより前にある
    expect(src.indexOf('checkEntries(')).toBeLessThan(src.indexOf('await viteBuild('));
    expect(src.indexOf('checkEntries(')).toBeLessThan(src.indexOf('await esbuild('));
  });

  it('一番外側の関数は makeEntryFooter で作る', () => {
    expect(src).toContain('makeEntryFooter(');
  });
});
