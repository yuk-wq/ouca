// DESIGN.md §5.1 純粋な関数（gas/Logic.js）のテスト。判定の表（§2）と summarize_ は 1 対 1。
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { createWorld, plain, ADMIN } from './fakes';

/* eslint-disable @typescript-eslint/no-explicit-any */
const g: any = createWorld().load();
const ctx = g;
const f =
  (name: string) =>
  (...args: unknown[]) =>
    plain(g[name](...args));

const E = {
  menu: 'メニュー',
  button: '画像のボタン',
  edit: '編集トリガー',
  change: '変更トリガー',
  timer: '時間主導',
  simple: 'シンプルトリガー',
  doGet: 'Web アプリ（doGet）',
  run: 'Web アプリ（google.script.run）',
};
const row = (scenario: string, entry: string, fact: string, value = '', detail = '') => ({
  time: '2026-01-01 09:00:00',
  scenario,
  entry,
  fact,
  value,
  detail,
});
const mark = (name: string) => row('', E.menu, 'mark', name);

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
    const out = f('maskDigits_')('https://x.example/api?project=123456789&a=1');
    expect(out).toBe('https://x.example/api?project=***&a=1');
  });
});

describe('scrubText_（ログに書く前に、メールアドレスと URL を伏せる）', () => {
  it('文の中のメールアドレスを伏せる', () => {
    const out = f('scrubText_')('持ち主は a.b@example.com です');
    expect(out).not.toContain('a.b@');
    expect(out).toContain('a.***@example.com'.slice(0, 2));
  });
  it('Web アプリの URL を、デプロイ ID ごと伏せる', () => {
    const out = f('scrubText_')('https://script.google.com/macros/s/AKfycbDUMMY123/exec を開いた');
    expect(out).not.toContain('AKfycbDUMMY123');
  });
});

describe('scrubText_ のドメイン付きの URL', () => {
  it('/a/macros/<ドメイン>/s/<ID>/exec の形も、ドメインと ID を伏せる', () => {
    const out = f('scrubText_')(
      'https://script.google.com/a/macros/corp.example.org/s/AKfycbDOMAINID99/exec を開いた',
    );
    expect(out).not.toContain('AKfycbDOMAINID99');
    expect(out).not.toContain('corp.example.org');
  });
});

describe('safeJson_ と summaryLabel_', () => {
  it('safeJson_: </script> を含む値でも、script が閉じず、JSON として読み戻せる', () => {
    const ls = String.fromCharCode(0x2028);
    const value = '</script><script>alert(1)</script>&' + ls;
    const out = g.safeJson_({ a: value });
    expect(out).not.toContain('</script>');
    expect(out).not.toContain('<');
    expect(out).not.toContain('&');
    expect(out).not.toContain(ls);
    expect(JSON.parse(out).a).toBe(value);
  });
  it('summaryLabel_: まとめの名前は日本語で、英語の鍵を出さない', () => {
    for (const k of ['S01', 'S01-rebuild', 'S05', 'S07', 'S07-underscore', 'S12', 'S12-timer']) {
      const l = plain(g.summaryLabel_(k)) as any;
      expect(l.scenario, k).toBe(k.slice(0, 3));
      expect(l.name, k).not.toMatch(/rebuild|underscore|timer/i);
      expect(l.name.length, k).toBeGreaterThan(0);
    }
    expect((plain(g.summaryLabel_('S01-rebuild')) as any).name).toContain('作り直し');
    expect((plain(g.summaryLabel_('S12-timer')) as any).name).toContain('時間主導');
  });
});

describe('ownerVerdict_', () => {
  const v = f('ownerVerdict_');
  const ok = 'owner@example.com';
  it('3つが同じなら通る', () => {
    expect(v({ active: ok, effective: ok, owner: ok })).toEqual({ ok: true, reason: '' });
  });
  it('大文字と小文字の違いは同じとみなす', () => {
    expect(v({ active: 'Owner@Example.com', effective: ok, owner: 'OWNER@example.com' }).ok).toBe(
      true,
    );
  });
  it('active が空なら止まる', () => {
    expect(v({ active: '', effective: ok, owner: ok })).toEqual({
      ok: false,
      reason: 'active が空',
    });
  });
  it('active と effective が違えば止まる', () => {
    expect(v({ active: 'b@example.com', effective: ok, owner: ok }).reason).toBe(
      'active と effective が違う',
    );
  });
  it('active と持ち主が違えば止まる', () => {
    expect(v({ active: ok, effective: ok, owner: 'c@example.com' }).reason).toBe(
      'active と持ち主が違う',
    );
  });
  it('持ち主が取れなければ止まる', () => {
    expect(v({ active: ok, effective: ok, owner: '' })).toEqual({
      ok: false,
      reason: '持ち主が取れない',
    });
  });
});

describe('isRealSheetEvent_', () => {
  const real = () => ({
    source: { getId: () => 'ID1', getSheets: () => [] },
    range: { getSheet: () => ({}) },
  });
  const blobLike = () => ({
    getName: () => 'x',
    getBytes: () => [],
    getContentType: () => 'text/plain',
  });
  const t = (e: any, kind: string) => g.isRealSheetEvent_(e, 'ID1', kind);
  it('undefined は false', () => {
    expect(t(undefined, 'edit')).toBe(false);
  });
  it('値だけのオブジェクトは false', () => {
    expect(t({ source: { id: 'ID1' }, range: { row: 1 }, value: 'x' }, 'edit')).toBe(false);
  });
  it('source と range が Blob の偽物なら false', () => {
    expect(t({ source: blobLike(), range: blobLike() }, 'edit')).toBe(false);
  });
  it('getId が別の ID を返すなら false', () => {
    const e = real();
    e.source.getId = () => 'OTHER';
    expect(t(e, 'edit')).toBe(false);
  });
  it('getId が例外を投げるなら false', () => {
    const e = real();
    e.source.getId = () => {
      throw new Error('x');
    };
    expect(t(e, 'edit')).toBe(false);
  });
  it("'edit' で range がなければ false", () => {
    expect(t({ source: real().source }, 'edit')).toBe(false);
  });
  it("'open' で range がなくても、source が本物なら true", () => {
    expect(t({ source: real().source }, 'open')).toBe(true);
  });
  it("'edit' で source と range が本物なら true", () => {
    expect(t(real(), 'edit')).toBe(true);
  });
});

describe('triggerMatch_', () => {
  const list = [
    { id: 'aaaa-1111', handler: 'trigEditPlain' },
    { id: 'bbbb-2222', handler: 'trigChange' },
  ];
  it('一致する', () => {
    expect(f('triggerMatch_')('aaaa-1111', list, 'trigEditPlain')).toMatchObject({
      result: '一致',
      tail4: '1111',
      count: 2,
    });
  });
  it('同じ関数のトリガーはあるが ID が違えば、一致しない', () => {
    expect(f('triggerMatch_')('zzzz-9999', list, 'trigEditPlain')).toMatchObject({
      result: '一致しない',
      tail4: '9999',
      count: 2,
    });
  });
  it('同じ関数のトリガーが一覧になければ、消えた後', () => {
    expect(f('triggerMatch_')('zzzz-9999', list, 'timerPlain').result).toBe('消えた後');
  });
  it('uid がなければ、uid なし', () => {
    expect(f('triggerMatch_')(undefined, list, 'trigEditPlain').result).toBe('uid なし');
  });
});

describe('readValidation_', () => {
  const r = f('readValidation_');
  it('sheets がない、data がない、rowData がない、values がない、dataValidation がないのは none', () => {
    expect(r({}).state).toBe('none');
    expect(r({ sheets: [{}] }).state).toBe('none');
    expect(r({ sheets: [{ data: [{}] }] }).state).toBe('none');
    expect(r({ sheets: [{ data: [{ rowData: [{}] }] }] }).state).toBe('none');
    expect(r({ sheets: [{ data: [{ rowData: [{ values: [{}] }] }] }] }).state).toBe('none');
  });
  it('ルールがあれば rule', () => {
    const rule = { condition: { type: 'ONE_OF_RANGE' }, strict: true };
    const out = r({ sheets: [{ data: [{ rowData: [{ values: [{ dataValidation: rule }] }] }] }] });
    expect(out.state).toBe('rule');
    expect(out.rule).toEqual(rule);
  });
  it('エラーは apiError で、数字を伏せる', () => {
    const out = r({ error: 'API 123456789 が失敗' });
    expect(out.state).toBe('apiError');
    expect(out.message).not.toContain('123456789');
    expect(out.message).toContain('***');
  });
});

describe('diffPaths_', () => {
  it('入れ子の鍵の違いと、片方にだけある鍵を道筋で返す', () => {
    const out = f('diffPaths_')({ a: { b: 1, c: 2 }, d: 3 }, { a: { b: 1, c: 5 }, d: 3, e: true });
    expect([...out].sort()).toEqual(['a.c', 'e']);
  });
  it('同じなら空', () => {
    expect(f('diffPaths_')({ a: { b: 1 } }, { a: { b: 1 } })).toEqual([]);
  });
});

describe('rangeCovers_', () => {
  it('A1:A200 は 2 行目と 200 行目を含み、201 行目を含まない', () => {
    expect(g.rangeCovers_('A1:A200', 2)).toBe(true);
    expect(g.rangeCovers_('A1:A200', 200)).toBe(true);
    expect(g.rangeCovers_('A1:A200', 201)).toBe(false);
  });
  it('$ 付きの形を読める', () => {
    expect(g.rangeCovers_('$A$1:$A$200', 150)).toBe(true);
  });
  it('シート名つきの形を読める', () => {
    expect(g.rangeCovers_("'T1-3 _リスト'!A1:A200", 7)).toBe(true);
    expect(g.rangeCovers_("'T1-3 _リスト'!A1:A200", 500)).toBe(false);
  });
});

describe('classifyUrl_', () => {
  const id = 'AKfycbXYZDUMMYID1234';
  const url = `https://script.google.com/macros/s/${id}/exec`;
  it('/exec を見分け、末尾4字とハッシュを返し、URL の ID を丸ごと返さない', () => {
    const out = f('classifyUrl_')(url);
    expect(out.kind).toBe('exec');
    expect(out.tail4).toBe('1234');
    expect(out.hash8).toMatch(/^[0-9a-f]{8}$/);
    expect(JSON.stringify(out)).not.toContain(id);
  });
  it('同じ URL は同じハッシュ、違う URL は違うハッシュ', () => {
    const a = f('classifyUrl_')(url);
    const b = f('classifyUrl_')(url);
    const c = f('classifyUrl_')(url.replace('1234/exec', '5678/exec'));
    expect(a.hash8).toBe(b.hash8);
    expect(a.hash8).not.toBe(c.hash8);
  });
  it('/dev を見分ける', () => {
    expect(f('classifyUrl_')('https://script.google.com/macros/s/AAAA9999/dev').kind).toBe('dev');
  });
  it('ほかの形は other', () => {
    expect(f('classifyUrl_')('https://example.com/x').kind).toBe('other');
  });
});

describe('decideCheckbox_', () => {
  const d = f('decideCheckbox_');
  it('管理タブの B6 が true なら、動かして外す', () => {
    expect(d({ sheetName: ADMIN, a1: 'B6', value: true }, ADMIN)).toEqual({
      run: true,
      reset: true,
    });
    expect(d({ sheetName: ADMIN, a1: 'B6', value: 'TRUE' }, ADMIN).run).toBe(true);
  });
  it('B6 が false なら動かさない', () => {
    expect(d({ sheetName: ADMIN, a1: 'B6', value: false }, ADMIN)).toEqual({
      run: false,
      reset: false,
    });
  });
  it('ほかのセル、ほかのシートでは動かさない', () => {
    expect(d({ sheetName: ADMIN, a1: 'C6', value: true }, ADMIN).run).toBe(false);
    expect(d({ sheetName: 'T1-3 豆の表', a1: 'B6', value: true }, ADMIN).run).toBe(false);
  });
});

describe('区切りと偽のイベントの分類（DESIGN.md で決まっていない補助の関数）', () => {
  it('markByNumber_: 番号から区切りの名前を返し、範囲外は null', () => {
    expect(g.markByNumber_('1')).toBe('手入力');
    expect(g.markByNumber_('8')).toBe('終わり');
    expect(g.markByNumber_('9')).toBeNull();
    expect(g.markByNumber_('あ')).toBeNull();
  });
  it('groupByMarks_: 区切りの後から次の区切りまでの行を返す', () => {
    const rows = [
      row('', E.menu, 'called', 'before'),
      mark('手入力'),
      row('S05', E.simple, 'edit', 'onEdit'),
      mark('貼り付け'),
      row('S05', E.simple, 'edit', 'onEdit'),
      row('S05', E.edit, 'edit', 'onEdit'),
    ];
    const out = plain(g.groupByMarks_(rows)) as any[];
    expect(out.map((x) => x.mark)).toEqual(['手入力', '貼り付け']);
    expect(out[0].rows).toHaveLength(1);
    expect(out[1].rows).toHaveLength(2);
  });
  it('classifyFake_: 値だけ、form1、form2 を見分ける', () => {
    const blob = { getBytes: () => [], getName: () => 'x', getContentType: () => 't' };
    expect(g.classifyFake_({ value: 'x', source: { id: 'a' }, range: { row: 1 } })).toBe('値だけ');
    expect(g.classifyFake_({ t: 'x', file: blob })).toBe('form1');
    expect(g.classifyFake_({ value: 'x', source: blob, range: blob })).toBe('form2');
  });
  it('encodeDoget_ と parseDoget_ は往復できる', () => {
    const v = {
      d: '2',
      hash: 'abcd1234',
      ehash: '1234abcd',
      keys: ['parameter', 'pathInfo'],
      owner: 'ok',
    };
    expect(plain(g.parseDoget_(g.encodeDoget_(v)))).toEqual(v);
  });
});

describe('web.memo と控えの問い', () => {
  it('encodeMemo_ と parseMemo_ は、どこから開いたかとデプロイの印を往復できる', () => {
    const v = { origin: 'A のスマホの Safari', d: '2' };
    expect(plain(g.parseMemo_(g.encodeMemo_(v)))).toEqual(v);
  });
  it('noteByNumber_: 番号から問いを返し、範囲外と数字でない値は null', () => {
    expect(plain(g.noteByNumber_('1')).key).toBe('user.d2.script');
    expect(plain(g.noteByNumber_('15')).key).toBe('user.s16.first');
    expect(g.noteByNumber_('0')).toBeNull();
    expect(plain(g.noteByNumber_('16')).key).toBe('user.s07');
    expect(plain(g.noteByNumber_('17')).key).toBe('user.s18');
    expect(g.noteByNumber_('18')).toBeNull();
    expect(g.noteByNumber_('あ')).toBeNull();
  });
  it('問いの一覧は、DESIGN.md §3.1 の17個の鍵と同じ', () => {
    const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17].map(
      (n) => plain(g.noteByNumber_(String(n))).key,
    );
    expect(keys).toEqual([
      'user.d2.script',
      'user.d2.manual',
      'user.d4',
      'user.d3',
      'user.d5',
      'user.s02',
      'user.icon.svg64',
      'user.icon.svgurl',
      'user.icon.png',
      'user.phone.menu',
      'user.phone.button',
      'user.phone.checkbox',
      'user.s16.b',
      'user.s16.anon',
      'user.s16.first',
      'user.s07',
      'user.s18',
    ]);
  });
  it('noteNumber_: 鍵から番号を返す（アイコンは7〜9番）', () => {
    expect(g.noteNumber_('user.d2.script')).toBe(1);
    expect(g.noteNumber_('user.icon.svg64')).toBe(7);
    expect(g.noteNumber_('user.icon.png')).toBe(9);
    expect(g.noteNumber_('user.s18')).toBe(17);
  });
  it('番号の入力は、全角の数字と前後の空白も受け付ける', () => {
    expect(g.markByNumber_('１')).toBe('手入力');
    expect(g.markByNumber_('  ２ ')).toBe('貼り付け');
    expect(plain(g.noteByNumber_('１７')).key).toBe('user.s18');
    expect(plain(g.noteByNumber_(' 3\n')).key).toBe('user.d4');
  });
  it('validateNoteAnswer_: はい、いいえの問いは、ほかの答えを断る', () => {
    const q = g.noteByNumber_('1');
    expect(plain(g.validateNoteAnswer_(q, 'はい')).ok).toBe(true);
    expect(plain(g.validateNoteAnswer_(q, 'いいえ')).ok).toBe(true);
    expect(plain(g.validateNoteAnswer_(q, 'たぶん')).ok).toBe(false);
  });
  it('validateNoteAnswer_: 文言の問いは、文言をそのまま返す（= で始まってもよい）', () => {
    const q = g.noteByNumber_('6');
    expect(plain(g.validateNoteAnswer_(q, '=1+1'))).toMatchObject({ ok: true, value: '=1+1' });
    expect(plain(g.validateNoteAnswer_(q, '')).ok).toBe(false);
  });
});

// ---------------------------------------------------------------- 判定の表との一致

describe('判定の表（DESIGN.md §2）と Logic.js の判定のデータの一致', () => {
  const md = readFileSync(resolve(__dirname, '../DESIGN.md'), 'utf8');
  const section = md.split('## 2. 判定の表')[1]!.split('\n## 3.')[0]!;
  const expected: string[] = [];
  let scenarios: string[] = [];
  for (const line of section.split('\n')) {
    if (!line.startsWith('|')) continue;
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim());
    if (cells.length < 4 || cells[0] === 'シナリオ' || /^-+$/.test(cells[0]!)) continue;
    if (cells[0]) scenarios = cells[0].match(/S\d\d/g) ?? [];
    for (const sc of scenarios) expected.push(`${sc}|${cells[1]}|${cells[3]}`);
  }
  it('DESIGN.md の表から、シナリオと判定の組を読めている', () => {
    expect(expected.length).toBeGreaterThan(30);
  });
  it('シナリオ、判定の名前、設計への影響が、表と同じ', () => {
    const actual: string[] = [];
    for (const v of plain(vm.runInContext('VERDICTS', ctx)) as any[]) {
      for (const sc of v.scenarios) actual.push(`${sc}|${v.verdict}|${v.impact}`);
    }
    expect([...actual].sort()).toEqual([...expected].sort());
  });
});

// ---------------------------------------------------------------- summarize_（§2 の判定の表）

const sum = (rows: unknown[]): any => plain(g.summarize_(rows));
const rule = { condition: { type: 'ONE_OF_RANGE' }, strict: true, showCustomUi: true };
const multi = { ...rule, multiSelect: true };
const J = (v: unknown) => JSON.stringify(v);
const yes = 'はい';
const no = 'いいえ';
const user = (scenario: string, key: string, value: string) => row(scenario, E.menu, key, value);
const memo = (origin: string, d = '1') => g.encodeMemo_({ origin, d });
const doget = (d: string, hash: string, owner = 'ok', ehash = 'e1', keys = ['parameter']) =>
  row('S17', E.doGet, 'doget', g.encodeDoget_({ d, hash, ehash, keys, owner }));

describe('summarize_ S01 複数選択', () => {
  const manualYes = [
    row('S01', E.menu, 'ms.d2.set', J(rule)),
    row('S01', E.menu, 'ms.d2.manual', J(multi)),
    user('S01', 'user.d2.manual', yes),
  ];
  it('ビルダーで設定できる（user.d2.script がはい）', () => {
    const out = sum([...manualYes, user('S01', 'user.d2.script', yes)]);
    expect(out.S01.verdict).toBe('ビルダーで設定できる');
    expect(out.S01.impact).not.toBe('');
  });
  it('ビルダーのメソッドを呼べても、user.d2.script がいいえなら「ビルダーで設定できる」にしない', () => {
    const out = sum([
      row('S01', E.menu, 'ms.builder', 'called'),
      ...manualYes,
      user('S01', 'user.d2.script', no),
    ]);
    expect(out.S01.verdict).not.toBe('ビルダーで設定できる');
  });
  it('高度なサービスで設定できる（ms.diff があり、user.d4 がはい）', () => {
    const out = sum([
      ...manualYes,
      user('S01', 'user.d2.script', no),
      row('S01', E.menu, 'ms.diff', 'multiSelect'),
      user('S01', 'user.d4', yes),
    ]);
    expect(out.S01.verdict).toBe('高度なサービスで設定できる');
    expect(out.S01.evidence).toContain('multiSelect');
  });
  it('user.d4 がはいでも、ms.diff が空なら「高度なサービスで設定できる」にしない', () => {
    const out = sum([
      ...manualYes,
      user('S01', 'user.d2.script', no),
      row('S01', E.menu, 'ms.diff', ''),
      user('S01', 'user.d4', yes),
      user('S01', 'user.d3', no),
    ]);
    expect(out.S01.verdict).not.toBe('高度なサービスで設定できる');
    expect(out.S01.verdict).toBe('できない');
  });
  it('コピーで設定できる（user.d3 がはい）。D3 のコピーの前が空だったことも出す', () => {
    const out = sum([
      ...manualYes,
      user('S01', 'user.d2.script', no),
      row('S01', E.menu, 'ms.diff', ''),
      user('S01', 'user.d4', no),
      row('S01', E.menu, 'ms.d3.before', 'none'),
      user('S01', 'user.d3', yes),
    ]);
    expect(out.S01.verdict).toBe('コピーで設定できる');
    expect(out.S01.evidence).toContain('none');
  });
  it('できない（手でオンにした D2 で選べ、ほかはどれも成り立たない）', () => {
    const out = sum([
      ...manualYes,
      user('S01', 'user.d2.script', no),
      row('S01', E.menu, 'ms.diff', ''),
      user('S01', 'user.d4', no),
      user('S01', 'user.d3', no),
    ]);
    expect(out.S01.verdict).toBe('できない');
  });
  it('user.d2.manual がいいえなら、手でもオンにできない', () => {
    const out = sum([user('S01', 'user.d2.script', no), user('S01', 'user.d2.manual', no)]);
    expect(out.S01.verdict).toBe('手でもオンにできない');
    expect(out.S01.impact).not.toBe('');
  });
  it('食い違い: user.d2.script がはいなのに user.d2.manual がいいえなら、未確定', () => {
    const out = sum([user('S01', 'user.d2.script', yes), user('S01', 'user.d2.manual', no)]);
    expect(out.S01.verdict).toBe('未確定');
    expect(out.S01.pending).toContain('食い違い');
  });
  it('食い違い: user.d2.script がはいなのに、ms.builder が none なら、判定を出さず未確定', () => {
    const out = sum([
      row('S01', E.menu, 'ms.builder', 'none'),
      ...manualYes,
      user('S01', 'user.d2.script', yes),
    ]);
    expect(out.S01.verdict).toBe('未確定');
    expect(out.S01.pending).toContain('食い違い');
  });
  it('控えがなければ未確定で、足りない控えの名前を出す', () => {
    const out = sum([row('S01', E.menu, 'ms.d2.set', J(rule))]);
    expect(out.S01.verdict).toBe('未確定');
    expect(out.S01.pending).toContain('user.d2.manual');
  });
  it('user.d2.script がなければ未確定で、user.d2.script を出す', () => {
    const out = sum(manualYes);
    expect(out.S01.verdict).toBe('未確定');
    expect(out.S01.pending).toContain('user.d2.script');
  });
});

describe('summarize_ S01-rebuild 作り直し', () => {
  const manual = user('S01', 'user.d2.manual', yes);
  it('作り直しで残る（D5 で複数選べた）', () => {
    const out = sum([manual, user('S01', 'user.d5', yes)]);
    expect(out['S01-rebuild'].verdict).toBe('作り直しで残る');
    expect(out['S01-rebuild'].impact).toContain('ビルダーで作り直してよい');
  });
  it('作り直しで消える（D5 で複数選べなかった）', () => {
    const out = sum([manual, user('S01', 'user.d5', no)]);
    expect(out['S01-rebuild'].verdict).toBe('作り直しで消える');
    expect(out['S01-rebuild'].impact).toContain('見本のセルからコピー');
  });
  it('user.d5 がなければ未確定で、user.d5 を出す', () => {
    const out = sum([manual]);
    expect(out['S01-rebuild'].verdict).toBe('未確定');
    expect(out['S01-rebuild'].pending).toContain('user.d5');
  });
  it('手でオンにした D2 で選べていなければ、判定しない（未確定）', () => {
    const out = sum([user('S01', 'user.d2.manual', no), user('S01', 'user.d5', yes)]);
    expect(out['S01-rebuild'].verdict).toBe('未確定');
    expect(out['S01-rebuild'].pending).toContain('やり直さず');
  });
  it('読めない（ms.d5 が skipped。user.d5 は要らない）', () => {
    const out = sum([manual, row('S01', E.menu, 'ms.d5', 'skipped')]);
    expect(out['S01-rebuild'].verdict).toBe('読めない');
    expect(out['S01-rebuild'].impact).not.toBe('');
  });
  it('食い違い: ms.d5 が skipped なのに user.d5 の答えがあれば、未確定', () => {
    const out = sum([manual, row('S01', E.menu, 'ms.d5', 'skipped'), user('S01', 'user.d5', yes)]);
    expect(out['S01-rebuild'].verdict).toBe('未確定');
    expect(out['S01-rebuild'].pending).toContain('食い違い');
  });
});

describe('summarize_ S02 メニューから末尾 _', () => {
  it('呼べる', () => {
    expect(sum([row('S02', E.menu, 'called', 'menuUnderscore_')]).S02.verdict).toBe('呼べる');
  });
  it('呼べない（menuPlain の行があり、_ の行がなく、user.s02 がある）', () => {
    const out = sum([
      row('S02', E.menu, 'called', 'menuPlain'),
      user('S02', 'user.s02', 'スクリプト関数が見つかりません'),
    ]);
    expect(out.S02.verdict).toBe('呼べない');
    expect(out.S02.impact).toContain('§3.3');
  });
  it('user.s02 がなければ、_ の行がなくても「呼べない」にしない', () => {
    const out = sum([row('S02', E.menu, 'called', 'menuPlain')]);
    expect(out.S02.verdict).toBe('未確定');
    expect(out.S02.pending).toContain('user.s02');
  });
  it('行がなければ未確定で、足りない事実を出す', () => {
    const out = sum([]);
    expect(out.S02.verdict).toBe('未確定');
    expect(out.S02.pending).toContain('menuPlain');
  });
});

describe('summarize_ S03 時間主導、S09 編集トリガー', () => {
  it('S03 呼べる', () => {
    const out = sum([
      row('S03', E.timer, 'called', 'timerPlain'),
      row('S03', E.timer, 'called', 'timer_'),
    ]);
    expect(out.S03.verdict).toBe('呼べる');
  });
  it('S03 呼べない（_ ありのトリガーを作れて、_ なしの行だけがある）', () => {
    const out = sum([
      row('S03', E.menu, 'trigger.created', 'timer_'),
      row('S03', E.timer, 'called', 'timerPlain'),
    ]);
    expect(out.S03.verdict).toBe('呼べない');
  });
  it('S03 trigger.created がなければ、「呼べない」にしない', () => {
    const out = sum([row('S03', E.timer, 'called', 'timerPlain')]);
    expect(out.S03.verdict).toBe('未確定');
    expect(out.S03.pending).toContain('trigger.created');
  });
  it('S03 作れない（_ ありの作成がエラー）', () => {
    const out = sum([
      row('S03', E.menu, 'trigger.created', 'timer_:error'),
      row('S03', E.timer, 'called', 'timerPlain'),
    ]);
    expect(out.S03.verdict).toBe('作れない');
  });
  it('S03 は、_ なしの行がなければ未確定', () => {
    expect(sum([row('S03', E.timer, 'called', 'timer_')]).S03.verdict).toBe('未確定');
  });
  it('S09 呼べる', () => {
    const out = sum([
      row('S09', E.edit, 'called', 'trigEditPlain'),
      row('S09', E.edit, 'called', 'trigEdit_'),
    ]);
    expect(out.S09.verdict).toBe('呼べる');
  });
  it('S09 呼べない', () => {
    const out = sum([
      row('S09', E.menu, 'trigger.created', 'trigEdit_'),
      row('S09', E.edit, 'called', 'trigEditPlain'),
    ]);
    expect(out.S09.verdict).toBe('呼べない');
  });
  it('S09 作れない', () => {
    const out = sum([row('S09', E.menu, 'trigger.created', 'trigEdit_:error')]);
    expect(out.S09.verdict).toBe('作れない');
  });
});

describe('summarize_ S04 候補の自動更新', () => {
  it('出る', () => {
    const out = sum([
      row('S04', E.menu, 'list.added', '追加090000'),
      row('S04', E.menu, 'list.inList', 'true'),
      row('S04', E.menu, 'list.inRange', 'true'),
    ]);
    expect(out.S04.verdict).toBe('出る');
  });
  it('出ない', () => {
    const out = sum([
      row('S04', E.menu, 'list.inList', 'false'),
      row('S04', E.menu, 'list.inRange', 'true'),
    ]);
    expect(out.S04.verdict).toBe('出ない');
  });
  it('list.inRange が unknown（範囲を読めなかった）なら、「出ない」にせず未確定', () => {
    const out = sum([
      row('S04', E.menu, 'list.inList', 'true'),
      row('S04', E.menu, 'list.inRange', 'unknown'),
    ]);
    expect(out.S04.verdict).toBe('未確定');
    expect(out.S04.pending).toContain('list.inRange');
  });
  it('行がなければ未確定', () => {
    expect(sum([]).S04.verdict).toBe('未確定');
  });
});

describe('summarize_ S05 編集の種類', () => {
  it('操作ごとの表を出す', () => {
    const out = sum([
      mark('手入力'),
      row('S05', E.simple, 'edit', 'onEdit'),
      mark('貼り付け'),
      row('S05', E.simple, 'edit', 'onEdit'),
      mark('行の挿入'),
      row('S05', E.change, 'edit', 'INSERT_ROW'),
      mark('行の削除'),
      row('S05', E.change, 'edit', 'REMOVE_ROW'),
      mark('終わり'),
    ]);
    expect(out.S05.verdict).toBe('操作ごとの表');
    expect(out.S05.evidence).toContain('行の挿入');
    expect(out.S05.evidence).toContain('INSERT_ROW');
    expect(out.S05.evidence).toContain('REMOVE_ROW');
  });
  it('区切りがなければ未確定', () => {
    expect(sum([row('S05', E.simple, 'edit', 'onEdit')]).S05.verdict).toBe('未確定');
  });
  it('_ なしと _ ありの編集トリガーを分けて出す', () => {
    const out = sum([
      mark('手入力'),
      row('S09', E.edit, 'called', 'trigEditPlain'),
      row('S05', E.edit, 'edit', 'onEdit'),
      mark('終わり'),
    ]);
    expect(out.S05.evidence).toContain('編集トリガー(_ なし)=動いた');
    expect(out.S05.evidence).toContain('編集トリガー(_ あり)=動かない');
  });
  it('同じ区切りが2つあれば、最後のまとまりを使う', () => {
    const out = sum([
      mark('手入力'),
      row('S05', E.simple, 'edit', 'onEdit'),
      mark('手入力'),
      mark('終わり'),
    ]);
    expect(out.S05.evidence).toContain('手入力: onEdit(シンプル)=動かない');
  });
});

describe('summarize_ S06 セルの画像', () => {
  const icons = [
    row('S06', E.menu, 'icon', 'SVG(base64):ok'),
    row('S06', E.menu, 'icon', 'SVG(URL):ng'),
    row('S06', E.menu, 'icon', 'PNG:ok'),
  ];
  it('種類ごとの表を出す（セルに見えたかは user.icon.*）', () => {
    const out = sum([
      ...icons,
      user('S06', 'user.icon.svg64', yes),
      user('S06', 'user.icon.svgurl', no),
      user('S06', 'user.icon.png', yes),
    ]);
    expect(out.S06.verdict).toBe('種類ごとの表');
    expect(out.S06.evidence).toContain('SVG(URL)');
  });
  it('user.icon.* がなければ未確定で、足りない控えの名前を出す', () => {
    const out = sum(icons);
    expect(out.S06.verdict).toBe('未確定');
    expect(out.S06.pending).toContain('user.icon.png');
  });
});

describe('summarize_ S07 画像のボタン', () => {
  it('動く', () => {
    expect(sum([row('S07', E.button, 'called', 'buttonPlain')]).S07.verdict).toBe('動く');
  });
  it('末尾 _ は使えない（割り当てがエラー）', () => {
    const out = sum([row('S07', E.menu, 'assign', 'buttonUnderscore_:error')]);
    expect(out['S07-underscore'].verdict).toBe('末尾 `_` は使えない');
    expect(out['S07-underscore'].evidence).toContain('error');
  });
  it('末尾 _ は使えない（割り当てられたが、押して動かなかったと user.s07 に控えた）', () => {
    const out = sum([
      row('S07', E.menu, 'assign', 'buttonUnderscore_:ok'),
      user('S07', 'user.s07', '何も出なかった'),
    ]);
    expect(out['S07-underscore'].verdict).toBe('末尾 `_` は使えない');
  });
  it('割り当てられたが、押した控え（user.s07）がなければ、未確定', () => {
    const out = sum([row('S07', E.menu, 'assign', 'buttonUnderscore_:ok')]);
    expect(out['S07-underscore'].verdict).toBe('未確定');
    expect(out['S07-underscore'].pending).toContain('user.s07');
  });
  it('末尾 _ も使える（割り当てられ、押して buttonUnderscore_ の行が出た）', () => {
    const out = sum([
      row('S07', E.menu, 'assign', 'buttonUnderscore_:ok'),
      row('S07', E.button, 'called', 'buttonUnderscore_'),
    ]);
    expect(out['S07-underscore'].verdict).toBe('末尾 `_` も使える');
  });
  it('buttonPlain の行がなければ未確定', () => {
    expect(sum([]).S07.verdict).toBe('未確定');
  });
});

describe('summarize_ S08 スマホ', () => {
  const phoneRows = [
    mark('スマホの前'),
    row('S08', E.button, 'called', 'buttonPlain'),
    row('S08', E.edit, 'checkbox', 'reset=true'),
    mark('スマホの後'),
  ];
  const phoneUser = [
    user('S08', 'user.phone.menu', no),
    user('S08', 'user.phone.button', '何も起きなかった'),
    user('S08', 'user.phone.checkbox', yes),
  ];
  it('スマホの前と後の区切りの間の行と user.phone.* から、入口ごとの表を出す', () => {
    const out = sum([row('S08', E.menu, 'called', 'menuPlain'), ...phoneRows, ...phoneUser]);
    expect(out.S08.verdict).toBe('入口ごとの表');
    expect(out.S08.evidence).toContain('画像のボタン: 1');
    expect(out.S08.evidence).toContain('メニュー: 0');
    expect(out.S08.evidence).toContain('チェックボックス: 1');
  });
  it('user.phone.* がなければ未確定で、足りない控えの名前を出す', () => {
    const out = sum(phoneRows);
    expect(out.S08.verdict).toBe('未確定');
    expect(out.S08.pending).toContain('user.phone.checkbox');
  });
  it('区切りがなければ未確定', () => {
    expect(sum(phoneUser).S08.verdict).toBe('未確定');
  });
  it('スマホの前が2つあれば（やり直し）、最後のまとまりを使う', () => {
    const out = sum([
      mark('スマホの前'),
      row('S08', E.button, 'called', 'buttonPlain'),
      mark('スマホの前'),
      mark('スマホの後'),
      ...phoneUser,
    ]);
    expect(out.S08.evidence).toContain('画像のボタン: 0');
  });
});

describe('summarize_ S10 持ち主のメール、S14 getOwner', () => {
  const ok = (entry: string) => row('S10', entry, 'owner', 'ok');
  const ng = (entry: string) => row('S10', entry, 'owner', 'active が空');
  it('入口ごとの表を出す（S14 も同じ）', () => {
    const out = sum([ok(E.menu), ok(E.button), ng(E.edit), ng(E.timer)]);
    expect(out.S10.verdict).toBe('入口ごとの表');
    expect(out.S10.evidence).toContain('active が空');
    expect(out.S14.verdict).toBe('入口ごとの表');
  });
  it('メニューで止まったときは、代わりの守りをメインのセッションが決めると書く', () => {
    const out = sum([ng(E.menu), ok(E.button), ok(E.edit), ok(E.timer)]);
    expect(out.S10.impact).toContain('代わりの守り');
    expect(out.S10.impact).not.toContain('トリガーでは持ち主の確かめを使わない');
  });
  it('トリガーだけで止まったときは、トリガーでは持ち主の確かめを使わないと書く', () => {
    const out = sum([ok(E.menu), ok(E.button), ng(E.edit), ng(E.timer)]);
    expect(out.S10.impact).toContain('トリガーでは持ち主の確かめを使わない');
    expect(out.S10.impact).not.toContain('代わりの守り');
  });
  it('トリガーで通れば、トリガーでも持ち主の確かめを使うと書く', () => {
    const out = sum([ok(E.menu), ok(E.button), ok(E.edit), ok(E.timer)]);
    expect(out.S10.impact).toContain('トリガーでも持ち主の確かめを使う');
    expect(out.S10.impact).toContain('§3.3 のまま');
  });
  it('メニューの行だけで画像のボタンの行がなければ、未確定', () => {
    const out = sum([ok(E.menu), ok(E.edit)]);
    expect(out.S10.verdict).toBe('未確定');
    expect(out.S10.pending).toContain('画像のボタン');
    expect(out.S14.verdict).toBe('未確定');
  });
  it('行がなければ未確定', () => {
    expect(sum([]).S10.verdict).toBe('未確定');
  });
});

describe('summarize_ S11 知らない人の Web 呼び出し', () => {
  // 出どころとデプロイの印は owner の行の詳細で組にする（並び順で組にしない）
  const call = (origin: string, verdict: string) => [
    row('S11', E.run, 'owner', verdict, memo(origin)),
  ];
  it('止まる', () => {
    const out = sum([...call('B の PC', 'active が空'), ...call('シークレット', 'active が空')]);
    expect(out.S11.verdict).toBe('止まる');
  });
  it('止まった理由が「active と持ち主が違う」でも、止まる', () => {
    const out = sum([
      ...call('B の PC', 'active と持ち主が違う'),
      ...call('シークレット', 'active が空'),
    ]);
    expect(out.S11.verdict).toBe('止まる');
  });
  it('止まらない（B で通る）', () => {
    const out = sum([...call('B の PC', 'ok'), ...call('シークレット', 'active が空')]);
    expect(out.S11.verdict).toBe('止まらない');
  });
  it('シークレットの行がなければ未確定', () => {
    const out = sum(call('B の PC', 'active が空'));
    expect(out.S11.verdict).toBe('未確定');
    expect(out.S11.pending).toContain('シークレット');
  });
});

describe('summarize_ S12 triggerUid', () => {
  it('一致する', () => {
    expect(sum([row('S12', E.edit, 'uid', '一致')]).S12.verdict).toBe('一致する');
  });
  it('一致しない', () => {
    expect(sum([row('S12', E.edit, 'uid', '一致しない')]).S12.verdict).toBe('一致しない');
  });
  it('消えた後（時間主導の行）', () => {
    expect(sum([row('S12', E.timer, 'uid', '消えた後')])['S12-timer'].verdict).toBe('消えた後');
  });
  it('編集トリガーの行がなければ未確定', () => {
    expect(sum([]).S12.verdict).toBe('未確定');
  });
});

describe('summarize_ S13 偽のイベント', () => {
  const fake = (kind: string, real: string) => row('S13', E.run, 'fake', `${kind}:${real}`);
  it('見分けられる', () => {
    const out = sum([fake('値だけ', 'false'), fake('form1', 'false'), fake('form2', 'false')]);
    expect(out.S13.verdict).toBe('見分けられる');
  });
  it('見分けられない', () => {
    const out = sum([fake('値だけ', 'false'), fake('form1', 'false'), fake('form2', 'true')]);
    expect(out.S13.verdict).toBe('見分けられない');
  });
  it('誤りの後に3つそろえば、見分けられる（fake.error の行があっても、送り方ごとに比べる）', () => {
    const out = sum([
      row('S13', E.run, 'fake.error', 'form1:Failed'),
      fake('値だけ', 'false'),
      fake('form1', 'false'),
      fake('form2', 'false'),
    ]);
    expect(out.S13.verdict).toBe('見分けられる');
  });
  it('誤りがあっても、どれかで true なら、見分けられない', () => {
    const out = sum([
      row('S13', E.run, 'fake.error', 'form1:Failed'),
      fake('値だけ', 'false'),
      fake('form2', 'true'),
    ]);
    expect(out.S13.verdict).toBe('見分けられない');
  });
  it('form を送れない（fake.error の行がある）', () => {
    const out = sum([
      fake('値だけ', 'false'),
      row('S13', E.run, 'fake.error', 'form1:送れなかった'),
    ]);
    expect(out.S13.verdict).toBe('form を送れない');
    expect(out.S13.evidence).toContain('form1');
  });
  it('form1 の誤りの後に form1 は送れ、form2 がまだなら、form を送れないにせず未確定', () => {
    const out = sum([
      row('S13', E.run, 'fake.error', 'form1:送れなかった'),
      fake('値だけ', 'false'),
      fake('form1', 'false'),
    ]);
    expect(out.S13.verdict).toBe('未確定');
  });
  it('form2 の行がなければ未確定で、form2 を足りない事実に出す', () => {
    const out = sum([fake('値だけ', 'false'), fake('form1', 'false')]);
    expect(out.S13.verdict).toBe('未確定');
    expect(out.S13.pending).toContain('form2');
  });
});

describe('summarize_ S15 管理ページの持ち主', () => {
  const call = (origin: string, verdict: string) => [
    row('S15', E.run, 'owner', verdict, memo(origin)),
  ];
  it('通る（A の PC で通り、B とシークレットで止まる）', () => {
    const out = sum([
      ...call('A の PC', 'ok'),
      ...call('B の PC', 'active が空'),
      ...call('シークレット', 'active が空'),
    ]);
    expect(out.S15.verdict).toBe('通る');
  });
  it('A の PC の行で止まったら、通らない', () => {
    const out = sum([...call('A の PC', 'active が空')]);
    expect(out.S15.verdict).toBe('通らない');
    expect(out.S15.evidence).toContain('active が空');
  });
  it('A の PC の行がなければ未確定', () => {
    expect(sum([...call('B の PC', 'active が空')]).S15.verdict).toBe('未確定');
  });
  it('owner の行の並び順や、web.memo の行の有無に関係なく、詳細の出どころで組にする', () => {
    const out = sum([
      row('S15', E.run, 'web.memo', memo('B の PC')),
      row('S15', E.run, 'owner', 'ok', memo('A の PC')),
      row('S15', E.run, 'owner', 'active が空', memo('シークレット')),
      row('S15', E.run, 'owner', 'active が空', memo('B の PC')),
    ]);
    expect(out.S15.verdict).toBe('通る');
  });
});

describe('summarize_ S16 2つ目のデプロイ', () => {
  const all = [
    user('S16', 'user.s16.b', no),
    user('S16', 'user.s16.anon', no),
    user('S16', 'user.s16.first', yes),
  ];
  it('作れる（3つの控えが期待どおりで、2つ目の doGet に持ち主以外の行がない）', () => {
    expect(sum([...all, doget('2', 'h2')]).S16.verdict).toBe('作れる');
  });
  it('3つがそろわなければ未確定で、足りない控えの名前を出す', () => {
    const out = sum([all[0]!, all[2]!]);
    expect(out.S16.verdict).toBe('未確定');
    expect(out.S16.pending).toContain('user.s16.anon');
  });
  it('B で開けたら、作れない', () => {
    const out = sum([user('S16', 'user.s16.b', yes), all[1]!, all[2]!]);
    expect(out.S16.verdict).toBe('作れない');
  });
  it('1つ目の設定が変わっていたら、作れない', () => {
    const out = sum([all[0]!, all[1]!, user('S16', 'user.s16.first', no)]);
    expect(out.S16.verdict).toBe('作れない');
  });
  it('2つ目の doGet に持ち主以外の行があれば、作れない', () => {
    expect(sum([...all, doget('2', 'h2', 'active が空')]).S16.verdict).toBe('作れない');
  });
});

describe('summarize_ S17 doGet の見分け', () => {
  it('見分けられる（getUrl のハッシュが違う）', () => {
    expect(sum([doget('1', 'h1'), doget('2', 'h2')]).S17.verdict).toBe('見分けられる');
  });
  it('e の鍵の一覧が同じで、URL の引数に由来しない値のハッシュだけが違っても、見分けられる', () => {
    const out = sum([doget('1', 'h1', 'ok', 'e1'), doget('2', 'h1', 'ok', 'e2')]);
    expect(out.S17.verdict).toBe('見分けられる');
  });
  it('見分けられない（ハッシュが同じ。parameter と parameters の鍵の違いは根拠にしない）', () => {
    const out = sum([
      doget('1', 'h1', 'ok', 'e1', ['parameter', 'pathInfo']),
      doget('2', 'h1', 'ok', 'e1', ['parameters', 'pathInfo']),
    ]);
    expect(out.S17.verdict).toBe('見分けられない');
  });
  it('2つ目の行がなければ未確定', () => {
    expect(sum([doget('1', 'h1')]).S17.verdict).toBe('未確定');
  });
  it('持ち主の行だけを比べる（持ち主以外の行のハッシュは比べない）', () => {
    const out = sum([doget('1', 'h1'), doget('2', 'h1'), doget('2', 'hX', 'active が空')]);
    expect(out.S17.verdict).toBe('見分けられない');
  });
  it('同じ d の中でハッシュがそろっていないことも、根拠に出す', () => {
    const out = sum([doget('1', 'h1'), doget('1', 'h9'), doget('2', 'h2')]);
    expect(out.S17.evidence).toContain('d=1 内のハッシュ: 2 種類');
  });
});

describe('summarize_ S18 スマホのブラウザ', () => {
  const call = (origin: string, d: string, verdict = 'ok') => [
    row('S18', E.run, 'owner', verdict, memo(origin, d)),
  ];
  it('開ける（A のスマホで d=2 から来て、通る）', () => {
    expect(sum(call('A のスマホの Safari', '2')).S18.verdict).toBe('開ける');
  });
  it('d=2 でない行だけなら未確定', () => {
    expect(sum(call('A のスマホの Safari', '1')).S18.verdict).toBe('未確定');
  });
  it('スマホでない行だけなら未確定', () => {
    expect(sum(call('A の PC', '2')).S18.verdict).toBe('未確定');
  });
  it('スマホの行で止まったら、開けない', () => {
    expect(sum(call('A のスマホの Chrome', '2', 'active が空')).S18.verdict).toBe('開けない');
  });
  it('食い違い: 通った行があるのに user.s18 がいいえなら、未確定', () => {
    const out = sum([...call('A のスマホの Safari', '2'), user('S18', 'user.s18', no)]);
    expect(out.S18.verdict).toBe('未確定');
    expect(out.S18.pending).toContain('食い違い');
  });
  it('通った行があれば、止まった行があっても（Safari で止まり Chrome で通る）、開ける', () => {
    const out = sum([
      ...call('A のスマホの Safari', '2', 'active が空'),
      ...call('A のスマホの Chrome', '2'),
    ]);
    expect(out.S18.verdict).toBe('開ける');
  });
  it('問い 17 は、Safari か Chrome のどちらか1つでも開けたかを聞く', () => {
    expect((plain(g.noteByNumber_('17')) as any).question).toBe(
      'スマホのブラウザ（Safari か Chrome のどちらか1つでも）で、2つ目のデプロイを開けたか',
    );
  });
  it('user.s18 がいいえなら、開けない', () => {
    expect(sum([user('S18', 'user.s18', no)]).S18.verdict).toBe('開けない');
  });
  it('user.s18 がはいでも、d=2 のスマホの行がなければ未確定', () => {
    expect(sum([user('S18', 'user.s18', yes)]).S18.verdict).toBe('未確定');
  });
});
