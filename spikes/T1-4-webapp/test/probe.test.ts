// DESIGN.md §5.2 画面の純粋な関数（page/probe.ts）のテスト。DOM の偽物は、必要な形だけを持つ。
// 事実の行を作る関数は、作った行を summarize_（gas/Logic.js）に渡して、判定まで確かめる。
import { describe, expect, it } from 'vitest';
import {
  EMBED_SAMPLE,
  INITIAL_ORIGIN,
  ORIGIN_CHOICES,
  canProbe,
  cannotopenFact,
  detectVisitKind,
  embedFact,
  moduleFact,
  nextVisit,
  noteFact,
  originHash,
  readEmbedded,
  readVia,
  rttFact,
  shortUserAgent,
  storageFact,
  toRow,
  viaNotice,
  viewportFacts,
  viewportRows,
  withStorage,
  type Fact,
} from '../page/probe';
import { createWorld, plain } from './fakes';
import { O, ORIGIN_LIST } from './design-table';

/* eslint-disable @typescript-eslint/no-explicit-any */

// 画面が作った行を、ログのタブの行（summarize_ に渡す形）にする
const g: any = createWorld().load();
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15';
const asRow = (t: string[]) => ({
  time: '2026-01-01 09:00:00',
  scenario: t[0]!,
  origin: t[1]!,
  fact: t[2]!,
  value: t[3]!,
  detail: t[4]!,
  build: t[5]!,
});
const rowsFrom = (items: [Fact, string][]) =>
  items.map(([fact, origin]) => asRow(toRow(fact, origin, 'b1', UA)));
const sum = (rows: unknown[]): any => plain(g.summarize_(rows));

// querySelector が、application/json の script を探す問いに、決めた要素を返す偽の document
const docWith = (el: { textContent: string } | null) => ({
  querySelector: (sel: string) => (sel.includes('application/json') ? el : null),
});

describe('開き方の選択肢', () => {
  it('ORIGIN_CHOICES は、DESIGN.md §2 の開き方の一覧と同じ（9つ、順も同じ）', () => {
    expect(ORIGIN_CHOICES).toEqual(ORIGIN_LIST);
    expect(ORIGIN_CHOICES).toHaveLength(9);
  });
  it('初めは何も選ばれておらず、選ぶまで調べられない', () => {
    expect(INITIAL_ORIGIN).toBe('');
    expect(canProbe(INITIAL_ORIGIN)).toBe(false);
    expect(canProbe('どこか')).toBe(false);
    for (const o of ORIGIN_LIST) expect(canProbe(o)).toBe(true);
  });
});

describe('readEmbedded', () => {
  it('script の中の JSON を parse して返す', () => {
    const value = { items: [1, 2], sample: '$& $1 </script>' };
    expect(readEmbedded(docWith({ textContent: JSON.stringify(value) }))).toEqual(value);
  });
  it('script がなければ null', () => {
    expect(readEmbedded(docWith(null))).toBeNull();
  });
  it('JSON が壊れていても例外を出さず null', () => {
    expect(readEmbedded(docWith({ textContent: '{"a":' }))).toBeNull();
  });
});

describe('nextVisit', () => {
  const T1 = '2026-01-01T09:00:00Z';
  const T2 = '2026-01-02T09:00:00Z';
  it('初回（前の値がない）は、前の値がなかったことを返し、回数1を書く', () => {
    const r = nextVisit(null, T1);
    expect(r.had).toBe(false);
    expect(r.prevCount).toBe(0);
    expect(JSON.parse(r.value)).toEqual({ at: T1, count: 1 });
  });
  it('2回目は、前の日時と回数を返し、回数を1増やして書く', () => {
    const first = nextVisit(null, T1);
    const r = nextVisit(first.value, T2);
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
    const r = nextVisit(prev, T2);
    expect(r.had).toBe(false);
    expect(r.prevCount).toBe(0);
    expect(JSON.parse(r.value)).toEqual({ at: T2, count: 1 });
  });
});

describe('withStorage', () => {
  it('成功したら ok と値を返す', () => {
    const ls = { getItem: () => 'v' };
    expect(withStorage(() => ls.getItem())).toEqual({ ok: true, value: 'v' });
  });
  it('例外を投げる localStorage でも、止まらずに失敗を値で返す', () => {
    const ls = {
      getItem: () => {
        throw new Error('SecurityError: denied');
      },
    };
    const r = withStorage(() => ls.getItem());
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toContain('SecurityError');
  });
  it('Error でない値が投げられても、止まらない', () => {
    const r = withStorage(() => {
      throw 'plain string';
    });
    expect(r.ok).toBe(false);
    expect(r.ok === false && typeof r.error).toBe('string');
  });
});

describe('detectVisitKind（sessionStorage の印で、再読み込みか開き直しかを見分ける）', () => {
  // sessionStorage を取り出す処理も関数で渡す（window.sessionStorage を読むだけで例外になる環境がある）
  const store = () => {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
    };
  };
  it('印がなければ reopen（開き直し）で、印を付ける', () => {
    const s = store();
    expect(detectVisitKind(() => s)).toBe('reopen');
    expect(s.getItem('t14-session-mark')).not.toBeNull();
  });
  it('印があれば reload（再読み込み）', () => {
    const s = store();
    detectVisitKind(() => s);
    expect(detectVisitKind(() => s)).toBe('reload');
  });
  it('getItem が例外を出せば unknown', () => {
    const s = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {},
    };
    expect(detectVisitKind(() => s)).toBe('unknown');
  });
  it('setItem が例外を出せば unknown', () => {
    const s = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(detectVisitKind(() => s)).toBe('unknown');
  });
  it('sessionStorage を取り出すだけで例外になっても、止まらずに unknown', () => {
    expect(
      detectVisitKind(() => {
        throw new Error('SecurityError: The operation is insecure.');
      }),
    ).toBe('unknown');
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
    expect(viewportFacts(win)).toEqual({
      innerWidth: 390,
      screenWidth: 390,
      devicePixelRatio: 3,
      visualViewportWidth: 388,
    });
  });
  it('visualViewport がなければ、その値は null', () => {
    const win = { innerWidth: 980, screen: { width: 390 }, devicePixelRatio: 2 };
    expect(viewportFacts(win)).toEqual({
      innerWidth: 980,
      screenWidth: 390,
      devicePixelRatio: 2,
      visualViewportWidth: null,
    });
  });
});

describe('readVia（URL の引数 via を、google.script.url.getLocation の結果から読む）', () => {
  it.each(['exec', 'dev'])('via=%s を読む', (v) => {
    expect(readVia({ parameter: { via: v } })).toBe(v);
  });
  it('引数がなければ、決めた値でなければ、location がなければ none', () => {
    expect(readVia({ parameter: {} })).toBe('none');
    expect(readVia({ parameter: { via: 'prod' } })).toBe('none');
    expect(readVia({})).toBe('none');
    expect(readVia(null)).toBe('none');
    expect(readVia(undefined)).toBe('none');
  });
});

describe('viaNotice（URL に via が付いていないときの、調べる画面の上に出す文言）', () => {
  it('via がなければ、URL の末尾に ?via=exec か ?via=dev を付けて開き直すよう、文言を返す', () => {
    const msg = viaNotice('none');
    expect(msg).toContain('?via=exec');
    expect(msg).toContain('?via=dev');
    expect(msg).toContain('開き直');
  });
  it.each(['exec', 'dev'] as const)('via が %s なら、何も出さない（空の文字列）', (v) => {
    expect(viaNotice(v)).toBe('');
  });
  it('readVia が none を返す location では、文言が出る', () => {
    expect(viaNotice(readVia({ parameter: {} }))).not.toBe('');
    expect(viaNotice(readVia({ parameter: { via: 'exec' } }))).toBe('');
  });
});

describe('shortUserAgent と originHash', () => {
  it('userAgent は 200 字までにし、文字列でなければ空', () => {
    expect(shortUserAgent('a'.repeat(300))).toHaveLength(200);
    expect(shortUserAgent(UA)).toBe(UA);
    expect(shortUserAgent(undefined as any)).toBe('');
  });
  it('originHash は、同じ値なら同じ、違えば違う 8 桁の16進数で、元の値を含まない', () => {
    const a = originHash('https://abc-script.googleusercontent.com');
    expect(a).toMatch(/^[0-9a-f]{8}$/);
    expect(originHash('https://abc-script.googleusercontent.com')).toBe(a);
    expect(originHash('https://xyz-script.googleusercontent.com')).not.toBe(a);
    expect(a).not.toContain('abc');
  });
});

describe('toRow（recordFact に渡す6つの文字列にする）', () => {
  it('シナリオ、開き方、事実、値、詳細、ビルドの印の順で返し、詳細に userAgent を足す', () => {
    const f: Fact = { scenario: 'W3', fact: 'viewport', value: '{"a":1}', detail: { k: 'v' } };
    const t = toRow(f, O.iphoneSafari, 'b9', UA);
    expect(t).toHaveLength(6);
    expect(t[0]).toBe('W3');
    expect(t[1]).toBe(O.iphoneSafari);
    expect(t[2]).toBe('viewport');
    expect(t[3]).toBe('{"a":1}');
    expect(JSON.parse(t[4]!)).toEqual({ k: 'v', ua: UA });
    expect(t[5]).toBe('b9');
  });
  it('userAgent は 200 字までにする', () => {
    const f: Fact = { scenario: '', fact: 'module', value: '動いた', detail: {} };
    expect(JSON.parse(toRow(f, '', 'b', 'x'.repeat(500))[4]!).ua).toHaveLength(200);
  });
});

describe('事実の行を作る関数と summarize_ のつながり（事実の名前や値の形を変えると落ちる）', () => {
  it('W1: 同じ sample なら「読める」、違う sample や読めない場合は「壊れる」', () => {
    const verdictOf = (embedded: unknown) => sum(rowsFrom([[embedFact(embedded), '']])).W1.verdict;
    expect(verdictOf({ sample: EMBED_SAMPLE, items: [] })).toBe('読める');
    expect(verdictOf({ sample: 'changed' })).toBe('壊れる');
    expect(verdictOf(null)).toBe('壊れる');
  });
  it('W2: module の行で「動く」', () => {
    expect(sum(rowsFrom([[moduleFact(), '']])).W2.verdict).toBe('動く');
  });
  const win = (inner: number, screen: number) => ({
    innerWidth: inner,
    screen: { width: screen },
    devicePixelRatio: 3,
  });
  const widthRows = (inner: number, screen: number, answer = 'はい', origin = O.iphoneSafari) =>
    rowsFrom([
      ...viewportRows(win(inner, screen)).map((f): [Fact, string] => [f, origin]),
      [noteFact('user.width', answer), origin],
    ]);
  it('W3 と W3-html: 幅が合っていて、width=500 が効いていなければ「合う」と「使われない」', () => {
    const out = sum(widthRows(390, 390));
    expect(out.W3.verdict).toBe('合う');
    expect(out['W3-html'].verdict).toBe('使われない');
  });
  it('W3-html: 幅が 500 なら「使われる」で、W3 は判定しない', () => {
    const out = sum(widthRows(500, 390));
    expect(out['W3-html'].verdict).toBe('使われる');
    expect(out.W3.verdict).toBe('未確定');
  });
  it.each([
    [380, 400, '合う'],
    [420, 400, '合う'],
    [95, 100, '合う'],
    [105, 100, '合う'],
    [379, 400, '合わない'],
    [421, 400, '合わない'],
  ])('W3 の境目: 画面の幅 %i、端末の幅 %i は「%s」', (inner, screen, verdict) => {
    expect(sum(widthRows(inner, screen)).W3.verdict).toBe(verdict);
  });
  it('W4: 保存の行（再読み込みと開き直し）から、残った（n/m）の表になる', () => {
    const T = (n: number) => `2026-01-0${n}T09:00:00Z`;
    const hash = originHash('https://a-script.googleusercontent.com');
    const where = { hash, via: 'exec' };
    const v1 = nextVisit(null, T(1));
    const v2 = nextVisit(v1.value, T(2));
    const v3 = nextVisit(v2.value, T(3));
    const rows = rowsFrom([
      [storageFact('local', v1, 'reopen', true, where), O.iphoneSafari],
      [storageFact('local', v2, 'reload', true, where), O.iphoneSafari],
      [storageFact('local', v3, 'reopen', true, where), O.iphoneSafari],
      [storageFact('idb', v1, 'reopen', true, where), O.iphoneSafari],
      [storageFact('idb', v1, 'reload', true, where), O.iphoneSafari], // 前の値がない（消えた）
    ]);
    const r = sum(rows).W4;
    const t = r.table.find((x: any) => x.origin === O.iphoneSafari);
    expect(t.local.reload).toBe('残った（1/1）');
    expect(t.local.reopen).toBe('残った（1/1）');
    expect(t.idb.reload).toBe('消えた');
    expect(r.storageOrigins).toEqual([{ origin: O.iphoneSafari, via: 'exec', hash }]);
  });
  it('W4: 書けなかった（wrote が false）行は「書けなかった」', () => {
    const v1 = nextVisit(null, '2026-01-01T09:00:00Z');
    const where = { hash: 'h', via: 'exec' };
    const rows = rowsFrom([
      [storageFact('local', v1, 'reopen', false, where), O.androidChrome],
      [storageFact('local', v1, 'reload', false, where), O.androidChrome],
    ]);
    const t = sum(rows).W4.table.find((x: any) => x.origin === O.androidChrome);
    expect(t.local.reload).toBe('書けなかった');
  });
  it('W4: 見分けられない（unknown）の行は「見分けられない」', () => {
    const v1 = nextVisit(null, '2026-01-01T09:00:00Z');
    const rows = rowsFrom([
      [storageFact('idb', v1, 'unknown', true, { hash: 'h', via: 'exec' }), O.androidLine],
    ]);
    const t = sum(rows).W4.table.find((x: any) => x.origin === O.androidLine);
    expect(t.idb.unknown).toBe('見分けられない');
  });
  it('W6: readVia の結果を probeExec に渡すと、/exec の行の判定ができる', () => {
    const w = createWorld();
    const s: any = w.load();
    s.menuSetup();
    s.probeExec(O.pcB, readVia({ parameter: { via: 'exec' } }), 'b1');
    const rows = w.logRows().map((r) => ({
      time: r[0],
      scenario: r[1],
      origin: r[2],
      fact: r[3],
      value: r[4],
      detail: r[5],
      build: r[6],
    }));
    expect((plain(s.summarize_(rows)) as any).W6.verdict).toBe('成り立つ');
  });
  it('W7: 往復の行から、組ごとの中央値になる。中央値がちょうど 1000 ミリ秒なら必須にしない', () => {
    const rows = rowsFrom([[rttFact(200, [900, 1000, 1000, 1000, 1100]), O.iphoneLine]]);
    const r = sum(rows).W7;
    expect(r.table).toEqual([
      { origin: O.iphoneLine, size: 200, median: 1000, max: 1100, over1s: false },
    ]);
    expect(r.verdict).toBe('往復も実用の速さ');
  });
  it('W7: 中央値が 1000 ミリ秒を超えれば「埋め込みが必須」', () => {
    const rows = rowsFrom([[rttFact(200, [1001, 1001, 1001, 1001, 1001]), O.pcB]]);
    expect(sum(rows).W7.verdict).toBe('埋め込みが必須');
  });
  it('W8: 開けた行と、開けなかった控え、画面は出たが失敗の控えから、状態の表になる', () => {
    const rows = rowsFrom([
      [moduleFact(), O.pcIncog],
      [cannotopenFact(O.iphoneSafari, 'cannot', 'Sorry, unable to open'), O.pcIncog],
      [cannotopenFact(O.androidChrome, 'failed', '失敗と出た'), O.pcIncog],
    ]);
    const by = (o: string) => sum(rows).W8.table.find((t: any) => t.origin === o);
    expect(by(O.pcIncog).status).toBe('開けた');
    expect(by(O.iphoneSafari)).toMatchObject({
      status: '開けなかった',
      text: 'Sorry, unable to open',
    });
    expect(by(O.androidChrome).status).toBe('画面は出たがサーバーを呼べなかった');
  });
  it('W9: user.account の控えで、A でログインしたスマホをお客さんに数えない', () => {
    const rows = rowsFrom([
      [moduleFact(), O.pcBA],
      [moduleFact(), O.iphoneLine],
      [noteFact('user.account', 'A'), O.iphoneLine],
      [moduleFact(), O.androidLine],
      [noteFact('user.account', 'B'), O.androidLine],
    ]);
    const r = sum(rows).W9;
    expect(r.verdict).toBe('案内は要らない');
    expect(r.evidence).toContain('数えない');
  });
  it('W5: ホーム画面のアイコンの控えが表に入る', () => {
    const rows = rowsFrom([
      [
        {
          scenario: 'W5',
          fact: 'meta',
          value: '{"name":"viewport","ok":true,"error":""}',
          detail: {},
        },
        '',
      ],
      [noteFact('user.homeicon', 'G のマーク'), O.iphoneSafari],
    ]);
    expect(sum(rows).W5.table.homeicon).toEqual([{ origin: O.iphoneSafari, text: 'G のマーク' }]);
  });
});
