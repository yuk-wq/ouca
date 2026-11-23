// DESIGN.md §5.2 画面の純粋な関数（page/probe.ts）のテスト。DOM の偽物は、必要な形だけを持つ。
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/* eslint-disable @typescript-eslint/no-explicit-any */
// page/probe.ts は実装の段階で作る。型の検査を通すため、パスを値で渡して読み込む。
const probePath = resolve(import.meta.dirname, '../page/probe.ts');
const probe: any = await import(/* @vite-ignore */ probePath);

// querySelector が、application/json の script を探す問いに、決めた要素を返す偽の document
const docWith = (el: { textContent: string } | null) => ({
  querySelector: (sel: string) => (sel.includes('application/json') ? el : null),
});

describe('readEmbedded', () => {
  it('script の中の JSON を parse して返す', () => {
    const value = { items: [1, 2], sample: '$& $1 </script>' };
    expect(probe.readEmbedded(docWith({ textContent: JSON.stringify(value) }))).toEqual(value);
  });
  it('script がなければ null', () => {
    expect(probe.readEmbedded(docWith(null))).toBeNull();
  });
  it('JSON が壊れていても例外を出さず null', () => {
    expect(probe.readEmbedded(docWith({ textContent: '{"a":' }))).toBeNull();
  });
});

describe('nextVisit', () => {
  const T1 = '2026-01-01T09:00:00Z';
  const T2 = '2026-01-02T09:00:00Z';
  it('初回（前の値がない）は、前の値がなかったことを返し、回数1を書く', () => {
    const r = probe.nextVisit(null, T1);
    expect(r.had).toBe(false);
    expect(r.prevCount).toBe(0);
    expect(JSON.parse(r.value)).toEqual({ at: T1, count: 1 });
  });
  it('2回目は、前の日時と回数を返し、回数を1増やして書く', () => {
    const first = probe.nextVisit(null, T1);
    const r = probe.nextVisit(first.value, T2);
    expect(r.had).toBe(true);
    expect(r.prevAt).toBe(T1);
    expect(r.prevCount).toBe(1);
    expect(JSON.parse(r.value)).toEqual({ at: T2, count: 2 });
  });
  it.each([
    ['JSON でない', '{broken'],
    ['オブジェクトでない', '"text"'],
    ['回数がない', '{"at":"x"}'],
    ['回数が数でない', '{"at":"x","count":"many"}'],
    ['空の文字列', ''],
  ])('壊れた値（%s）は、前の値がなかったのと同じに扱う', (_label, prev) => {
    const r = probe.nextVisit(prev, T2);
    expect(r.had).toBe(false);
    expect(r.prevCount).toBe(0);
    expect(JSON.parse(r.value)).toEqual({ at: T2, count: 1 });
  });
});

describe('withStorage', () => {
  it('成功したら ok と値を返す', () => {
    const ls = { getItem: () => 'v' };
    expect(probe.withStorage(() => ls.getItem())).toEqual({ ok: true, value: 'v' });
  });
  it('例外を投げる localStorage でも、止まらずに失敗を値で返す', () => {
    const ls = {
      getItem: () => {
        throw new Error('SecurityError: denied');
      },
    };
    const r = probe.withStorage(() => ls.getItem());
    expect(r.ok).toBe(false);
    expect(r.error).toContain('SecurityError');
  });
  it('Error でない値が投げられても、止まらない', () => {
    const r = probe.withStorage(() => {
      throw 'plain string';
    });
    expect(r.ok).toBe(false);
    expect(typeof r.error).toBe('string');
  });
});

describe('viewportFacts', () => {
  it('window から、幅の値を集める', () => {
    const win = {
      innerWidth: 390,
      screen: { width: 390 },
      devicePixelRatio: 3,
      visualViewport: { width: 388 },
    };
    expect(probe.viewportFacts(win)).toEqual({
      innerWidth: 390,
      screenWidth: 390,
      devicePixelRatio: 3,
      visualViewportWidth: 388,
    });
  });
  it('visualViewport がなければ、その値は null', () => {
    const win = { innerWidth: 980, screen: { width: 390 }, devicePixelRatio: 2 };
    expect(probe.viewportFacts(win)).toEqual({
      innerWidth: 980,
      screenWidth: 390,
      devicePixelRatio: 2,
      visualViewportWidth: null,
    });
  });
});
