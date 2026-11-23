// DESIGN.md §5.3 GAS を呼ぶ部分（gas/Code.js）のテスト。偽物は test/fakes.ts。
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { createWorld, plain, LOG, SUMMARY, type Opts } from './fakes';
import { O, ORIGIN_LIST } from './design-table';

/* eslint-disable @typescript-eslint/no-explicit-any */

function setup(opts: Opts = {}, prepared = true) {
  const w = createWorld(opts);
  const g = w.load();
  const placeholder = vm.runInContext('PLACEHOLDER', g) as string;
  const buildPlaceholder = vm.runInContext('BUILD_PLACEHOLDER', g) as string;
  // Page.html の代わり。メニューの JSON の目印と、ビルドの印の目印（別の meta）を持つ
  const page = (tag = '') =>
    `<html>${tag}<meta name="t14-build" content="${buildPlaceholder}"><script type="application/json" id="embed">${placeholder}</script></html>`;
  w.opts.pageHtml = page();
  if (prepared) g.menuSetup();
  w.calls.length = 0;
  return { w, g, placeholder, buildPlaceholder, page };
}
// ログの行を { scenario, origin, fact, value, detail, build } にする
// （列は日時、シナリオ、開き方、事実、値、詳細、ビルドの印）
const rowsOf = (w: any) =>
  w.logRows().map((r: string[]) => ({
    time: r[0],
    scenario: r[1],
    origin: r[2],
    fact: r[3],
    value: r[4],
    detail: r[5],
    build: r[6],
  }));
const byFact = (w: any, fact: string) => rowsOf(w).filter((r: any) => r.fact === fact);
// ログに行を書く呼び出し（書けるかの確かめに使うログの H1 は除く）
const isLogWrite = (c: string) =>
  c === `appendRow:${LOG}` || (c.startsWith(`write:${LOG}!`) && c !== `write:${LOG}!H1`);

describe('onOpen とメニュー', () => {
  it('準備、まとめを作る、区切りを書く の3つの項目を作る', () => {
    const { w, g } = setup({}, false);
    g.onOpen({});
    const fns = w.menus.flatMap((m: any) => m.items.map((i: any) => i[1]));
    expect(fns).toEqual(expect.arrayContaining(['menuSetup', 'menuSummarize', 'menuMark']));
  });
});

describe('doGet', () => {
  it('Page.html を読み、目印を置き換えて createHtmlOutput に渡す', () => {
    const { w, g, placeholder } = setup();
    g.doGet({});
    expect(w.calls).toContain('readHtml:Page');
    expect(w.outputs).toHaveLength(1);
    const html: string = w.outputs[0].html;
    expect(html).not.toContain(placeholder);
    const json = html.split('id="embed">')[1]!.split('</script>')[0]!;
    const catalog = JSON.parse(json);
    // W1 の確かめ用に、置き換えで壊れやすい文字を含む値を入れておく
    const text = JSON.stringify(catalog);
    for (const token of ['$&', '$1', '</script>', ' ']) expect(text, token).toContain(token);
  });
  it('埋め込む値は、置き換えの後も script が閉じない（</script> が1つだけ）', () => {
    const { w, g } = setup();
    g.doGet({});
    expect((w.outputs[0].html as string).match(/<\/script>/g)).toHaveLength(1);
  });
  it("addMetaTag('viewport', …) を付け、タイトルも付ける", () => {
    const { w, g } = setup();
    g.doGet({});
    expect(w.outputs[0].metas.map((m: any) => m[0])).toContain('viewport');
    expect(w.outputs[0].title).not.toBe('');
  });
  it('決めた名前ごとに addMetaTag を試し、名前ごとに meta の行を書く', () => {
    const { w, g } = setup();
    const names = plain(vm.runInContext('META_NAMES', g)) as string[];
    expect(names.length).toBeGreaterThanOrEqual(4);
    expect(names).toContain('viewport');
    g.doGet({});
    expect(w.outputs[0].metas.map((m: any) => m[0])).toEqual(expect.arrayContaining(names));
    const rows = byFact(w, 'meta').map((r: any) => JSON.parse(r.value));
    expect(rows.map((r: any) => r.name).sort()).toEqual([...names].sort());
    expect(rows.every((r: any) => r.ok === true && r.error === '')).toBe(true);
  });
  it('addMetaTag が例外を出しても止まらず、使えなかったことを meta の行に書く', () => {
    const { w, g } = setup({ metaThrows: ['*'], metaMessage: 'attribute not allowed' });
    expect(g.doGet({})).toBeTruthy();
    const rows = byFact(w, 'meta').map((r: any) => JSON.parse(r.value));
    expect(rows.length).toBeGreaterThanOrEqual(4);
    for (const r of rows) {
      expect(r.ok).toBe(false);
      expect(r.error).toContain('attribute not allowed');
    }
  });
  it('setFaviconUrl を試し、結果を favicon の行に書く', () => {
    const { w, g } = setup();
    g.doGet({});
    expect(w.outputs[0].favicon).not.toBeNull();
    expect(JSON.parse(byFact(w, 'favicon')[0].value)).toEqual({ ok: true, error: '' });
  });
  it('setFaviconUrl が例外を出しても止まらず、使えなかったことを書く', () => {
    const { w, g } = setup({ faviconThrows: 'favicon rejected' });
    expect(g.doGet({})).toBeTruthy();
    const v = JSON.parse(byFact(w, 'favicon')[0].value);
    expect(v.ok).toBe(false);
    expect(v.error).toContain('favicon rejected');
  });
  it('exec の行（開き方なし）に、getUrl() の種類、実行する人が持ち主か、シートを読めたか、書けたかを書く', () => {
    const { w, g } = setup();
    g.doGet({});
    const v = JSON.parse(byFact(w, 'exec')[0].value);
    expect(v).toEqual({
      via: 'none',
      urlKind: 'exec',
      effectiveIsOwner: true,
      read: true,
      wrote: true,
    });
    expect(byFact(w, 'exec')[0].origin).toBe('');
  });
  it('行をまとめて1回で書く（meta、favicon、exec、build の行が1回の書き込み）', () => {
    const { w, g } = setup();
    g.doGet({});
    const names = plain(vm.runInContext('META_NAMES', g)) as string[];
    expect(rowsOf(w).length).toBeGreaterThanOrEqual(names.length + 3);
    expect(w.calls.filter(isLogWrite)).toHaveLength(1);
  });
  it('ログを書くときは、LockService で順番にする（ロックを取ってから書き、書いた後に放す）', () => {
    const { w, g } = setup();
    g.doGet({});
    const wait = w.calls.indexOf('lock.wait');
    const write = w.calls.findIndex(isLogWrite);
    const release = w.calls.lastIndexOf('lock.release');
    expect(wait).toBeGreaterThanOrEqual(0);
    expect(write).toBeGreaterThan(wait);
    expect(release).toBeGreaterThan(write);
  });
  it('ビルドの印を、メニューの JSON とは別の meta に埋め、build の行と、書いた行すべての印の列に書く', () => {
    const { w, g, buildPlaceholder } = setup();
    g.doGet({});
    const html: string = w.outputs[0].html;
    expect(html).not.toContain(buildPlaceholder);
    const mark = /<meta name="t14-build" content="([0-9a-f]{8})">/.exec(html)?.[1];
    expect(mark).toBeTruthy();
    const buildRows = byFact(w, 'build');
    expect(buildRows).toHaveLength(1);
    expect(buildRows[0].value).toBe(mark);
    for (const r of rowsOf(w)) expect(r.build).toBe(mark);
    // メニューの JSON の中には、印を入れない（JSON が壊れても、印は meta から読める）
    const json = html.split('id="embed">')[1]!.split('</script>')[0]!;
    expect(json).not.toContain(mark);
  });
  it('ビルドの印は、Page.html とサーバーのコードの版（SERVER_VERSION）を合わせたハッシュ', () => {
    const { w, g } = setup();
    const version = vm.runInContext('SERVER_VERSION', g) as string;
    expect(typeof version).toBe('string');
    expect(version).not.toBe('');
    g.doGet({});
    expect(byFact(w, 'build')[0].value).toBe(g.hash8_(w.opts.pageHtml + version));
  });
  it('Page.html が違えばビルドの印も違い、同じなら同じ', () => {
    const buildOf = (tag: string) => {
      const { w, g, page } = setup();
      w.opts.pageHtml = page(tag);
      g.doGet({});
      return byFact(w, 'build')[0].value;
    };
    expect(buildOf('A')).toBe(buildOf('A'));
    expect(buildOf('A')).not.toBe(buildOf('B'));
  });
  it('getActiveSpreadsheet() が null でも、準備で保存した ID でログに書く', () => {
    const { w, g } = setup();
    w.setActiveNull(true);
    g.doGet({});
    expect(byFact(w, 'meta').length).toBeGreaterThan(0);
  });
  it('ログに書けなくても（準備の前でも）、画面は返す', () => {
    const { w, g } = setup({}, false);
    w.setActiveNull(true);
    expect(g.doGet({})).toBeTruthy();
    expect(w.outputs).toHaveLength(1);
  });
  it('ログに、メールアドレスと URL を書かない', () => {
    const { w, g } = setup();
    g.doGet({});
    const all = JSON.stringify(w.logRows());
    expect(all).not.toContain('owner.dummy@example.com');
    expect(all).not.toContain('AKfycbDUMMYDEPLOYMENTID');
  });
  it('書いた行を summarize_ に渡すと、W5 の表になる', () => {
    const { w, g } = setup({ metaThrows: ['theme-color'], metaMessage: 'nope' });
    g.doGet({});
    const out = plain(g.summarize_(rowsOf(w))) as any;
    expect(out.W5.verdict).toBe('種類ごとの表');
    const tc = out.W5.table.meta.find((m: any) => m.name === 'theme-color');
    expect(tc).toMatchObject({ ok: false });
    expect(tc.error).toContain('nope');
  });
});

describe('recordFact（画面から呼ぶ）', () => {
  // recordFact(scenario, origin, fact, value, detail, build)
  const call = (g: any, ...a: unknown[]) => g.recordFact(...a);
  const good = ['W3', O.iphoneSafari, 'viewport', '{"innerWidth":390}', '{"ua":"x"}', 'b1'];

  it('シナリオ、開き方、事実、値、詳細、ビルドの印を、1行に書く', () => {
    const { w, g } = setup();
    call(g, ...good);
    expect(rowsOf(w)[0]).toMatchObject({
      scenario: 'W3',
      origin: O.iphoneSafari,
      fact: 'viewport',
      value: '{"innerWidth":390}',
      detail: '{"ua":"x"}',
      build: 'b1',
    });
  });
  it('シナリオと開き方が空の行も書ける（開き方を選ぶ前の module、embed の行）', () => {
    const { w, g } = setup();
    call(g, '', '', 'module', '動いた', '', 'b1');
    expect(rowsOf(w)).toHaveLength(1);
  });
  it.each([0, 1, 2, 3, 4, 5])('%i 番目の引数が文字列でなければ断り、行を書かない', (i) => {
    const { w, g } = setup();
    for (const bad of [123, null, undefined, { a: 1 }, ['x']]) {
      const a = [...good];
      a[i] = bad as any;
      expect(() => call(g, ...a)).toThrow();
    }
    expect(rowsOf(w)).toHaveLength(0);
  });
  it('決めた一覧にないシナリオは断る', () => {
    const { w, g } = setup();
    expect(() => call(g, 'W99', '', 'module', '動いた', '', 'b1')).toThrow();
    expect(() => call(g, 'x'.repeat(300), '', 'module', '動いた', '', 'b1')).toThrow();
    expect(rowsOf(w)).toHaveLength(0);
  });
  it('決めた一覧にない開き方は断る（一覧の9つと空は通る）', () => {
    const { w, g } = setup();
    expect(() => call(g, 'W3', 'どこか', 'viewport', '{}', '', 'b1')).toThrow();
    for (const o of ORIGIN_LIST) call(g, 'W3', o, 'viewport', '{}', '', 'b1');
    expect(rowsOf(w)).toHaveLength(ORIGIN_LIST.length);
  });
  it('決めた一覧にない事実は断る', () => {
    const { w, g } = setup();
    expect(() => call(g, 'W1', '', 'evil', 'x', '', 'b1')).toThrow();
    expect(() => call(g, 'W1', '', 'user.admin', 'x', '', 'b1')).toThrow();
    expect(rowsOf(w)).toHaveLength(0);
  });
  it('exec と build の事実は、recordFact では書けない（サーバーだけが書く）', () => {
    const { w, g } = setup();
    expect(() => call(g, 'W6', O.pcB, 'exec', '{}', '', 'b1')).toThrow();
    expect(() => call(g, '', '', 'build', 'x', '', 'b1')).toThrow();
    expect(rowsOf(w)).toHaveLength(0);
  });
  it('開き方は 100 字までで、101 字の開き方は断る', () => {
    const { g } = setup();
    expect(() => call(g, 'W3', 'あ'.repeat(101), 'viewport', '{}', '', 'b1')).toThrow();
  });
  it('ビルドの印は 100 字で切る', () => {
    const { w, g } = setup();
    call(g, 'W3', O.iphoneSafari, 'viewport', '{}', '', 'x'.repeat(150));
    expect(rowsOf(w)[0].build).toHaveLength(100);
  });
  it('値と詳細は 1500 字で切る', () => {
    const { w, g } = setup();
    call(g, 'W5', O.iphoneSafari, 'user.homeicon', 'a'.repeat(2000), 'b'.repeat(2000), 'b1');
    expect(rowsOf(w)[0].value).toHaveLength(1500);
    expect(rowsOf(w)[0].detail).toHaveLength(1500);
  });
  it('メールアドレスと URL を伏せてから書く', () => {
    const { w, g } = setup();
    call(
      g,
      'W5',
      O.iphoneSafari,
      'user.homeicon',
      'taro.dummy@example.com',
      'https://script.google.com/macros/s/AKfycbDUMMY123/exec',
      'b1',
    );
    const r = rowsOf(w)[0];
    expect(r.value).toBe('ta***@example.com');
    expect(r.detail).not.toContain('AKfycbDUMMY123');
  });
  it('= で始まる値も数式にならない（列を書式なしテキストにしてから書く）', () => {
    const { w, g } = setup();
    call(g, 'W5', O.iphoneSafari, 'user.homeicon', '=HYPERLINK("http://x.example")', '+1', 'b1');
    expect(rowsOf(w)[0].value).toBe('=HYPERLINK("http://x.example")');
    expect(w.formulaCells).toEqual([]);
    const calls: string[] = w.calls;
    const fmt = calls.findIndex((c) => c.startsWith(`format:${LOG}!`) && c.endsWith(':@'));
    expect(fmt).toBeGreaterThanOrEqual(0);
    expect(fmt).toBeLessThan(calls.indexOf(`appendRow:${LOG}`));
  });
  it('書くときは、LockService で順番にする', () => {
    const { w, g } = setup();
    call(g, ...good);
    const wait = w.calls.indexOf('lock.wait');
    const write = w.calls.indexOf(`appendRow:${LOG}`);
    const release = w.calls.lastIndexOf('lock.release');
    expect(wait).toBeGreaterThanOrEqual(0);
    expect(write).toBeGreaterThan(wait);
    expect(release).toBeGreaterThan(write);
  });
  it('getActiveSpreadsheet() が null でも、準備で保存した ID でログに書く', () => {
    const { w, g } = setup();
    w.setActiveNull(true);
    call(g, ...good);
    expect(rowsOf(w)).toHaveLength(1);
  });
  it('準備の前に getActiveSpreadsheet() が null なら、スプレッドシートを特定できず例外', () => {
    const { w, g } = setup({}, false);
    w.setActiveNull(true);
    expect(() => call(g, ...good)).toThrow();
  });
});

describe('probeExec（画面から呼ぶ。W6）', () => {
  // probeExec(origin, via, build)。via は画面が URL の引数から読んだ exec、dev、none
  it('開き方つきで exec の行を書き、同じ中身を返す', () => {
    const { w, g } = setup();
    const ret = JSON.parse(g.probeExec(O.pcB, 'exec', 'b1'));
    expect(ret).toEqual({
      via: 'exec',
      urlKind: 'exec',
      effectiveIsOwner: true,
      read: true,
      wrote: true,
    });
    const r = byFact(w, 'exec')[0];
    expect(r.origin).toBe(O.pcB);
    expect(r.build).toBe('b1');
    expect(JSON.parse(r.value)).toEqual(ret);
  });
  it('実行する人が持ち主でなければ effectiveIsOwner は false（メールアドレスは書かない）', () => {
    const { w, g } = setup({ effective: 'someone.else@example.com' });
    const ret = JSON.parse(g.probeExec(O.pcB, 'exec', 'b1'));
    expect(ret.effectiveIsOwner).toBe(false);
    expect(JSON.stringify(w.logRows())).not.toContain('someone.else@');
  });
  it('via と getUrl() の種類は、別々に書く（/dev の URL でも via が exec なら、via は exec）', () => {
    const { g } = setup({
      url: 'https://script.google.com/macros/s/AKfycbDUMMYDEPLOYMENTID1234567890abcdef/dev',
    });
    const ret = JSON.parse(g.probeExec(O.pcA, 'exec', 'b1'));
    expect(ret.via).toBe('exec');
    expect(ret.urlKind).toBe('dev');
  });
  it.each(['exec', 'dev', 'none'])('via が %s なら通る', (via) => {
    const { g } = setup();
    expect(JSON.parse(g.probeExec(O.pcA, via, 'b1')).via).toBe(via);
  });
  it('via が決めた値でなければ断る', () => {
    const { w, g } = setup();
    expect(() => g.probeExec(O.pcA, 'prod', 'b1')).toThrow();
    expect(byFact(w, 'exec')).toHaveLength(0);
  });
  it('開き方が一覧にないか、文字列でなければ断る', () => {
    const { g } = setup();
    expect(() => g.probeExec('どこか', 'exec', 'b1')).toThrow();
    expect(() => g.probeExec(5, 'exec', 'b1')).toThrow();
    expect(() => g.probeExec(O.pcA, 'exec', 5)).toThrow();
  });
  it('書いた行を summarize_ に渡すと、/exec の行が W6「成り立つ」、持ち主でなければ「成り立たない」', () => {
    const ok = setup();
    ok.g.probeExec(O.pcB, 'exec', 'b1');
    expect((plain(ok.g.summarize_(rowsOf(ok.w))) as any).W6.verdict).toBe('成り立つ');
    const ng = setup({ effective: 'someone.else@example.com' });
    ng.g.probeExec(O.pcB, 'exec', 'b1');
    expect((plain(ng.g.summarize_(rowsOf(ng.w))) as any).W6.verdict).toBe('成り立たない');
  });
});

describe('getPayload（往復の時間を測るための JSON）', () => {
  it.each([5, 50, 200])('%i KB を指定すると、その大きさの JSON の文字列を返す', (kb) => {
    const { g } = setup();
    const s = g.getPayload(kb);
    expect(typeof s).toBe('string');
    expect(() => JSON.parse(s)).not.toThrow();
    expect(s.length).toBe(kb * 1024);
  });
  it.each([0, 1, 6, 5.5, 1000, -5, '5', null, undefined])('%s は断る', (bad) => {
    const { g } = setup();
    expect(() => g.getPayload(bad)).toThrow();
  });
});

describe('menuSummarize', () => {
  it('ログの行から、まとめのタブに判定を書く', () => {
    const { w, g } = setup();
    g.recordFact('W1', '', 'embed', '{"read":true,"same":true}', '', 'b1');
    g.menuSummarize();
    const sh = w.sheetOf(SUMMARY);
    expect(sh).toBeTruthy();
    const text = JSON.stringify(sh.getRange(1, 1, sh.getLastRow(), 6).getValues());
    expect(text).toContain('W1');
    expect(text).toContain('読める');
    expect(w.formulaCells).toEqual([]);
  });
  it('最新のビルドの印（doGet が書いた build の行）の行だけを使う。古い行は使わない', () => {
    const { w, g, page } = setup();
    const doGetWith = (tag: string) => {
      w.opts.pageHtml = page(tag);
      g.doGet({});
      const builds = byFact(w, 'build');
      return builds[builds.length - 1].value as string;
    };
    const oldBuild = doGetWith('old');
    g.recordFact('W1', '', 'embed', '{"read":true,"same":false}', '', oldBuild);
    const newBuild = doGetWith('new');
    g.recordFact('W1', '', 'embed', '{"read":true,"same":true}', '', newBuild);
    g.menuSummarize();
    const sh = w.sheetOf(SUMMARY);
    const rows = sh.getRange(1, 1, sh.getLastRow(), 6).getValues() as string[][];
    expect(rows.find((r) => r[0] === 'W1')![2]).toBe('読める');
  });
  it('まとめの先頭に、使った印と、外した行の数とその印を出す', () => {
    const { w, g, page } = setup();
    const doGetWith = (tag: string) => {
      w.opts.pageHtml = page(tag);
      g.doGet({});
      const builds = byFact(w, 'build');
      return builds[builds.length - 1].value as string;
    };
    const oldBuild = doGetWith('old');
    g.recordFact('W1', '', 'embed', '{"read":true,"same":false}', '', oldBuild);
    const newBuild = doGetWith('new');
    g.menuSummarize();
    const sh = w.sheetOf(SUMMARY);
    const head = JSON.stringify(sh.getRange(1, 1, 2, 7).getValues());
    expect(head).toContain(newBuild);
    expect(head).toContain(oldBuild);
    expect(head).toContain('外した');
  });
});
