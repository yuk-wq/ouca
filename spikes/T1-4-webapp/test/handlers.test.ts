// DESIGN.md §5.3 GAS を呼ぶ部分（gas/Code.js）のテスト。偽物は test/fakes.ts。
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { createWorld, plain, LOG, SUMMARY, type Opts } from './fakes';

/* eslint-disable @typescript-eslint/no-explicit-any */

function setup(opts: Opts = {}, prepared = true) {
  const w = createWorld(opts);
  const g = w.load();
  const placeholder = vm.runInContext('PLACEHOLDER', g) as string;
  w.opts.pageHtml = `<html><script type="application/json" id="embed">${placeholder}</script></html>`;
  if (prepared) g.menuSetup();
  w.calls.length = 0;
  return { w, g, placeholder };
}
// ログの行を { scenario, origin, fact, value, detail } にする（列は日時、シナリオ、開き方、事実、値、詳細）
const rowsOf = (w: any) =>
  w.logRows().map((r: string[]) => ({
    scenario: r[1],
    origin: r[2],
    fact: r[3],
    value: r[4],
    detail: r[5],
  }));
const byFact = (w: any, fact: string) => rowsOf(w).filter((r: any) => r.fact === fact);

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
    for (const token of ['$&', '$1', '</script>', '\u2028']) expect(text, token).toContain(token);
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
    const out = g.doGet({});
    expect(out).toBeTruthy();
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
  it('exec の行に、URL の種類、実行する人が持ち主か、シートを読めたか、書けたかを書く', () => {
    const { w, g } = setup();
    g.doGet({});
    const v = JSON.parse(byFact(w, 'exec')[0].value);
    expect(v).toEqual({ kind: 'exec', effectiveIsOwner: true, read: true, wrote: true });
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
});

describe('recordFact（画面から呼ぶ）', () => {
  const call = (g: any, ...a: unknown[]) => g.recordFact(...a);
  it('シナリオ、開き方、事実、値、詳細を、1行に書く', () => {
    const { w, g } = setup();
    call(g, 'W1', 'PC の Chrome', 'embed', '{"read":true}', 'メモ');
    const r = rowsOf(w)[0];
    expect(r).toMatchObject({
      scenario: 'W1',
      origin: 'PC の Chrome',
      fact: 'embed',
      value: '{"read":true}',
      detail: 'メモ',
    });
  });
  it.each([0, 1, 2, 3, 4])('%i 番目の引数が文字列でなければ断り、行を書かない', (i) => {
    const { w, g } = setup();
    const args: unknown[] = ['W1', 'o', 'embed', 'v', 'd'];
    for (const bad of [123, null, undefined, { a: 1 }, ['x']]) {
      const a = [...args];
      a[i] = bad;
      expect(() => call(g, ...a)).toThrow();
    }
    expect(rowsOf(w)).toHaveLength(0);
  });
  it('メールアドレスと URL を伏せてから書く', () => {
    const { w, g } = setup();
    call(
      g,
      'W6',
      'o',
      'exec',
      'taro.dummy@example.com',
      'https://script.google.com/macros/s/AKfycbDUMMY123/exec',
    );
    const r = rowsOf(w)[0];
    expect(r.value).toBe('ta***@example.com');
    expect(r.detail).not.toContain('AKfycbDUMMY123');
  });
  it('= で始まる値も数式にならない（列を書式なしテキストにしてから書く）', () => {
    const { w, g } = setup();
    call(g, 'W1', 'o', 'user.homeicon', '=HYPERLINK("http://x.example")', '+1');
    expect(rowsOf(w)[0].value).toBe('=HYPERLINK("http://x.example")');
    expect(w.formulaCells).toEqual([]);
    const calls: string[] = w.calls;
    const fmt = calls.findIndex((c) => c.startsWith(`format:${LOG}!`) && c.endsWith(':@'));
    expect(fmt).toBeGreaterThanOrEqual(0);
    expect(fmt).toBeLessThan(calls.indexOf(`appendRow:${LOG}`));
  });
  it('getActiveSpreadsheet() が null でも、準備で保存した ID でログに書く', () => {
    const { w, g } = setup();
    w.setActiveNull(true);
    call(g, 'W1', 'o', 'embed', 'v', 'd');
    expect(rowsOf(w)).toHaveLength(1);
  });
  it('準備の前に getActiveSpreadsheet() が null なら、スプレッドシートを特定できず例外', () => {
    const { w, g } = setup({}, false);
    w.setActiveNull(true);
    expect(() => call(g, 'W1', 'o', 'embed', 'v', 'd')).toThrow();
  });
});

describe('probeExec（画面から呼ぶ。W6）', () => {
  it('開き方つきで exec の行を書き、同じ中身を返す', () => {
    const { w, g } = setup();
    const ret = JSON.parse(g.probeExec('PC の Chrome'));
    expect(ret).toEqual({ kind: 'exec', effectiveIsOwner: true, read: true, wrote: true });
    const r = byFact(w, 'exec')[0];
    expect(r.origin).toBe('PC の Chrome');
    expect(JSON.parse(r.value)).toEqual(ret);
  });
  it('実行する人が持ち主でなければ effectiveIsOwner は false（メールアドレスは書かない）', () => {
    const { w, g } = setup({ effective: 'someone.else@example.com' });
    const ret = JSON.parse(g.probeExec('PC の Chrome'));
    expect(ret.effectiveIsOwner).toBe(false);
    expect(JSON.stringify(w.logRows())).not.toContain('someone.else@');
  });
  it('/dev の URL なら kind は dev', () => {
    const { g } = setup({
      url: 'https://script.google.com/macros/s/AKfycbDUMMYDEPLOYMENTID1234567890abcdef/dev',
    });
    expect(JSON.parse(g.probeExec('PC の Chrome')).kind).toBe('dev');
  });
  it('開き方が文字列でなければ断る', () => {
    const { g } = setup();
    expect(() => g.probeExec(5)).toThrow();
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
    g.recordFact('W1', '', 'embed', '{"read":true,"same":true}', '');
    g.menuSummarize();
    const sh = w.sheetOf(SUMMARY);
    expect(sh).toBeTruthy();
    const text = JSON.stringify(sh.getRange(1, 1, sh.getLastRow(), 6).getValues());
    expect(text).toContain('W1');
    expect(text).toContain('読める');
    expect(w.formulaCells).toEqual([]);
  });
});
