// DESIGN.md §5.1 サーバーの純粋な関数（gas/Logic.js）のテスト。判定の表（§2）と summarize_ は対応させる。
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { createWorld, plain } from './fakes';
import { CUSTOMER_LIST, designImpact, designVerdicts, O, ORIGIN_LIST } from './design-table';

/* eslint-disable @typescript-eslint/no-explicit-any */
const ctx: any = createWorld().load();
const f =
  (name: string) =>
  (...args: unknown[]) =>
    plain(ctx[name](...args));

// ---------------------------------------------------------------- embedCatalog_

const PH = '__TEST_PLACEHOLDER__';
const wrap = (inner: string) => `<script type="application/json" id="d">${inner}</script>`;
const embed = (json: string, html = wrap(PH)) => ctx.embedCatalog_(html, PH, json) as string;
const inner = (html: string) => html.split('id="d">')[1]!.split('</script>')[0]!;

describe('embedCatalog_', () => {
  it('$&、$1、$$ を含む JSON が、そのまま入る', () => {
    const value = { a: "$& $1 $$ $` $'" };
    const out = embed(JSON.stringify(value));
    expect(JSON.parse(inner(out))).toEqual(value);
    expect(out).not.toContain(PH);
  });
  it('</script> を含む値で script が閉じない', () => {
    const value = { a: 'x</script><b>y' };
    const out = embed(JSON.stringify(value));
    expect(out.match(/<\/script>/g)).toHaveLength(1);
    expect(inner(out)).not.toContain('<');
    expect(JSON.parse(inner(out))).toEqual(value);
  });
  it('U+2028 と U+2029 がそのままは入らず、parse すると元の値に戻る', () => {
    const value = { a: `a b c` };
    const out = embed(JSON.stringify(value));
    expect(out).not.toContain(' ');
    expect(out).not.toContain(' ');
    expect(JSON.parse(inner(out))).toEqual(value);
  });
  it('目印がないと例外', () => {
    expect(embed('{}')).toContain('{}'); // 目印があれば通る（関数がないために落ちるのを防ぐ）
    expect(() => ctx.embedCatalog_('<html></html>', PH, '{}')).toThrow();
  });
  it('目印が2つあるときは、1つ目だけを置き換える', () => {
    const out = ctx.embedCatalog_(`${PH}|${PH}`, PH, '{"a":1}') as string;
    expect(out).toBe(`{"a":1}|${PH}`);
  });
});

// ---------------------------------------------------------------- 伏せ方（T1-3 と同じ）

describe('maskEmail_', () => {
  it('ふつうのアドレスは、先頭2文字と ***@ とドメインにする', () => {
    expect(f('maskEmail_')('taro.dummy@example.com')).toBe('ta***@example.com');
  });
  it('空は空のまま', () => {
    expect(f('maskEmail_')('')).toBe('');
  });
  it('@ のない値は、先頭2文字と *** にする', () => {
    expect(f('maskEmail_')('abc')).toBe('ab***');
  });
});

describe('maskDigits_', () => {
  it('5桁までは残す', () => {
    expect(f('maskDigits_')('code 12345 end')).toBe('code 12345 end');
  });
  it('6桁以上続く数字を *** にする', () => {
    expect(f('maskDigits_')('id 123456 end')).toBe('id *** end');
  });
  it('URL の中の project=123456789 を伏せる', () => {
    expect(f('maskDigits_')('https://x.example/api?project=123456789&a=1')).toBe(
      'https://x.example/api?project=***&a=1',
    );
  });
});

describe('scrubText_', () => {
  it('文の中のメールアドレスを伏せる', () => {
    const out = f('scrubText_')('持ち主は a.b@example.com です') as string;
    expect(out).not.toContain('a.b@');
  });
  it('Web アプリの URL を、デプロイ ID ごと伏せる', () => {
    const out = f('scrubText_')('https://script.google.com/macros/s/AKfycbDUMMY123/exec を開いた');
    expect(out).not.toContain('AKfycbDUMMY123');
  });
});

describe('classifyUrl_', () => {
  const id = 'AKfycbXYZDUMMYID1234';
  const url = `https://script.google.com/macros/s/${id}/exec`;
  it('/exec を見分け、末尾4字とハッシュを返し、ID を丸ごと返さない', () => {
    const out = f('classifyUrl_')(url) as any;
    expect(out.kind).toBe('exec');
    expect(out.tail4).toBe('1234');
    expect(out.hash8).toMatch(/^[0-9a-f]{8}$/);
    expect(JSON.stringify(out)).not.toContain(id);
  });
  it('/dev を見分ける', () => {
    expect((f('classifyUrl_')('https://script.google.com/macros/s/AAAA9999/dev') as any).kind).toBe(
      'dev',
    );
  });
  it('ほかの形は other', () => {
    expect((f('classifyUrl_')('https://example.com/x') as any).kind).toBe('other');
  });
});

// ---------------------------------------------------------------- rttStats_

describe('rttStats_', () => {
  const s = f('rttStats_');
  it('奇数個は真ん中の値を中央値にする', () => {
    expect(s([300, 100, 500, 200, 400])).toEqual({ median: 300, max: 500 });
  });
  it('偶数個は真ん中2つの平均を中央値にする', () => {
    expect(s([400, 100, 300, 200])).toEqual({ median: 250, max: 400 });
  });
  it('空は null を返す', () => {
    expect(s([])).toEqual({ median: null, max: null });
  });
});

// ---------------------------------------------------------------- 判定の表との一致

describe('判定の表（DESIGN.md §2）と Logic.js の判定のデータの一致', () => {
  const expected = designVerdicts().map((v) => `${v.scenario}|${v.verdict}|${v.impact}`);
  it('DESIGN.md の表から、シナリオと判定の組を読めている', () => {
    expect(expected.length).toBeGreaterThanOrEqual(15);
  });
  it('シナリオ、判定の名前、設計への影響が、表と同じ', () => {
    const actual: string[] = [];
    for (const v of plain(vm.runInContext('VERDICTS', ctx)) as any[]) {
      for (const sc of v.scenarios) actual.push(`${sc}|${v.verdict}|${v.impact}`);
    }
    expect([...actual].sort()).toEqual([...expected].sort());
  });
  it('開き方の一覧が、DESIGN.md §2 の一覧と同じ（9つ、順も同じ）', () => {
    expect(ORIGIN_LIST).toHaveLength(9);
    expect(plain(vm.runInContext('ORIGINS', ctx))).toEqual(ORIGIN_LIST);
  });
  it('お客さんの印は、DESIGN.md の一覧のとおり（A だけを除き、iPhone のホーム画面からも除く）', () => {
    expect(CUSTOMER_LIST).not.toContain(O.pcA);
    expect(CUSTOMER_LIST).not.toContain(O.iphoneHome);
    expect(CUSTOMER_LIST).toContain(O.pcBA);
  });
});

// ---------------------------------------------------------------- summarize_

// 行は { time, scenario, origin, fact, value, detail, build }。値と詳細は文字列（表計算のセルの値）
const row = (fact: string, value: unknown, origin = '', detail = '', build = '') => ({
  time: '2026-01-01 09:00:00',
  scenario: '',
  origin,
  fact,
  value: typeof value === 'string' ? value : JSON.stringify(value),
  detail,
  build,
});
const sum = (rows: unknown[]): any => plain(ctx.summarize_(rows));
const J = JSON.stringify;

// 判定を確かめる。設計への影響は、DESIGN.md の表の文言と同じ
function expectVerdict(r: any, scenario: string, verdict: string) {
  expect(r.verdict).toBe(verdict);
  expect(r.impact).toBe(designImpact(scenario, verdict));
  expect(r.pending).toBe('');
  expect(typeof r.evidence).toBe('string');
}
function expectUndecided(r: any, missing: string) {
  expect(r.verdict).toBe('未確定');
  expect(r.impact).toBe('');
  expect(r.pending).toContain(missing);
}

describe('summarize_ の全体', () => {
  it('行がなくても、W1 から W9 と W3-html の10個を返し、すべて未確定', () => {
    const out = sum([]);
    expect(Object.keys(out).sort()).toEqual(
      ['W1', 'W2', 'W3', 'W3-html', 'W4', 'W5', 'W6', 'W7', 'W8', 'W9'].sort(),
    );
    for (const k of Object.keys(out)) {
      expect(out[k].verdict, k).toBe('未確定');
      expect(out[k].pending, k).not.toBe('');
    }
  });
  it('undefined を渡しても落ちない', () => {
    expect(Object.keys(sum(undefined as any))).toHaveLength(10);
  });
});

describe('summarize_ 最新のビルドの印の行だけを使う', () => {
  const build = (v: string) => row('build', v, '', '', v);
  it('古いビルドの行は使わず、新しいビルドの行で判定する', () => {
    const rows = [
      build('old'),
      row('embed', { read: true, same: false }, '', '', 'old'),
      build('new'),
      row('embed', { read: true, same: true }, '', '', 'new'),
    ];
    expectVerdict(sum(rows).W1, 'W1', '読める');
  });
  it('新しいビルドに行がない事実は、古い行があっても未確定', () => {
    const rows = [build('old'), row('module', '動いた', '', '', 'old'), build('new')];
    expectUndecided(sum(rows).W2, 'module');
  });
  it('ビルドの印の行が1つもなければ、すべての行を使う', () => {
    expectVerdict(sum([row('embed', { read: true, same: true })]).W1, 'W1', '読める');
  });
});

describe('summarize_ W1 メニューの埋め込み', () => {
  it('読めて、中身が同じなら「読める」', () => {
    expectVerdict(sum([row('embed', { read: true, same: true })]).W1, 'W1', '読める');
  });
  it('読めるが中身が違えば「壊れる」', () => {
    expectVerdict(sum([row('embed', { read: true, same: false })]).W1, 'W1', '壊れる');
  });
  it('読めなければ「壊れる」', () => {
    expectVerdict(sum([row('embed', { read: false, same: false })]).W1, 'W1', '壊れる');
  });
  it('embed の行がなければ未確定で、足りない事実の鍵を出す', () => {
    expectUndecided(sum([]).W1, 'embed');
  });
});

describe('summarize_ W2 Vite の出力', () => {
  it('module の行があれば「動く」', () => {
    const rows = [row('classic', '動いた'), row('module', '動いた')];
    expectVerdict(sum(rows).W2, 'W2', '動く');
  });
  it('module でない script の行だけなら「動かない」', () => {
    expectVerdict(sum([row('classic', '動いた')]).W2, 'W2', '動かない');
  });
  it('どちらの行もなければ未確定', () => {
    expectUndecided(sum([]).W2, 'classic');
  });
});

describe('summarize_ W3 画面の幅', () => {
  const vp = (innerWidth: number, origin = O.iphoneSafari, screenWidth = 390) =>
    row(
      'viewport',
      { innerWidth, screenWidth, devicePixelRatio: 3, visualViewportWidth: innerWidth },
      origin,
    );
  const yes = (o: string) => row('user.width', 'はい', o);
  it('確かめたスマホの開き方のすべてで、幅が近く、合って見えたと控えたら「合う」', () => {
    const rows = [
      vp(390),
      yes(O.iphoneSafari),
      vp(412, O.androidChrome, 412),
      yes(O.androidChrome),
    ];
    expectVerdict(sum(rows).W3, 'W3', '合う');
  });
  it('1つでも合わないスマホの開き方があれば「合わない」で、その開き方を根拠に並べる', () => {
    const rows = [
      vp(390),
      yes(O.iphoneSafari),
      vp(980, O.androidChrome, 412),
      yes(O.androidChrome),
    ];
    const r = sum(rows).W3;
    expectVerdict(r, 'W3', '合わない');
    expect(r.evidence).toContain(O.androidChrome);
  });
  it('合って見えなかったと控えたら「合わない」', () => {
    const rows = [vp(390), row('user.width', 'いいえ', O.iphoneSafari)];
    expectVerdict(sum(rows).W3, 'W3', '合わない');
  });
  it.each([
    [380, 400, '合う'], // 0.95 倍ちょうど
    [420, 400, '合う'], // 1.05 倍ちょうど
    [95, 100, '合う'],
    [105, 100, '合う'],
    [379, 400, '合わない'],
    [421, 400, '合わない'],
  ])('画面の幅 %i、端末の幅 %i の境目（%s）', (w, screenWidth, verdict) => {
    // it.each の引数の順は [画面の幅, 端末の幅, 判定]
    const rows = [vp(w, O.androidChrome, screenWidth), yes(O.androidChrome)];
    expectVerdict(sum(rows).W3, 'W3', verdict);
  });
  it('スマホの行に、控えがなければ未確定で user.width を出す', () => {
    expectUndecided(sum([vp(390)]).W3, 'user.width');
  });
  it('PC の行だけなら未確定', () => {
    expectUndecided(sum([vp(1200, O.pcA), yes(O.pcA)]).W3, 'viewport');
  });
  it('W3-html が「使われる」なら、W3 は判定せず、未確定で W3-html を理由に出す', () => {
    const rows = [
      vp(500),
      yes(O.iphoneSafari),
      row('viewport.html', { innerWidth: 500 }, O.iphoneSafari),
    ];
    expectUndecided(sum(rows).W3, 'W3-html');
  });
});

describe('summarize_ W3-html HTML の中の viewport', () => {
  const vh = (w: number, o: string) => row('viewport.html', { innerWidth: w }, o);
  it('スマホの開き方のすべてで 500 でなければ「使われない」で、開き方ごとに根拠へ並べる', () => {
    const r = sum([vh(390, O.iphoneSafari), vh(412, O.androidChrome)])['W3-html'];
    expectVerdict(r, 'W3-html', '使われない');
    expect(r.evidence).toContain(O.iphoneSafari);
    expect(r.evidence).toContain(O.androidChrome);
  });
  it('どれかのスマホの開き方で幅が 500 になっていれば「使われる」', () => {
    const r = sum([vh(390, O.iphoneSafari), vh(500, O.androidChrome)])['W3-html'];
    expectVerdict(r, 'W3-html', '使われる');
    expect(r.evidence).toContain(O.androidChrome);
  });
  it('PC の行だけなら（幅が 500 でも）未確定', () => {
    expectUndecided(sum([vh(500, O.pcA)])['W3-html'], 'viewport.html');
  });
  it('行がなければ未確定', () => {
    expectUndecided(sum([])['W3-html'], 'viewport.html');
  });
});

describe('summarize_ W4 保存の残り方', () => {
  const det = (kind: string, hash = 'h1', via = 'exec') => J({ kind, hash, via });
  const st = (
    store: 'local' | 'idb',
    had: boolean,
    kind: string,
    origin: string,
    extra: { wrote?: boolean; via?: string; hash?: string } = {},
  ) =>
    row(
      `storage.${store}`,
      { had, count: had ? 2 : 1, wrote: extra.wrote ?? true },
      origin,
      det(kind, extra.hash, extra.via),
    );
  const none = { reload: '確かめていない', reopen: '確かめていない', unknown: '確かめていない' };
  const find = (r: any, o: string) => r.table.find((t: any) => t.origin === o);

  it('開き方ごと、保存の種類ごと、再読み込みと開き直しごとに、残った（n/m）、消えた、確かめていないを出す', () => {
    const rows = [
      st('local', false, 'reopen', O.iphoneSafari), // 最初の訪問は数えない
      st('local', true, 'reload', O.iphoneSafari),
      st('local', true, 'reopen', O.iphoneSafari),
      st('idb', false, 'reopen', O.iphoneSafari),
      st('idb', false, 'reload', O.iphoneSafari),
    ];
    const r = sum(rows).W4;
    expect(r.verdict).toBe('開き方ごとの表');
    expect(r.impact).toBe(designImpact('W4', '開き方ごとの表'));
    expect(r.table.map((t: any) => t.origin)).toEqual(ORIGIN_LIST);
    const iphone = find(r, O.iphoneSafari);
    expect(iphone.local).toEqual({
      reload: '残った（1/1）',
      reopen: '残った（1/1）',
      unknown: '確かめていない',
    });
    expect(iphone.idb).toEqual({
      reload: '消えた',
      reopen: '確かめていない',
      unknown: '確かめていない',
    });
    expect(find(r, O.androidLine).local).toEqual(none);
    expect(find(r, O.androidLine).idb).toEqual(none);
  });
  it('残った回と消えた回があれば「混ざった（残った回／確かめた回）」', () => {
    const rows = [
      st('local', false, 'reopen', O.androidChrome),
      st('local', true, 'reload', O.androidChrome),
      st('local', false, 'reload', O.androidChrome),
    ];
    expect(find(sum(rows).W4, O.androidChrome).local.reload).toBe('混ざった（1/2）');
  });
  it('2回以上残っていれば、残った回と確かめた回の数を出す', () => {
    const rows = [
      st('local', false, 'reopen', O.androidChrome),
      st('local', true, 'reload', O.androidChrome),
      st('local', true, 'reload', O.androidChrome),
    ];
    expect(find(sum(rows).W4, O.androidChrome).local.reload).toBe('残った（2/2）');
  });
  it('書けなかった行があれば「書けなかった」', () => {
    const rows = [
      st('idb', false, 'reopen', O.androidChrome, { wrote: false }),
      st('idb', false, 'reload', O.androidChrome, { wrote: false }),
    ];
    expect(find(sum(rows).W4, O.androidChrome).idb.reload).toBe('書けなかった');
  });
  it('sessionStorage が使えず見分けられない行（unknown）は、「見分けられない」と出す', () => {
    const rows = [
      st('local', false, 'unknown', O.androidLine),
      st('local', true, 'unknown', O.androidLine),
      st('idb', false, 'unknown', O.androidLine),
    ];
    const t = find(sum(rows).W4, O.androidLine);
    expect(t.local).toEqual({
      reload: '確かめていない',
      reopen: '確かめていない',
      unknown: '見分けられない',
    });
    expect(t.idb).toEqual({
      reload: '確かめていない',
      reopen: '確かめていない',
      unknown: '見分けられない',
    });
  });
  it('/dev の行は、残った消えたの判定に使わず、保存先のハッシュだけを開き方と入口ごとに出す', () => {
    const rows = [
      st('local', false, 'reopen', O.pcA, { hash: 'aaaa1111' }),
      st('local', true, 'reload', O.pcA, { hash: 'aaaa1111' }),
      st('local', false, 'reopen', O.pcA, { via: 'dev', hash: 'bbbb2222' }),
      st('local', false, 'reload', O.pcA, { via: 'dev', hash: 'bbbb2222' }),
    ];
    const r = sum(rows).W4;
    expect(find(r, O.pcA).local.reload).toBe('残った（1/1）');
    expect(r.storageOrigins).toEqual([
      { origin: O.pcA, via: 'exec', hash: 'aaaa1111' },
      { origin: O.pcA, via: 'dev', hash: 'bbbb2222' },
    ]);
  });
  it('storage の行がなければ未確定', () => {
    expectUndecided(sum([]).W4, 'storage');
  });
});

describe('summarize_ W5 meta とアイコン', () => {
  it('meta の名前ごとの結果、favicon の結果、ホーム画面のアイコンの控えを表にする', () => {
    const rows = [
      row('meta', { name: 'viewport', ok: true, error: '' }),
      row('meta', { name: 'apple-mobile-web-app-capable', ok: false, error: 'not allowed' }),
      row('favicon', { ok: false, error: 'bad url' }),
      row('user.homeicon', 'G のマーク', O.iphoneSafari),
    ];
    const r = sum(rows).W5;
    expect(r.verdict).toBe('種類ごとの表');
    expect(r.impact).toBe(designImpact('W5', '種類ごとの表'));
    expect(r.table.meta).toEqual([
      { name: 'viewport', ok: true, error: '' },
      { name: 'apple-mobile-web-app-capable', ok: false, error: 'not allowed' },
    ]);
    expect(r.table.favicon).toEqual({ ok: false, error: 'bad url' });
    expect(r.table.homeicon).toEqual([{ origin: O.iphoneSafari, text: 'G のマーク' }]);
  });
  it('meta の行がなければ未確定', () => {
    expectUndecided(sum([row('favicon', { ok: true, error: '' })]).W5, 'meta');
  });
});

describe('summarize_ W6 /dev と実行する人', () => {
  const ex = (via: string, ok = true, urlKind = via) =>
    J({ via, urlKind, effectiveIsOwner: ok, read: ok, wrote: ok });
  it('/exec で開いたすべての行で、持ち主で、読めて書けたら「成り立つ」。/dev の行は入口として表に並べる', () => {
    const rows = [
      row('exec', ex('exec'), O.pcB),
      row('exec', ex('exec'), O.iphoneSafari),
      row('exec', ex('dev', false), O.pcA),
      // doGet が書いた行（開き方がない）は使わない
      row('exec', ex('none', false), ''),
    ];
    const r = sum(rows).W6;
    expectVerdict(r, 'W6', '成り立つ');
    expect(r.table).toEqual([
      {
        origin: O.pcB,
        via: 'exec',
        urlKind: 'exec',
        effectiveIsOwner: true,
        read: true,
        wrote: true,
      },
      {
        origin: O.iphoneSafari,
        via: 'exec',
        urlKind: 'exec',
        effectiveIsOwner: true,
        read: true,
        wrote: true,
      },
      {
        origin: O.pcA,
        via: 'dev',
        urlKind: 'dev',
        effectiveIsOwner: false,
        read: false,
        wrote: false,
      },
    ]);
  });
  it('/exec の行で、持ち主でない、読めない、書けないものがあれば「成り立たない」で、その入口を並べる', () => {
    const rows = [row('exec', ex('exec'), O.pcB), row('exec', ex('exec', false), O.pcBA)];
    const r = sum(rows).W6;
    expectVerdict(r, 'W6', '成り立たない');
    expect(r.evidence).toContain(O.pcBA);
  });
  it('/exec の行がなければ未確定', () => {
    expectUndecided(sum([row('exec', ex('dev'), O.pcA)]).W6, 'exec');
  });
});

describe('summarize_ W7 往復の時間', () => {
  const rtt = (size: number, times: number[], origin: string) =>
    row('rtt', { size, times }, origin);
  it('開き方と大きさの組ごとに、中央値と最大を出す', () => {
    const rows = [
      rtt(200, [1500, 1200, 1100, 1300, 2000], O.pcB),
      rtt(5, [100, 200, 300, 400, 500], O.pcB),
      rtt(5, [100, 100, 100, 100, 100], O.iphoneLine),
    ];
    const r = sum(rows).W7;
    expect(r.table).toEqual([
      { origin: O.pcB, size: 5, median: 300, max: 500, over1s: false },
      { origin: O.pcB, size: 200, median: 1300, max: 2000, over1s: true },
      { origin: O.iphoneLine, size: 5, median: 100, max: 100, over1s: false },
    ]);
  });
  it('どれかの組で中央値が 1000 ミリ秒を超えたら「埋め込みが必須」', () => {
    const rows = [
      rtt(200, [1500, 1200, 1100, 1300, 2000], O.pcB),
      rtt(5, [1, 1, 1, 1, 1], O.iphoneLine),
    ];
    expectVerdict(sum(rows).W7, 'W7', '埋め込みが必須');
  });
  it('中央値がちょうど 1000 ミリ秒なら、必須にしない', () => {
    const rows = [rtt(200, [900, 1000, 1000, 1000, 1100], O.iphoneLine)];
    expectVerdict(sum(rows).W7, 'W7', '往復も実用の速さ');
  });
  it('すべての組が 1000 ミリ秒以下で、LINE の中のブラウザの行があれば「往復も実用の速さ」', () => {
    expectVerdict(
      sum([rtt(50, [100, 120, 110, 130, 90], O.androidLine)]).W7,
      'W7',
      '往復も実用の速さ',
    );
  });
  it('すべて速くても、LINE の中のブラウザの行がなければ未確定で LINE を出す', () => {
    expectUndecided(sum([rtt(50, [100, 120, 110, 130, 90], O.pcB)]).W7, 'LINE');
  });
  it('rtt の行がなければ未確定', () => {
    expectUndecided(sum([]).W7, 'rtt');
  });
});

describe('summarize_ W8 ログインの状態と開けるか', () => {
  const cannot = (o: string, state: 'cannot' | 'failed', text = 'Sorry') =>
    row('user.cannotopen', { origin: o, state, text }, O.pcIncog);
  it('開き方ごとに、5つの状態のどれかを出す', () => {
    const rows = [
      row('module', '動いた', O.pcA),
      row('module', '動いた', O.pcIncog),
      cannot(O.iphoneSafari, 'cannot', 'Sorry, unable to open the file'),
      cannot(O.androidChrome, 'failed'),
      row('module', '動いた', O.iphoneLine),
      cannot(O.iphoneLine, 'cannot'),
    ];
    const r = sum(rows).W8;
    expect(r.verdict).toBe('開き方ごとの表');
    expect(r.impact).toBe(designImpact('W8', '開き方ごとの表'));
    expect(r.table.map((t: any) => t.origin)).toEqual(ORIGIN_LIST);
    const by = (o: string) => r.table.find((t: any) => t.origin === o);
    expect(by(O.pcA).status).toBe('開けた');
    expect(by(O.iphoneSafari)).toMatchObject({
      status: '開けなかった',
      text: 'Sorry, unable to open the file',
    });
    expect(by(O.androidChrome).status).toBe('画面は出たがサーバーを呼べなかった');
    expect(by(O.iphoneLine).status).toBe('回によって違う');
    expect(by(O.androidLine).status).toBe('確かめていない');
  });
  it('行が1つもなければ未確定', () => {
    expectUndecided(sum([]).W8, '開き方');
  });
});

describe('summarize_ W9 開けないときの案内', () => {
  const opened = (o: string) => row('module', '動いた', o);
  const cannot = (o: string, state: 'cannot' | 'failed' = 'cannot') =>
    row('user.cannotopen', { origin: o, state, text: 'Sorry' }, O.pcIncog);
  const account = (o: string, v: string) => row('user.account', v, o);

  it.each(CUSTOMER_LIST)('お客さんの開き方（%s）が開けなければ「案内が要る」', (o) => {
    expectVerdict(sum([cannot(o)]).W9, 'W9', '案内が要る');
  });
  it('お客さんの開き方が「画面は出たがサーバーを呼べなかった」でも「案内が要る」', () => {
    expectVerdict(sum([cannot(O.androidChrome, 'failed')]).W9, 'W9', '案内が要る');
  });
  it('お客さんの開き方が「回によって違う」でも「案内が要る」', () => {
    expectVerdict(sum([opened(O.pcB), cannot(O.pcB)]).W9, 'W9', '案内が要る');
  });
  it('お客さんでない開き方（PC の A だけ、ホーム画面から、シークレット）が開けなくても数えない', () => {
    const rows = [opened(O.pcBA), opened(O.iphoneLine), cannot(O.pcA), cannot(O.iphoneHome)];
    expectVerdict(sum(rows).W9, 'W9', '案内は要らない');
  });
  it('確かめた開き方がすべて開け、B が既定で A も追加と LINE が入っていれば「案内は要らない」で、確かめていない開き方を根拠に並べる', () => {
    const r = sum([opened(O.pcBA), opened(O.iphoneLine)]).W9;
    expectVerdict(r, 'W9', '案内は要らない');
    expect(r.evidence).toContain(O.androidLine);
    expect(r.evidence).toContain(O.pcB);
  });
  it('Android の LINE だけが LINE の確かめでも「案内は要らない」', () => {
    expectVerdict(sum([opened(O.pcBA), opened(O.androidLine)]).W9, 'W9', '案内は要らない');
  });
  it('B が既定で A も追加を確かめていなければ未確定で、その開き方を出す', () => {
    const r = sum([opened(O.pcB), opened(O.iphoneLine), opened(O.androidLine)]).W9;
    expectUndecided(r, O.pcBA);
  });
  it('LINE の中を確かめていなければ未確定で、LINE の2つの開き方を出す', () => {
    const r = sum([opened(O.pcB), opened(O.pcBA)]).W9;
    expectUndecided(r, O.iphoneLine);
    expect(r.pending).toContain(O.androidLine);
  });
  it('A でログインしたスマホの行は、お客さんの判定に数えず、根拠に別に並べる', () => {
    const rows = [
      opened(O.pcBA),
      opened(O.iphoneLine),
      account(O.iphoneLine, 'A'),
      opened(O.androidLine),
      account(O.androidLine, 'B'),
    ];
    const r = sum(rows).W9;
    expectVerdict(r, 'W9', '案内は要らない');
    expect(r.evidence).toContain('数えない');
    expect(r.evidence).toContain(O.iphoneLine);
  });
  it('LINE の行が A でログインしたものだけなら、LINE を確かめていないことになり未確定', () => {
    const rows = [opened(O.pcBA), opened(O.iphoneLine), account(O.iphoneLine, 'A')];
    expectUndecided(sum(rows).W9, O.androidLine);
  });
  it('A でログインしたスマホが開けなかった場合も、お客さんの判定には数えない', () => {
    const rows = [
      opened(O.pcBA),
      opened(O.androidLine),
      opened(O.iphoneSafari),
      account(O.iphoneSafari, 'A'),
      cannot(O.iphoneSafari),
    ];
    expectVerdict(sum(rows).W9, 'W9', '案内は要らない');
  });
});
