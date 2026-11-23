// DESIGN.md §5.1 サーバーの純粋な関数（gas/Logic.js）のテスト。判定の表（§2）と summarize_ は対応させる。
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { createWorld, plain } from './fakes';
import { designImpact, designVerdicts, O, ORIGIN_LIST } from './design-table';

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
  it('開き方の一覧が、DESIGN.md §2 の一覧と同じ（順も同じ）', () => {
    expect(ORIGIN_LIST).toHaveLength(8);
    expect(plain(vm.runInContext('ORIGINS', ctx))).toEqual(ORIGIN_LIST);
  });
});

// ---------------------------------------------------------------- summarize_

// 行は { time, scenario, origin, fact, value, detail }。値と詳細は文字列（表計算のセルの値）
const row = (fact: string, value: unknown, origin = '', detail = '') => ({
  time: '2026-01-01 09:00:00',
  scenario: '',
  origin,
  fact,
  value: typeof value === 'string' ? value : JSON.stringify(value),
  detail,
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
  it('スマホの行で、画面の幅が端末の幅に近く、合って見えたと控えたら「合う」', () => {
    const rows = [vp(390), row('user.width', 'はい', O.iphoneSafari)];
    expectVerdict(sum(rows).W3, 'W3', '合う');
  });
  it('画面の幅が端末の幅よりずっと大きければ「合わない」', () => {
    const rows = [vp(980), row('user.width', 'はい', O.iphoneSafari)];
    expectVerdict(sum(rows).W3, 'W3', '合わない');
  });
  it('合って見えなかったと控えたら「合わない」', () => {
    const rows = [vp(390), row('user.width', 'いいえ', O.iphoneSafari)];
    expectVerdict(sum(rows).W3, 'W3', '合わない');
  });
  it.each([
    [381, '合う'], // 0.95 倍より大きい
    [419, '合う'], // 1.05 倍より小さい
    [379, '合わない'], // 0.95 倍より小さい
    [421, '合わない'], // 1.05 倍より大きい
  ])('端末の幅 400 に対して、画面の幅 %i は「%s」（0.95〜1.05 倍の境目）', (w, verdict) => {
    const rows = [vp(w, O.androidChrome, 400), row('user.width', 'はい', O.androidChrome)];
    expectVerdict(sum(rows).W3, 'W3', verdict);
  });
  it('スマホの開き方のどれかが成り立てば「合う」', () => {
    const rows = [
      vp(980, O.iphoneLine),
      row('user.width', 'はい', O.iphoneLine),
      vp(390, O.iphoneSafari),
      row('user.width', 'はい', O.iphoneSafari),
    ];
    expectVerdict(sum(rows).W3, 'W3', '合う');
  });
  it('スマホの行に、控えがなければ未確定で user.width を出す', () => {
    expectUndecided(sum([vp(390)]).W3, 'user.width');
  });
  it('PC の行だけなら未確定', () => {
    expectUndecided(sum([vp(1200, O.pcA), row('user.width', 'はい', O.pcA)]).W3, 'viewport');
  });
});

describe('summarize_ W3-html HTML の中の viewport', () => {
  it('width=500 が効いていなければ「使われない」', () => {
    const rows = [row('viewport.html', { innerWidth: 390 }, O.iphoneSafari)];
    expectVerdict(sum(rows)['W3-html'], 'W3-html', '使われない');
  });
  it('幅が 500 になっていれば「使われる」', () => {
    const rows = [row('viewport.html', { innerWidth: 500 }, O.iphoneSafari)];
    expectVerdict(sum(rows)['W3-html'], 'W3-html', '使われる');
  });
  it('行がなければ未確定', () => {
    expectUndecided(sum([])['W3-html'], 'viewport.html');
  });
});

describe('summarize_ W4 保存の残り方', () => {
  const st = (
    kind: 'local' | 'idb',
    had: boolean,
    detail: 'reload' | 'reopen' | 'unknown',
    origin: string,
  ) => row(`storage.${kind}`, { had, count: had ? 2 : 1, wrote: true }, origin, detail);
  it('開き方ごと、保存の種類ごと、再読み込みと開き直しごとに、残った、消えた、確かめていないを出す', () => {
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
    const iphone = r.table.find((t: any) => t.origin === O.iphoneSafari);
    expect(iphone.local).toEqual({ reload: '残った', reopen: '残った', unknown: '確かめていない' });
    expect(iphone.idb).toEqual({
      reload: '消えた',
      reopen: '確かめていない',
      unknown: '確かめていない',
    });
    const other = r.table.find((t: any) => t.origin === O.androidLine);
    const none = { reload: '確かめていない', reopen: '確かめていない', unknown: '確かめていない' };
    expect(other.local).toEqual(none);
    expect(other.idb).toEqual(none);
  });
  it('sessionStorage が使えず見分けられない行（unknown）は、「見分けられない」と出す', () => {
    const rows = [
      st('local', false, 'unknown', O.androidLine),
      st('local', true, 'unknown', O.androidLine),
      st('idb', false, 'unknown', O.androidLine),
    ];
    const r = sum(rows).W4;
    expect(r.verdict).toBe('開き方ごとの表');
    const t = r.table.find((x: any) => x.origin === O.androidLine);
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
  it('入口（exec、dev）と開き方ごとの、持ち主か、読めたか、書けたかを表にする', () => {
    const rows = [
      row('exec', { kind: 'exec', effectiveIsOwner: true, read: true, wrote: true }, O.pcB),
      row('exec', { kind: 'dev', effectiveIsOwner: false, read: false, wrote: false }, O.pcB),
      // doGet が書いた行（開き方がない）は表に入れない
      row('exec', { kind: 'exec', effectiveIsOwner: true, read: true, wrote: true }),
    ];
    const r = sum(rows).W6;
    expect(r.verdict).toBe('入口ごとの表');
    expect(r.impact).toBe(designImpact('W6', '入口ごとの表'));
    expect(r.table).toEqual([
      { origin: O.pcB, kind: 'exec', effectiveIsOwner: true, read: true, wrote: true },
      { origin: O.pcB, kind: 'dev', effectiveIsOwner: false, read: false, wrote: false },
    ]);
  });
  it('開き方つきの exec の行がなければ未確定', () => {
    expectUndecided(
      sum([row('exec', { kind: 'exec', effectiveIsOwner: true, read: true, wrote: true })]).W6,
      'exec',
    );
  });
});

describe('summarize_ W7 往復の時間', () => {
  it('大きさごとの中央値と最大を出し、中央値が1秒を超える大きさがあれば埋め込みを必須にする', () => {
    const rows = [
      row('rtt', { size: 200, times: [1500, 1200, 1100, 1300, 2000] }),
      row('rtt', { size: 5, times: [100, 200, 300, 400, 500] }),
    ];
    const r = sum(rows).W7;
    expect(r.verdict).toBe('大きさごとの表');
    expect(r.impact).toBe(designImpact('W7', '大きさごとの表'));
    expect(r.table).toEqual([
      { size: 5, median: 300, max: 500, over1s: false },
      { size: 200, median: 1300, max: 2000, over1s: true },
    ]);
    expect(r.embedRequired).toBe(true);
  });
  it('どの大きさも中央値が1秒以内なら、埋め込みを必須にしない', () => {
    const r = sum([row('rtt', { size: 50, times: [100, 120, 110, 130, 90] })]).W7;
    expect(r.embedRequired).toBe(false);
  });
  it('rtt の行がなければ未確定', () => {
    expectUndecided(sum([]).W7, 'rtt');
  });
});

describe('summarize_ W8 ログインの状態と開けるか', () => {
  it('行が来た開き方は「開けた」、開けなかったと控えた開き方は文言つきの「開けなかった」、ほかは「確かめていない」', () => {
    const rows = [
      row('module', '動いた', O.pcA),
      row('module', '動いた', O.pcIncog),
      row('user.cannotopen', { origin: O.pcAB, text: 'Sorry, unable to open the file' }, O.pcIncog),
    ];
    const r = sum(rows).W8;
    expect(r.verdict).toBe('開き方ごとの表');
    expect(r.impact).toBe(designImpact('W8', '開き方ごとの表'));
    expect(r.table.map((t: any) => t.origin)).toEqual(ORIGIN_LIST);
    const by = (o: string) => r.table.find((t: any) => t.origin === o);
    expect(by(O.pcA).status).toBe('開けた');
    expect(by(O.pcAB)).toMatchObject({
      status: '開けなかった',
      text: 'Sorry, unable to open the file',
    });
    expect(by(O.iphoneLine).status).toBe('確かめていない');
  });
  it('行が1つもなければ未確定', () => {
    expectUndecided(sum([]).W8, '開き方');
  });
});

describe('summarize_ W9 開けないときの案内', () => {
  const opened = (o: string) => row('module', '動いた', o);
  const cannot = (o: string) => row('user.cannotopen', { origin: o, text: 'Sorry' }, O.pcIncog);
  const customer = [O.pcA, O.pcAB, O.iphoneLine, O.androidLine];
  it('お客さんが使い得る開き方のどれかで開けなければ「案内が要る」', () => {
    const rows = [opened(O.pcA), cannot(O.pcAB), opened(O.iphoneLine), opened(O.androidLine)];
    expectVerdict(sum(rows).W9, 'W9', '案内が要る');
  });
  it('お客さんが使い得る開き方がすべて開ければ「案内は要らない」', () => {
    expectVerdict(sum(customer.map(opened)).W9, 'W9', '案内は要らない');
  });
  it('確かめた開き方がすべて開け、PC の A と B と LINE（iPhone だけ）が入っていれば「案内は要らない」で、確かめていない開き方を根拠に並べる', () => {
    const r = sum([opened(O.pcAB), opened(O.iphoneLine)]).W9;
    expectVerdict(r, 'W9', '案内は要らない');
    expect(r.evidence).toContain(O.androidLine);
    expect(r.evidence).toContain(O.pcA);
  });
  it('Android の LINE だけが LINE の確かめでも「案内は要らない」', () => {
    expectVerdict(sum([opened(O.pcAB), opened(O.androidLine)]).W9, 'W9', '案内は要らない');
  });
  it('PC の A と B の両方を確かめていなければ未確定', () => {
    const r = sum([opened(O.pcA), opened(O.iphoneLine), opened(O.androidLine)]).W9;
    expectUndecided(r, O.pcAB);
  });
  it('LINE の中を確かめていなければ未確定で、LINE の2つの開き方を出す', () => {
    const r = sum([opened(O.pcA), opened(O.pcAB)]).W9;
    expectUndecided(r, O.iphoneLine);
    expect(r.pending).toContain(O.androidLine);
  });
  it('1つでも開けなかったものがあれば、ほかが未確認でも「案内が要る」', () => {
    expectVerdict(sum([cannot(O.androidLine)]).W9, 'W9', '案内が要る');
  });
});
