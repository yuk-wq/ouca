// DESIGN.md §5.3 つながりのテスト。メニュー、ボタン、トリガー、画面の関数名の綴りの誤りを防ぐ。
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import vm from 'node:vm';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createWorld, plain } from './fakes';

/* eslint-disable @typescript-eslint/no-explicit-any */
const GAS = resolve(__dirname, '../gas');
const read = (f: string) => readFileSync(resolve(GAS, f), 'utf8');
const w = createWorld();
const ctx: any = w.load();
const exists = (n: string) => typeof ctx[n] === 'function';
const all = (re: RegExp, text: string) => [...text.matchAll(re)].map((m) => m[1]!);

describe('関数名の綴り', () => {
  it('メニューの addItem に書いた関数が、すべて一番外側の関数として存在する', () => {
    const names = all(/addItem\(\s*'[^']*',\s*'(\w+)'/g, read('Menu.js'));
    expect(names.length).toBeGreaterThan(5);
    for (const n of names) expect(exists(n), n).toBe(true);
  });
  it('メニューに「まとめを作る」（menuSummarize）がある', () => {
    const names = all(/addItem\(\s*'[^']*',\s*'(\w+)'/g, read('Menu.js'));
    expect(names).toContain('menuSummarize');
  });
  it('画像のボタンに割り当てる関数が存在する', () => {
    const names = all(/fn: '(\w+)'/g, read('Menu.js'));
    expect(names.length).toBe(3);
    for (const n of names) expect(exists(n), n).toBe(true);
  });
  it('newTrigger に書いた関数が存在する', () => {
    const names = all(/newTrigger\('(\w+)'\)/g, read('Triggers.js'));
    expect(names.length).toBe(5);
    for (const n of names) expect(exists(n), n).toBe(true);
  });
  it('WebPage.html から google.script.run で呼ぶ関数が存在する', () => {
    const html = read('WebPage.html');
    const names = [
      ...all(/call\(\s*'[^']*',\s*'(\w+)'/g, html),
      ...all(/google\.script\.run\.(\w+)\(/g, html),
    ];
    expect(names.length).toBeGreaterThan(2);
    for (const n of names) expect(exists(n), n).toBe(true);
  });
});

describe('入口の一覧', () => {
  const readme = readFileSync(resolve(__dirname, '../README.md'), 'utf8');
  const start = readme.indexOf('入口の一覧');
  const section = start < 0 ? '' : readme.slice(start).split(/\n#{2,3} /)[0]!;
  const listed = all(/^\|\s*`(\w+)`/gm, section);
  const names = Object.getOwnPropertyNames(ctx).filter((n) => !Object.keys(w.injected).includes(n));

  it('README に「入口の一覧」の表がある', () => {
    expect(listed.length).toBeGreaterThan(10);
  });
  it('末尾 _ でない一番外側の関数は、README の表と同じ', () => {
    const outer = names.filter((n) => !n.endsWith('_')).sort();
    const doc = listed.filter((n) => !n.endsWith('_')).sort();
    expect(outer).toEqual(doc);
  });
  it('末尾 _ の入口（menuUnderscore_、trigEdit_、timer_、buttonUnderscore_）も表にあり、存在する', () => {
    for (const n of ['menuUnderscore_', 'trigEdit_', 'timer_', 'buttonUnderscore_']) {
      expect(listed, n).toContain(n);
      expect(exists(n), n).toBe(true);
    }
  });
  it('一番外側に、関数でない値を出していない', () => {
    for (const n of names) expect(typeof ctx[n], n).toBe('function');
  });
});

describe('ファイルと画面', () => {
  it('HTML のファイル名は、.js のファイル名と重ならない（拡張子を除いた名前が同じだと保存できない可能性がある）', () => {
    const files = readdirSync(GAS);
    const base = (f: string) => f.replace(/\.(js|html|gs)$/, '');
    const js = files.filter((f) => f.endsWith('.js')).map(base);
    for (const h of files.filter((f) => f.endsWith('.html')).map(base)) {
      expect(js, h).not.toContain(h);
    }
  });
  it('createTemplateFromFile に書いた名前の HTML ファイルがある', () => {
    const names = all(/createTemplateFromFile\('(\w+)'\)/g, read('Web.js'));
    expect(names.length).toBeGreaterThan(0);
    for (const n of names) expect(existsSync(resolve(GAS, n + '.html')), n).toBe(true);
  });
  it('画面の「どこから開いたか」の選択肢が、Logic.js の出どころの一覧と同じ', () => {
    const html = read('WebPage.html');
    const options = all(/<option value="([^"]+)">/g, html);
    expect(options).toEqual(plain(vm.runInContext('ORIGINS', ctx)) as string[]);
  });
});
