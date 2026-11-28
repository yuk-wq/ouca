// DESIGN.md §5.4 つながりのテスト。関数名の綴りの誤り、入口の一覧とのずれ、ビルドの結果の崩れを防ぐ。
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { beforeAll, describe, expect, it } from 'vitest';
import { EMBED_SAMPLE } from '../page/probe';
import { createWorld } from './fakes';

/* eslint-disable @typescript-eslint/no-explicit-any */
const ROOT = resolve(import.meta.dirname, '..');
const read = (f: string) => readFileSync(resolve(ROOT, f), 'utf8');
const w = createWorld();
const ctx: any = w.load();
const exists = (n: string) => typeof ctx[n] === 'function';
const all = (re: RegExp, text: string) => [...text.matchAll(re)].map((m) => m[1]!);

describe('関数名の綴り', () => {
  it('メニューの addItem に書いた関数が、すべて一番外側の関数として存在する', () => {
    const names = all(/addItem\(\s*'[^']*',\s*'(\w+)'/g, read('gas/Code.js'));
    expect(names.length).toBeGreaterThanOrEqual(3);
    for (const n of names) expect(exists(n), n).toBe(true);
  });
  it('画面のソースの google.script.run で呼ぶ関数が、一番外側の関数として存在する', () => {
    // 呼び方は google.script.run[.withSuccessHandler(…)][.withFailureHandler(…)].関数名( の形
    const re =
      /google\.script\.run(?:\s*\.(?:withSuccessHandler|withFailureHandler|withUserObject)\((?:[^()]|\([^()]*\))*\))*\s*\.(\w+)\(/g;
    const dir = resolve(ROOT, 'page');
    const files = readdirSync(dir).filter((n) => /\.(ts|tsx|html)$/.test(n));
    const names = files.flatMap((n) => all(re, read(`page/${n}`)));
    expect(names.length).toBeGreaterThanOrEqual(3);
    for (const n of names) expect(exists(n), n).toBe(true);
  });
});

describe('入口の一覧', () => {
  const readme = (() => {
    try {
      return read('README.md');
    } catch {
      return '';
    }
  })();
  const start = readme.indexOf('入口の一覧');
  const section = start < 0 ? '' : readme.slice(start).split(/\n#{1,3} /)[0]!;
  const listed = all(/^\|\s*`(\w+)`/gm, section);
  const names = Object.getOwnPropertyNames(ctx).filter((n) => !Object.keys(w.injected).includes(n));

  it('README に「入口の一覧」の表がある', () => {
    expect(section).not.toBe('');
    expect(listed.length).toBeGreaterThanOrEqual(5);
  });
  it('末尾 _ でない一番外側の関数は、README の表と同じ', () => {
    const outer = names.filter((n) => !n.endsWith('_')).sort();
    const doc = listed.filter((n) => !n.endsWith('_')).sort();
    expect(outer).toContain('doGet');
    expect(outer.length).toBeGreaterThanOrEqual(5);
    expect(outer).toEqual(doc);
  });
  it('一番外側に、関数でない値を出していない', () => {
    expect(names.length).toBeGreaterThanOrEqual(5);
    for (const n of names) expect(typeof ctx[n], n).toBe('function');
  });
});

describe('画面のつながり', () => {
  const stripComments = (t: string) =>
    t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  it('Code.js と probe.ts の EMBED_SAMPLE が同じ', () => {
    expect(vm.runInContext('EMBED_SAMPLE', ctx)).toBe(EMBED_SAMPLE);
  });
  it('module の先頭で、保存（sessionStorage、localStorage、IndexedDB）に触る前に、module の行を送る', () => {
    const main = stripComments(read('page/main.tsx'));
    const sent = main.search(/moduleFact\(/);
    const touched = main.search(/\b(sessionStorage|localStorage|indexedDB)\b/);
    expect(sent).toBeGreaterThanOrEqual(0);
    expect(touched).toBeGreaterThanOrEqual(0);
    expect(sent).toBeLessThan(touched);
  });
  it('main.tsx は、sessionStorage を関数の中でだけ読み、ビルドの印を meta から読む', () => {
    const main = stripComments(read('page/main.tsx'));
    expect(main).toContain('detectVisitKind(() => window.sessionStorage)');
    const all = main.match(/sessionStorage/g) ?? [];
    const wrapped = main.match(/\(\)\s*=>\s*window\.sessionStorage/g) ?? [];
    expect(all.length).toBe(wrapped.length);
    expect(main).toContain('buildOf(');
  });
  it('開き方を選ぶ前は「調べる」が押せない（canProbe を使い、ボタンを無効にする）', () => {
    const main = stripComments(read('page/main.tsx'));
    expect(main).toMatch(/canProbe\(/);
    expect(main).toMatch(/<button[^>]*disabled=\{[^}]*(ready|canProbe)/);
  });
  it('「調べる」のボタンは、canStartProbe（開き方と via の両方を見る）で無効にする', () => {
    const main = stripComments(read('page/main.tsx'));
    expect(main).toMatch(/<button[^>]*disabled=\{[^}]*canStartProbe\(/);
    expect(main).not.toMatch(/viaReady/);
    expect(main).toMatch(/moduleFact\(buildSource\(/);
  });
  it('make-page.mjs は、ビルドの前に page/ の型の検査（tsc -p page）を動かす', () => {
    const make = read('make-page.mjs');
    const tsc = make.search(/tsc/);
    const build = make.search(/build\(/);
    expect(tsc).toBeGreaterThanOrEqual(0);
    expect(tsc).toBeLessThan(build);
  });
});

describe('make-page.mjs で作った Page.html', () => {
  let html = '';
  beforeAll(() => {
    execFileSync(process.execPath, [resolve(ROOT, 'make-page.mjs')], { stdio: 'inherit' });
    html = read('gas/Page.html');
  }, 120_000);

  it('目印が1つだけある', () => {
    const placeholder = vm.runInContext('PLACEHOLDER', ctx) as string;
    expect(html.split(placeholder)).toHaveLength(2);
  });
  it('module でない小さな script が、recordFact を呼んでいる', () => {
    const m = /<script(?![^>]*\btype=)[^>]*>([\s\S]*?)<\/script>/.exec(html);
    expect(m).not.toBeNull();
    expect(m![1]).toContain('recordFact');
  });
  it('ビルドの印の目印が、メニューの JSON の目印とは別に1つだけある', () => {
    const bp = vm.runInContext('BUILD_PLACEHOLDER', ctx) as string;
    expect(bp).not.toBe(vm.runInContext('PLACEHOLDER', ctx));
    // meta と、body の data-build の2か所
    expect(html.split(bp)).toHaveLength(3);
    expect(html).toMatch(/data-build=/);
    expect(html).toMatch(/<meta[^>]*name="t14-build"/);
  });
  it('module でない script は、ビルドの印を meta から読む（メニューの JSON は読まない）', () => {
    const m = /<script(?![^>]*\btype=)[^>]*>([\s\S]*?)<\/script>/.exec(html);
    expect(m![1]).toContain('t14-build');
    expect(m![1]).toContain('data-build');
    expect(m![1]).not.toContain('JSON.parse');
  });
  it('module の script と、module でない小さな script が、両方入っている', () => {
    expect(html).toMatch(/<script[^>]*type="module"/);
    expect(html).toMatch(/<script(?![^>]*\btype=)[^>]*>/);
  });
});

describe('GAS に送るファイルの文字', () => {
  // GAS は送るときに構文を確かめ、文字列の中の U+2028、U+2029 をそのまま書くと
  // 「Unexpected token ILLEGAL」で送れない（2026-11-28 の push で確かめた）。エスケープで書く
  it('gas/ の .js と .html に、U+2028 と U+2029 をそのまま書いていない', () => {
    for (const f of readdirSync(resolve(ROOT, 'gas')).filter((n) => /\.(js|html)$/.test(n))) {
      const text = read(`gas/${f}`);
      expect(text.includes(' ') || text.includes(' '), f).toBe(false);
    }
  });
});
