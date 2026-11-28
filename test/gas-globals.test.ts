import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

// @ts-expect-error .mjs には型がない
import { GAS_ENTRIES } from '../scripts/gas-globals.mjs';

// 入口の一覧は scripts/gas-globals.mjs の名前と種類の組（docs/to-be/design.md §3.3）。
// 末尾 _ の入口も一番外側に出る。esbuild の包み OUCA_ だけを一覧の外として扱う。
const EXPECTED_GLOBAL_FUNCTIONS: string[] = (GAS_ENTRIES as { name: string }[]).map((e) => e.name);

const dist = resolve(__dirname, '../dist');

describe('dist/Code.js のトップレベル', () => {
  const context = vm.createContext({});
  vm.runInContext(readFileSync(resolve(dist, 'Code.js'), 'utf8'), context, {
    filename: 'Code.js',
  });
  const names = Object.getOwnPropertyNames(context).filter((n) => n !== 'OUCA_');

  it('一番外側の名前（OUCA_ を除く。末尾 _ を含む）は、入口の一覧の名前と同じである', () => {
    expect([...names].sort()).toEqual([...EXPECTED_GLOBAL_FUNCTIONS].sort());
  });

  it('OUCA_ は関数でなく、オブジェクトである（google.script.run とトリガーから呼べない）', () => {
    expect(vm.runInContext('typeof OUCA_', context)).toBe('object');
  });

  it('それらはすべて関数である（変数を外に出していない）', () => {
    for (const name of names) {
      expect(typeof (context as Record<string, unknown>)[name], name).toBe('function');
    }
  });

  it('入口の関数は function 宣言としてトップレベルにある', () => {
    const code = readFileSync(resolve(dist, 'Code.js'), 'utf8');
    for (const name of EXPECTED_GLOBAL_FUNCTIONS) {
      expect(code).toMatch(new RegExp(`^function ${name}\\(`, 'm'));
    }
  });

  it('src/server/main.ts の export（末尾 _ を含む）が、入口の一覧の名前と同じである', () => {
    // export を足しただけで外に出していない場合と、一覧に足して export を忘れた場合を見つける
    const bundle = (context as Record<string, unknown>).OUCA_ as Record<string, unknown>;
    const exported = Object.keys(bundle);
    expect(exported.sort()).toEqual([...EXPECTED_GLOBAL_FUNCTIONS].sort());
    for (const name of exported) {
      expect(typeof bundle[name], name).toBe('function');
    }
  });
});

describe('doGet', () => {
  it('index の HTML を返し、バージョンの番号つきのタイトルを付ける', () => {
    const calls: unknown[][] = [];
    const output = {
      setTitle(title: string) {
        calls.push(['setTitle', title]);
        return output;
      },
    };
    const context = vm.createContext({
      HtmlService: {
        createHtmlOutputFromFile(name: string) {
          calls.push(['createHtmlOutputFromFile', name]);
          return output;
        },
      },
    });
    vm.runInContext(readFileSync(resolve(dist, 'Code.js'), 'utf8'), context);
    const result = vm.runInContext('doGet({})', context);
    expect(result).toBe(output);
    expect(calls).toEqual([
      ['createHtmlOutputFromFile', 'index'],
      ['setTitle', expect.stringMatching(/^OUCA v\d+\.\d+\.\d+/)],
    ]);
  });
});
