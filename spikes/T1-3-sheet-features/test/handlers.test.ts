// DESIGN.md §5.2 GAS を呼ぶ部分のテスト（偽物は test/fakes.ts）。
import { describe, expect, it } from 'vitest';
import { createWorld, plain, ADMIN, BEANS, LOG, LIST, ITEMS, type Opts } from './fakes';

/* eslint-disable @typescript-eslint/no-explicit-any */

function setup(opts: Opts = {}) {
  const w = createWorld(opts);
  const g = w.load();
  g.menuSetup();
  w.calls.length = 0;
  return { w, g };
}
// ログの行を { scenario, entry, fact, value, detail } にする（列は日時、シナリオ、入口、事実、値、詳細）
function rowsOf(w: any) {
  return w
    .logRows()
    .map((r: string[]) => ({ scenario: r[1], entry: r[2], fact: r[3], value: r[4], detail: r[5] }));
}
const byFact = (w: any, fact: string) => rowsOf(w).filter((r: any) => r.fact === fact);
const checkboxEvent = (w: any, a1: string, value: string) => {
  const admin = w.sheetOf(ADMIN);
  return {
    range: admin.getRange(a1),
    value,
    authMode: 'FULL',
    triggerUid: 'trigger-id-9999',
    source: w.ss,
    user: { getEmail: () => w.opts.owner },
  };
};

describe('チェックボックス', () => {
  it('B6 を true にした編集で、B6 が false に戻り、C6 と D6 に時刻と入口が書かれる', () => {
    const { w, g } = setup();
    const admin = w.sheetOf(ADMIN);
    admin.getRange('B6').setValue(true);
    const e = checkboxEvent(w, 'B6', 'TRUE');
    g.trigEditPlain(e);
    g.trigEdit_(e);
    expect(admin.getRange('B6').getValue()).toBe(false);
    expect(String(admin.getRange('C6').getValue())).toContain('2026-01-01 09:00:00');
    expect(String(admin.getRange('C6').getValue())).toContain('trigEditPlain');
    expect(String(admin.getRange('D6').getValue())).toContain('trigEdit_');
    expect(byFact(w, 'checkbox').length).toBeGreaterThan(0);
  });
  it('2つ目のハンドラも、B6 が外れた後に動く（e.value で判断する）', () => {
    const { w, g } = setup();
    const admin = w.sheetOf(ADMIN);
    admin.getRange('B6').setValue(true);
    const e = checkboxEvent(w, 'B6', 'TRUE');
    g.trigEditPlain(e); // B6 を false に戻す
    g.trigEdit_(e);
    expect(String(admin.getRange('D6').getValue())).toContain('trigEdit_');
  });
  it('false にした編集では、何も書かない', () => {
    const { w, g } = setup();
    g.trigEditPlain(checkboxEvent(w, 'B6', 'FALSE'));
    expect(w.sheetOf(ADMIN).getRange('C6').getValue()).toBe('');
  });
  it('ほかのセルの編集では、何も書かない', () => {
    const { w, g } = setup();
    g.trigEditPlain(checkboxEvent(w, 'A6', 'TRUE'));
    expect(w.sheetOf(ADMIN).getRange('C6').getValue()).toBe('');
  });
});

describe('入力規則の読み取り', () => {
  it('高度な Sheets サービスを呼ぶ前に、flush を呼ぶ', () => {
    const { w, g } = setup();
    g.readValidationState_(BEANS, 'D2');
    const iFlush = w.calls.indexOf('flush');
    const iGet = w.calls.findIndex((c: string) => c.startsWith('Sheets.get:'));
    expect(iFlush).toBeGreaterThanOrEqual(0);
    expect(iGet).toBeGreaterThan(iFlush);
  });
  it('サービスが例外を投げたら apiError で、数字が伏せてある', () => {
    const { g } = setup({ sheetsThrows: 'API project 123456789 failed' });
    const out = plain(g.readValidationState_(BEANS, 'D2')) as any;
    expect(out.state).toBe('apiError');
    expect(out.message).not.toContain('123456789');
  });
});

describe('複数選択の設定（S01）', () => {
  it('D2 にだけ入力規則を付け、D3:D6 の入力規則を消す', () => {
    const { w, g } = setup();
    const beans = w.sheetOf(BEANS);
    const dummy = w.makeValidation({ condition: { type: 'X' } }, null);
    beans.getRange('D3:D6').setDataValidation(dummy);
    g.menuMultiSelect();
    expect(beans.getRange('D2').getDataValidation()).not.toBeNull();
    for (const a1 of ['D3', 'D4', 'D5', 'D6']) {
      expect(beans.getRange(a1).getDataValidation(), a1).toBeNull();
    }
  });
  it('複数選択のメソッドがなければ ms.builder は none、あれば called', () => {
    const a = setup();
    a.g.menuMultiSelect();
    expect(byFact(a.w, 'ms.builder')[0].value).toBe('none');
    expect(byFact(a.w, 'ms.methods').length).toBe(1);
    const b = setup({ multiMethod: true });
    b.g.menuMultiSelect();
    expect(byFact(b.w, 'ms.builder')[0].value).toBe('called');
  });
  it('設定した後の D2 の JSON を ms.d2.set に書く', () => {
    const { w, g } = setup();
    g.menuMultiSelect();
    expect(byFact(w, 'ms.d2.set')[0].value).toContain('ONE_OF_RANGE');
  });
});

describe('複数選択の確かめ（S01）', () => {
  function withManual() {
    const s = setup();
    s.g.menuMultiSelect();
    const beans = s.w.sheetOf(BEANS);
    const rule = { ...s.w.readApiRule(BEANS, 'D2'), multiSelect: true };
    beans
      .getRange('D2')
      .setDataValidation(
        s.w.makeValidation(rule, beans.getRange('D2').getDataValidation().rangeObj),
      );
    s.w.calls.length = 0;
    return { ...s, rule };
  }
  it('コピーの前に D3 を読み、コピーし、コピーの後に D3 を読む順になっている', () => {
    const { w, g } = withManual();
    g.menuMultiInspect();
    const reads = w.calls
      .map((c: string, i: number) => [c, i] as const)
      .filter(([c]: readonly [string, number]) => c === `Sheets.get:${BEANS}!D3`)
      .map(([, i]: readonly [string, number]) => i);
    const copy = w.calls.findIndex((c: string) => c.startsWith('copyTo:'));
    expect(reads.length).toBeGreaterThanOrEqual(2);
    expect(reads[0]).toBeLessThan(copy);
    expect(reads[reads.length - 1]).toBeGreaterThan(copy);
  });
  it('コピーの前の D3 は none、コピーの後の D3 は D2 と同じ JSON になる', () => {
    const { w, g } = withManual();
    g.menuMultiInspect();
    const manual = byFact(w, 'ms.d2.manual')[0].value;
    expect(manual).toContain('multiSelect');
    expect(byFact(w, 'ms.d3.before')[0].value).toBe('none');
    expect(byFact(w, 'ms.d3.after')[0].value).toBe(manual);
  });
  it('高度なサービスで D4 に書き込んだ結果を ms.d4 に書く', () => {
    const { w, g } = withManual();
    g.menuMultiInspect();
    expect(byFact(w, 'ms.d4')[0].value).toBe('same');
    expect(w.apiWrites.length).toBe(1);
  });
  it('手でオンにした D2 の入力規則を、getDataValidation().copy().build() で D5 に設定し、D5 の JSON を書く', () => {
    const { w, g } = withManual();
    g.menuMultiInspect();
    expect(w.calls).toContain('validation.copy');
    expect(w.sheetOf(BEANS).getRange('D5').getDataValidation()).not.toBeNull();
    const manual = byFact(w, 'ms.d2.manual')[0].value;
    expect(byFact(w, 'ms.d5')[0].value).toBe(manual);
  });
  it('D2 に入力規則がないときは、D5 に書かず、ms.d5 に skipped を書く', () => {
    const { w, g } = setup();
    g.menuMultiInspect();
    expect(w.sheetOf(BEANS).getRange('D5').getDataValidation()).toBeNull();
    expect(byFact(w, 'ms.d5')[0].value).toBe('skipped');
  });
  it('D2 に入力規則がないときも、JSON を読んでログに書き、トーストを出す', () => {
    const { w, g } = setup();
    g.menuMultiInspect();
    expect(byFact(w, 'ms.d2.manual')[0].value).toBe('none');
    expect(w.toasts.length).toBeGreaterThan(0);
  });
});

describe('偽のイベント（S13）', () => {
  const blob = () => ({ getBytes: () => [], getName: () => 'x', getContentType: () => 't' });
  it('値だけのオブジェクトを渡すと、ログ以外のシートに書かず、real が false で返る', () => {
    const { w, g } = setup();
    const out = JSON.parse(
      g.onEdit({ value: 'dummy', range: { row: 2, column: 1 }, source: { id: 'fake' } }),
    );
    expect(out.real).toBe(false);
    const writes = w.calls.filter((c: string) => c.startsWith('write:') && !c.includes(LOG));
    expect(writes).toEqual([]);
    expect(byFact(w, 'fake')[0].value).toBe('値だけ:false');
  });
  it('form の偽物（t、file）は form1、（value、source、range）は form2 として記録し、どちらも false', () => {
    const { w, g } = setup();
    const o1 = JSON.parse(g.onEdit({ t: 'x', file: blob() }));
    const o2 = JSON.parse(g.onEdit({ value: 'x', source: blob(), range: blob() }));
    expect(o1.real).toBe(false);
    expect(o2.real).toBe(false);
    expect(byFact(w, 'fake').map((r: any) => r.value)).toEqual(['form1:false', 'form2:false']);
    const detail = byFact(w, 'fake')[1].detail;
    expect(detail).toContain('getBytes');
  });
});

describe('トリガー', () => {
  const own = ['trigEditPlain', 'trigEdit_', 'trigChange', 'timerPlain', 'timer_'];
  it('作成は、この検証のトリガーを消してから、決めた5つを作る', () => {
    const { w, g } = setup();
    w.injected.ScriptApp.__add('trigEditPlain', 'SPREADSHEETS', 'ON_EDIT');
    w.injected.ScriptApp.__add('otherFunc', 'CLOCK', 'CLOCK');
    g.menuCreateTriggers();
    const names = w.triggers.map((t: any) => t.fn).sort();
    expect(names).toEqual([...own, 'otherFunc'].sort());
    expect(w.calls.filter((c: string) => c === 'deleteTrigger:trigEditPlain').length).toBe(1);
    expect(w.calls.filter((c: string) => c.startsWith('createTrigger:')).length).toBe(5);
  });
  it('削除は、この検証の関数名のトリガーだけを消し、ほかを残す', () => {
    const { w, g } = setup();
    for (const n of own) w.injected.ScriptApp.__add(n, 'CLOCK', 'CLOCK');
    w.injected.ScriptApp.__add('otherFunc', 'CLOCK', 'CLOCK');
    g.menuDeleteTriggers();
    expect(w.triggers.map((t: any) => t.fn)).toEqual(['otherFunc']);
  });
  it('時間主導のトリガーが動いたとき、一覧に同じ関数がなければ uid は「消えた後」', () => {
    const { w, g } = setup();
    g.timerPlain({ triggerUid: 'gone-0000' });
    expect(byFact(w, 'uid')[0].value).toBe('消えた後');
    expect(byFact(w, 'called')[0].value).toBe('timerPlain');
  });
});

describe('ログ', () => {
  it('値を書く前に、列の書式を書式なしテキストにする。見出しは6列', () => {
    const { w, g } = setup();
    g.log_('S02', 'メニュー', 'called', 'x', '');
    const iFormat = w.calls.findIndex((c: string) => c.startsWith(`format:${LOG}`));
    const iAppend = w.calls.findIndex((c: string) => c === `appendRow:${LOG}`);
    expect(iFormat).toBeGreaterThanOrEqual(0);
    expect(w.calls[iFormat]).toMatch(/:@$/);
    expect(iAppend).toBeGreaterThan(iFormat);
    expect([1, 2, 3, 4, 5, 6].map((c) => w.sheetOf(LOG).getRange(1, c).getValue())).toEqual([
      '日時',
      'シナリオ',
      '入口',
      '事実',
      '値',
      '詳細',
    ]);
  });
  it('持ち主の確かめの行に、元のメールアドレスが含まれない', () => {
    const { w, g } = setup({
      active: 'taro.dummy@example.com',
      effective: 'taro.dummy@example.com',
      owner: 'taro.dummy@example.com',
    });
    g.menuOwnerCheck();
    const all = JSON.stringify(w.logRows());
    expect(byFact(w, 'owner').length).toBe(1);
    expect(all).not.toContain('taro.dummy');
  });
  it('doGet の行に、元の URL とデプロイ ID が含まれない', () => {
    const { w, g } = setup();
    g.doGet({ parameter: { d: '1' }, parameters: { d: ['1'] }, queryString: 'd=1' });
    const all = JSON.stringify(w.logRows());
    expect(byFact(w, 'doget').length).toBe(1);
    expect(all).not.toContain('AKfycbDUMMYDEPLOYMENTID');
  });
  it('log_ に直接渡したメールアドレスと URL も、伏せて書く', () => {
    const { w, g } = setup();
    g.log_(
      'S10',
      'メニュー',
      'owner',
      'ok',
      '値 a.b@example.com と https://script.google.com/macros/s/AKfycbRAWID99/exec',
    );
    const all = JSON.stringify(w.logRows());
    expect(all).not.toContain('a.b@example.com');
    expect(all).toContain('a.***@example.com');
    expect(byFact(w, 'owner')[0].value).toBe('ok');
    expect(all).not.toContain('AKfycbRAWID99');
  });
});

describe('そのほかの入口の行', () => {
  it('候補を足すと、list.added、list.inList、list.inRange が true で書かれる', () => {
    const { w, g } = setup();
    g.menuMultiSelect();
    g.menuAddOption();
    expect(byFact(w, 'list.inList')[0].value).toBe('true');
    expect(byFact(w, 'list.inRange')[0].value).toBe('true');
    expect(w.sheetOf(ITEMS).getRange('A3').getValue()).toBe(byFact(w, 'list.added')[0].value);
    void LIST;
  });
  it('持ち主の確かめ（止める版）は、通らなければ例外で止まり、理由を書く', () => {
    const { w, g } = setup({ active: 'other.dummy@example.com' });
    expect(() => g.webOwnerGuard('B の PC', '1')).toThrow();
    expect(byFact(w, 'owner')[0].value).toBe('active と effective が違う');
    expect(plain(g.parseMemo_(byFact(w, 'web.memo')[0].value))).toEqual({
      origin: 'B の PC',
      d: '1',
    });
  });
  it('まとめを作ると、「T1-3 まとめ」タブに判定が書かれる', () => {
    const { w, g } = setup();
    g.menuOwnerCheck();
    g.menuSummarize();
    const sum = w.sheetOf('T1-3 まとめ');
    expect(sum).toBeDefined();
    expect(String(sum.getRange('A2').getValue())).toMatch(/^S\d\d$/);
  });
});

describe('複数選択の確かめ: ms.diff（S01）', () => {
  it('手でオンにする前後の D2 の JSON の差を、ms.diff に書く', () => {
    const { w, g } = setup();
    g.menuMultiSelect();
    const beans = w.sheetOf(BEANS);
    const rule = { ...w.readApiRule(BEANS, 'D2'), multiSelect: true };
    beans
      .getRange('D2')
      .setDataValidation(w.makeValidation(rule, beans.getRange('D2').getDataValidation().rangeObj));
    g.menuMultiInspect();
    expect(byFact(w, 'ms.diff')[0].value).toContain('multiSelect');
  });
});

describe('Web アプリの中（getActiveSpreadsheet が null）', () => {
  it('画面から呼ぶ関数が、準備で保存した ID でスプレッドシートを開いて、ログに書く', () => {
    const { w, g } = setup();
    w.setActiveNull(true);
    expect(() => g.webOwnerCheck('A の PC', '1')).not.toThrow();
    expect(byFact(w, 'owner').length).toBe(1);
  });
  it('web.memo の行は、owner の行の直前に書かれ、どこから開いたかとデプロイの印を持つ', () => {
    const { w, g } = setup();
    g.webOwnerCheck('A のスマホの Safari', '2');
    const rows = rowsOf(w);
    const i = rows.findIndex((r: any) => r.fact === 'web.memo');
    expect(rows[i + 1].fact).toBe('owner');
    expect(plain(g.parseMemo_(rows[i].value))).toEqual({ origin: 'A のスマホの Safari', d: '2' });
  });
  it('doGet は、開いたデプロイの印（d）を画面に埋め、doget の行に ehash を書く', () => {
    const { w, g } = setup();
    g.doGet({ parameter: { d: '2' }, parameters: { d: ['2'] }, queryString: 'd=2' });
    expect(w.html.join('\n')).toContain('"d":"2"');
    const parsed = plain(g.parseDoget_(byFact(w, 'doget')[0].value)) as any;
    expect(parsed.d).toBe('2');
    expect(parsed.hash).toMatch(/^[0-9a-f]{8}$/);
    expect(parsed.ehash).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe('控えを書く（menuNote）', () => {
  it('番号で選んだ問いの鍵で、user.〇〇 の行を書く', () => {
    const { w, g } = setup({ promptTexts: ['1', 'はい'] });
    g.menuNote();
    const r = byFact(w, 'user.d2.script');
    expect(r.length).toBe(1);
    expect(r[0]).toMatchObject({ scenario: 'S01', entry: 'メニュー', value: 'はい' });
  });
  it('範囲外の番号は、書かずに知らせる', () => {
    const { w, g } = setup({ promptTexts: ['99'] });
    g.menuNote();
    expect(rowsOf(w).filter((r: any) => r.fact.startsWith('user.'))).toEqual([]);
    expect(w.alerts.length).toBeGreaterThan(0);
  });
  it('決めた選択肢にない答えは、書かずに知らせる', () => {
    const { w, g } = setup({ promptTexts: ['1', 'たぶん'] });
    g.menuNote();
    expect(rowsOf(w).filter((r: any) => r.fact.startsWith('user.'))).toEqual([]);
    expect(w.alerts.length).toBeGreaterThan(0);
  });
  it('= で始まる文言も、書式なしテキストにしてから、文字のまま書く', () => {
    const { w, g } = setup({ promptTexts: ['6', '=1+1'] });
    g.menuNote();
    expect(byFact(w, 'user.s02')[0].value).toBe('=1+1');
    const iFormat = w.calls.findIndex((c: string) => c.startsWith(`format:${LOG}`));
    const iAppend = w.calls.findIndex((c: string) => c === `appendRow:${LOG}`);
    expect(iFormat).toBeLessThan(iAppend);
  });
  it('文言の中のメールアドレスは、伏せて書く', () => {
    const { w, g } = setup({ promptTexts: ['6', 'a.b@example.com が出た'] });
    g.menuNote();
    expect(JSON.stringify(w.logRows())).not.toContain('a.b@example.com');
  });
});
