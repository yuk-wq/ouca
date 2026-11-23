// T1-3 の検証: 判定と照合の、GAS を呼ばない純粋な関数。DESIGN.md §2、§4 のとおり。
// import と export は使わない。入口ではないので、関数の名前の末尾はすべて _。
// ここにあるデータ（VERDICTS）は DESIGN.md §2 の表と同じで、テストが表と比べる。

const SCENARIOS = {
  S01: '複数選択',
  S02: 'メニューから末尾 _',
  S03: '時間主導から末尾 _',
  S04: '候補の自動更新',
  S05: '編集の種類',
  S06: 'セルの画像',
  S07: '画像のボタン',
  S08: 'スマホ',
  S09: '編集トリガーから末尾 _',
  S10: '持ち主のメール',
  S11: '知らない人の Web 呼び出し',
  S12: 'triggerUid',
  S13: '偽のイベント',
  S14: 'getOwner',
  S15: '管理ページの持ち主',
  S16: '2つ目のデプロイ',
  S17: 'doGet の見分け',
  S18: 'スマホのブラウザ',
};

const ENTRY = {
  menu: 'メニュー',
  button: '画像のボタン',
  edit: '編集トリガー',
  change: '変更トリガー',
  timer: '時間主導',
  simple: 'シンプルトリガー',
  doGet: 'Web アプリ（doGet）',
  run: 'Web アプリ（google.script.run）',
};

// 区切りの名前。操作の前に書く。区切りの後から次の区切りまでの行が、その操作の結果
const MARKS = [
  '手入力',
  '貼り付け',
  '行の挿入',
  '行の削除',
  'PCのチェック',
  'スマホの前',
  'スマホの後',
  '終わり',
];

// Web の画面で選ぶ「どこから開いたか」
const ORIGINS = [
  'A の PC',
  'B の PC',
  'シークレット',
  'A のスマホの Safari',
  'A のスマホの Chrome',
];

// メニュー「控えを書く」の問い。DESIGN.md §3.1 の表の順
const NOTE_QUESTIONS = [
  {
    key: 'user.d2.script',
    scenario: 'S01',
    kind: 'yesno',
    question: 'Apps Script で設定した直後の D2 で、複数選べたか',
  },
  {
    key: 'user.d2.manual',
    scenario: 'S01',
    kind: 'yesno',
    question: '手でオンにした後の D2 で、複数選べたか',
  },
  {
    key: 'user.d4',
    scenario: 'S01',
    kind: 'yesno',
    question: '高度なサービスで書いた D4 で、複数選べたか',
  },
  { key: 'user.d3', scenario: 'S01', kind: 'yesno', question: 'コピーした D3 で、複数選べたか' },
  {
    key: 'user.d5',
    scenario: 'S01',
    kind: 'yesno',
    question: '手でオンにした D2 の入力規則を作り直して設定した D5 で、複数選べたか',
  },
  {
    key: 'user.s02',
    scenario: 'S02',
    kind: 'text',
    question: '「メニュー: 末尾が _ の関数」を押した後に出た画面（文言、または「何も出なかった」）',
  },
  {
    key: 'user.icon.svg64',
    scenario: 'S06',
    kind: 'yesno',
    question: 'SVG（base64）の画像がセルに見えたか',
  },
  {
    key: 'user.icon.svgurl',
    scenario: 'S06',
    kind: 'yesno',
    question: 'SVG（URL エンコード）の画像がセルに見えたか',
  },
  { key: 'user.icon.png', scenario: 'S06', kind: 'yesno', question: 'PNG の画像がセルに見えたか' },
  {
    key: 'user.phone.menu',
    scenario: 'S08',
    kind: 'yesno',
    question: 'スマホのアプリで、メニュー「T1-3 検証」が出たか',
  },
  {
    key: 'user.phone.button',
    scenario: 'S08',
    kind: 'text',
    question: 'スマホのアプリで、画像を押すと何か起きたか（文言、または「何も起きなかった」）',
  },
  {
    key: 'user.phone.checkbox',
    scenario: 'S08',
    kind: 'yesno',
    question: 'スマホのアプリで、チェックを付けた後に、チェックが外れて見えたか',
  },
  {
    key: 'user.s16.b',
    scenario: 'S16',
    kind: 'yesno',
    question: 'アカウント B で2つ目のデプロイを開けたか',
  },
  {
    key: 'user.s16.anon',
    scenario: 'S16',
    kind: 'yesno',
    question: 'ログインしていないブラウザで2つ目のデプロイを開けたか',
  },
  {
    key: 'user.s16.first',
    scenario: 'S16',
    kind: 'yesno',
    question: '2つ目を作った後も、1つ目のデプロイのアクセスできるユーザーが「全員」のままか',
  },
  {
    key: 'user.s07',
    scenario: 'S07',
    kind: 'text',
    question:
      '緑の画像（末尾 _ の関数を割り当てたもの）を押した後に出た画面（文言、または「何も出なかった」）',
  },
  {
    key: 'user.s18',
    scenario: 'S18',
    kind: 'yesno',
    question: 'スマホのブラウザで、2つ目のデプロイを開けたか',
  },
];

// 判定の表（DESIGN.md §2）。まとめのタブには verdict をそのまま出す
const VERDICTS = [
  {
    scenarios: ['S01'],
    verdict: 'ビルダーで設定できる',
    impact: '「項目を追加」がスクリプトで設定する',
  },
  {
    scenarios: ['S01'],
    verdict: '高度なサービスで設定できる',
    impact:
      '同上。ローダーのマニフェストに高度な Sheets サービスを入れる（テンプレートの後は足せない）',
  },
  {
    scenarios: ['S01'],
    verdict: 'コピーで設定できる',
    impact: 'テンプレートに見本のセルを置き、「項目を追加」がコピーで設定する',
  },
  {
    scenarios: ['S01'],
    verdict: 'できない',
    impact: 'オーナーが入力規則の画面でオンにする手順を手順書に書く',
  },
  {
    scenarios: ['S01'],
    verdict: '手でもオンにできない',
    impact:
      '味わいなどの複数の値を持つ項目を、1つ選ぶ列に分けるか、文字で入れる形にする。M が決める',
  },
  {
    scenarios: ['S01'],
    verdict: '作り直しで残る',
    impact: '「メニューを公開」が豆の入力規則を整えるとき、ビルダーで作り直してよい',
  },
  {
    scenarios: ['S01'],
    verdict: '作り直しで消える',
    impact:
      '「メニューを公開」は、複数選択の列の入力規則をビルダーで作り直さない。整えるときは見本のセルからコピーする（作り直すと、オーナーの設定が公開のたびに消える）',
  },
  {
    scenarios: ['S02'],
    verdict: '呼べる',
    impact:
      'メニューにだけある操作（前のバージョンに戻す、初期設定など）の入口を末尾 `_` にでき、画面から呼べない入口が増える',
  },
  {
    scenarios: ['S02'],
    verdict: '呼べない',
    impact: 'メニューの入口は末尾 `_` なしと持ち主の確かめで守る（§3.3 のまま）',
  },
  {
    scenarios: ['S03', 'S09'],
    verdict: '呼べる',
    impact: 'インストール型のトリガーの入口に末尾 `_` を付ける',
  },
  {
    scenarios: ['S03', 'S09'],
    verdict: '呼べない',
    impact: '末尾 `_` なしにし、`triggerUid` の照合と本物のシートのオブジェクトかで守る',
  },
  {
    scenarios: ['S03', 'S09'],
    verdict: '作れない',
    impact: '同上',
  },
  {
    scenarios: ['S04'],
    verdict: '出る',
    impact: '§2.0 のまま',
  },
  {
    scenarios: ['S04'],
    verdict: '出ない',
    impact: '「メニューを公開」で入力規則を作り直す',
  },
  {
    scenarios: ['S05'],
    verdict: '操作ごとの表',
    impact:
      'onEdit が行の挿入と削除に反応せず、onChange が反応すれば、onChange を足すかを M が決める（§2.15）',
  },
  {
    scenarios: ['S06'],
    verdict: '種類ごとの表',
    impact: 'どれも駄目なら、アイコン一覧を名前だけにし、見本ページを画面側に置く（§4.3）',
  },
  {
    scenarios: ['S07'],
    verdict: '動く',
    impact: '§2.14 のまま',
  },
  {
    scenarios: ['S07'],
    verdict: '末尾 `_` は使えない',
    impact: '§3.3 のまま（画像のボタンの入口は末尾 `_` なし）',
  },
  {
    scenarios: ['S07'],
    verdict: '末尾 `_` も使える',
    impact: '画像のボタンの入口を末尾 `_` にでき、画面から呼べない入口が増える。M が決める',
  },
  {
    scenarios: ['S08'],
    verdict: '入口ごとの表',
    impact:
      'チェックボックスが動けば §2.14 のまま。動かなければ、スマホの公開は管理用のページ（S15〜S18）にするか、PC だけにする',
  },
  {
    scenarios: ['S10', 'S14'],
    verdict: '入口ごとの表',
    impact:
      'メニューと画像のボタンで通れば §3.3 のまま。通らなければ M が代わりの守りを決める。トリガーで通れば、トリガーでも持ち主の確かめを使う。トリガーで通らなければ、トリガーでは持ち主の確かめを使わない（影響の文は、この4つを出し分ける）',
  },
  {
    scenarios: ['S11'],
    verdict: '止まる',
    impact: '§3.3 のまま',
  },
  {
    scenarios: ['S11'],
    verdict: '止まらない',
    impact: '守りが成り立たない。M が代わりを決める',
  },
  {
    scenarios: ['S12'],
    verdict: '一致する',
    impact: '照合を使う',
  },
  {
    scenarios: ['S12'],
    verdict: '一致しない',
    impact: '照合を使わない。末尾 `_` か本物のシートのオブジェクトかで守る',
  },
  {
    scenarios: ['S12'],
    verdict: '消えた後',
    impact: '判定に使わない（1回だけのトリガーは動いた時点で消える可能性がある）',
  },
  {
    scenarios: ['S13'],
    verdict: '見分けられる',
    impact: '§3.3 の見分け方のまま',
  },
  {
    scenarios: ['S13'],
    verdict: '見分けられない',
    impact: '見分け方を変える。M が決める',
  },
  {
    scenarios: ['S13'],
    verdict: 'form を送れない',
    impact: 'file の値は onEdit に届かないので、§3.3 の見分け方のまま',
  },
  {
    scenarios: ['S15'],
    verdict: '通る',
    impact: '管理用のページから管理の操作を呼べる',
  },
  {
    scenarios: ['S15'],
    verdict: '通らない',
    impact: '管理用のページから管理の操作を呼ばない。管理はシートのメニューとボタンだけにする',
  },
  {
    scenarios: ['S16'],
    verdict: '作れる',
    impact: '管理用のページを別のデプロイにできる',
  },
  {
    scenarios: ['S16'],
    verdict: '作れない',
    impact:
      '管理用のページは1つ目のデプロイで出し、管理の操作だけを持ち主の確かめで守る。M が決める',
  },
  {
    scenarios: ['S17'],
    verdict: '見分けられる',
    impact: '1つの doGet で、デプロイごとに画面を出し分ける',
  },
  {
    scenarios: ['S17'],
    verdict: '見分けられない',
    impact:
      'URL の引数で画面を出し分ける（§3.3 の「引数で処理を変えない」を、画面の出し分けに限って緩める）か、管理の操作だけを守る。M が決める',
  },
  {
    scenarios: ['S18'],
    verdict: '開ける',
    impact: 'スマホの管理の手段になる',
  },
  {
    scenarios: ['S18'],
    verdict: '開けない',
    impact: 'スマホの管理は、管理タブのチェックボックスだけにする',
  },
];

// ---------------------------------------------------------------- 伏せ方

function maskEmail_(s) {
  const text = String(s || '');
  if (!text) return '';
  const at = text.indexOf('@');
  if (at < 0) return text.slice(0, 2) + '***';
  return text.slice(0, 2) + '***@' + text.slice(at + 1);
}

function maskDigits_(s) {
  return String(s === undefined || s === null ? '' : s).replace(/\d{6,}/g, '***');
}

// ログに書く前に、文の中のメールアドレスと Web アプリの URL（デプロイ ID）を伏せる
function scrubText_(text) {
  return String(text === undefined || text === null ? '' : text)
    .replace(
      /https:\/\/script\.google\.com\/a\/macros\/[^\s"'/]+\/s\/[^\s"'/]+\/(exec|dev)/g,
      'https://script.google.com/a/macros/***/s/***/$1',
    )
    .replace(
      /https:\/\/script\.google\.com\/macros\/s\/[^\s"'/]+\/(exec|dev)/g,
      'https://script.google.com/macros/s/***/$1',
    )
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, function (m) {
      return maskEmail_(m);
    });
}

function hash8_(text) {
  // FNV-1a 32 ビット。同じ値かどうかを比べるための短い印で、元の値には戻せない
  let h = 0x811c9dc5;
  const s = String(text);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return ('00000000' + h.toString(16)).slice(-8);
}

// ---------------------------------------------------------------- 入口の守り

function ownerVerdict_(x) {
  const active = String((x && x.active) || '').toLowerCase();
  const effective = String((x && x.effective) || '').toLowerCase();
  const owner = String((x && x.owner) || '').toLowerCase();
  if (!active) return { ok: false, reason: 'active が空' };
  if (!owner) return { ok: false, reason: '持ち主が取れない' };
  if (active !== effective) return { ok: false, reason: 'active と effective が違う' };
  if (active !== owner) return { ok: false, reason: 'active と持ち主が違う' };
  return { ok: true, reason: '' };
}

function isRealSheetEvent_(e, ssId, kind) {
  try {
    if (!e || !e.source || typeof e.source.getId !== 'function') return false;
    if (e.source.getId() !== ssId) return false;
    if (kind === 'edit') return !!(e.range && typeof e.range.getSheet === 'function');
    return true;
  } catch (err) {
    return false;
  }
}

function triggerMatch_(uid, triggers, handler) {
  const list = triggers || [];
  const tails = list.map(function (t) {
    return String(t.id).slice(-4);
  });
  if (uid === undefined || uid === null || uid === '') {
    return { result: 'uid なし', tail4: '', count: list.length, idTails: tails };
  }
  const same = list.filter(function (t) {
    return t.handler === handler;
  });
  let result = '消えた後';
  if (same.length > 0) {
    result = same.some(function (t) {
      return String(t.id) === String(uid);
    })
      ? '一致'
      : '一致しない';
  }
  return { result: result, tail4: String(uid).slice(-4), count: list.length, idTails: tails };
}

function decideCheckbox_(e, adminSheetName) {
  const on = !!e && (e.value === true || String(e.value).toUpperCase() === 'TRUE');
  const run = !!e && e.sheetName === adminSheetName && e.a1 === 'B6' && on;
  return { run: run, reset: run };
}

function classifyFake_(e) {
  if (!e || typeof e !== 'object') return 'その他';
  const isBlob = function (v) {
    return !!v && typeof v === 'object' && typeof v.getBytes === 'function';
  };
  if ('t' in e || 'file' in e) return 'form1';
  if (isBlob(e.source) || isBlob(e.range)) return 'form2';
  if (typeof e.source === 'string' || typeof e.range === 'string') return 'form2';
  if (e.source && typeof e.source === 'object') return '値だけ';
  return 'その他';
}

// ---------------------------------------------------------------- 入力規則

function readValidation_(response) {
  if (response && response.error !== undefined) {
    return { state: 'apiError', rule: null, message: maskDigits_(response.error) };
  }
  const sheet = response && response.sheets && response.sheets[0];
  const data = sheet && sheet.data && sheet.data[0];
  const row = data && data.rowData && data.rowData[0];
  const cell = row && row.values && row.values[0];
  if (!cell || !cell.dataValidation) return { state: 'none', rule: null, message: '' };
  return { state: 'rule', rule: cell.dataValidation, message: '' };
}

function isPlainObject_(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function diffWalk_(a, b, path, out) {
  if (isPlainObject_(a) && isPlainObject_(b)) {
    const keys = {};
    Object.keys(a).forEach(function (k) {
      keys[k] = 1;
    });
    Object.keys(b).forEach(function (k) {
      keys[k] = 1;
    });
    Object.keys(keys).forEach(function (k) {
      diffWalk_(a[k], b[k], path ? path + '.' + k : k, out);
    });
    return;
  }
  if (JSON.stringify(a) !== JSON.stringify(b)) out.push(path);
}

function diffPaths_(a, b) {
  const out = [];
  diffWalk_(a, b, '', out);
  return out;
}

function rangeCovers_(a1, row) {
  const text = String(a1).split('!').pop().replace(/\$/g, '');
  const m = text.match(/^([A-Z]+)(\d*)(?::([A-Z]+)(\d*))?$/);
  if (!m) return false;
  const r1 = m[2] ? Number(m[2]) : 1;
  const r2 = m[4] ? Number(m[4]) : m[3] ? (m[2] ? r1 : Infinity) : r1;
  return row >= r1 && row <= r2;
}

// ---------------------------------------------------------------- URL と、ログの値の形

function classifyUrl_(url) {
  const s = String(url || '');
  let kind = 'other';
  let body = s;
  if (s.slice(-5) === '/exec') {
    kind = 'exec';
    body = s.slice(0, -5);
  } else if (s.slice(-4) === '/dev') {
    kind = 'dev';
    body = s.slice(0, -4);
  }
  return { kind: kind, tail4: body.slice(-4), hash8: hash8_(s) };
}

function encodeDoget_(v) {
  return (
    'd=' +
    v.d +
    ';hash=' +
    v.hash +
    ';ehash=' +
    v.ehash +
    ';keys=' +
    (v.keys || []).join(',') +
    ';owner=' +
    v.owner
  );
}

function parseDoget_(text) {
  const m = String(text).match(/^d=(.*?);hash=(.*?);ehash=(.*?);keys=(.*?);owner=(.*)$/);
  if (!m) return null;
  return { d: m[1], hash: m[2], ehash: m[3], keys: m[4] ? m[4].split(',') : [], owner: m[5] };
}

function encodeMemo_(v) {
  return v.origin + '|d=' + v.d;
}

function parseMemo_(text) {
  const m = String(text).match(/^(.*)\|d=(.*)$/);
  return m ? { origin: m[1], d: m[2] } : { origin: String(text), d: '' };
}

function normalizeNumber_(text) {
  return String(text === undefined || text === null ? '' : text)
    .normalize('NFKC')
    .trim();
}

function markByNumber_(text) {
  const t = normalizeNumber_(text);
  if (!/^\d+$/.test(t)) return null;
  return MARKS[Number(t) - 1] || null;
}

function noteNumber_(key) {
  for (let i = 0; i < NOTE_QUESTIONS.length; i++) {
    if (NOTE_QUESTIONS[i].key === key) return i + 1;
  }
  return 0;
}

function noteByNumber_(text) {
  const t = normalizeNumber_(text);
  if (!/^\d+$/.test(t)) return null;
  return NOTE_QUESTIONS[Number(t) - 1] || null;
}

function validateNoteAnswer_(q, answer) {
  const a = String(answer === undefined || answer === null ? '' : answer).trim();
  if (q.kind === 'yesno') {
    if (a === 'はい' || a === 'いいえ') return { ok: true, value: a, message: '' };
    return { ok: false, value: '', message: '「はい」か「いいえ」で答える' };
  }
  if (!a) return { ok: false, value: '', message: '答えが空' };
  return { ok: true, value: a.slice(0, 200), message: '' };
}

function groupByMarks_(rows) {
  const out = [];
  (rows || []).forEach(function (r) {
    if (r.fact === 'mark') out.push({ mark: r.value, rows: [] });
    else if (out.length > 0) out[out.length - 1].rows.push(r);
  });
  return out;
}

// ---------------------------------------------------------------- まとめ

function impactFor_(scenario, verdict) {
  for (let i = 0; i < VERDICTS.length; i++) {
    const v = VERDICTS[i];
    if (v.verdict === verdict && v.scenarios.indexOf(scenario) >= 0) return v.impact;
  }
  return '';
}

function decided_(scenario, verdict, evidence) {
  return {
    verdict: verdict,
    evidence: evidence,
    impact: impactFor_(scenario, verdict),
    pending: '',
  };
}

function undecided_(evidence, missing) {
  return { verdict: '未確定', evidence: evidence, impact: '', pending: missing };
}

function lastRow_(rows, fact, pred) {
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i].fact === fact && (!pred || pred(rows[i]))) return rows[i];
  }
  return null;
}

function valueOf_(rows, fact) {
  const r = lastRow_(rows, fact);
  return r ? String(r.value) : undefined;
}

function hasCalled_(rows, entry, fn) {
  return rows.some(function (r) {
    return r.fact === 'called' && r.entry === entry && r.value === fn;
  });
}

// owner の行の詳細の先頭に、出どころとデプロイの印（web.memo と同じ形）を書いてある。まとめはこれで組にする
function withOrigins_(rows) {
  const out = [];
  rows.forEach(function (r) {
    if (r.fact !== 'owner' || r.entry !== ENTRY.run) return;
    const m = parseMemo_(String(r.detail).split('、')[0]);
    out.push({ origin: m.origin, d: m.d, verdict: String(r.value) });
  });
  return out;
}

// 同じ区切りの名前のまとまりが2つ以上あるとき（やり直したとき）は、最後のまとまりを使う
function lastGroup_(rows, name) {
  const groups = groupByMarks_(rows).filter(function (g) {
    return g.mark === name;
  });
  return groups.length > 0 ? groups[groups.length - 1] : null;
}

function summaryLabel_(key) {
  const base = String(key).slice(0, 3);
  const extra = {
    'S01-rebuild': '複数選択（作り直し）',
    'S07-underscore': '画像のボタン（末尾 _）',
    'S12-timer': 'triggerUid（時間主導）',
  };
  return { scenario: base, name: extra[key] || SCENARIOS[base] || '' };
}

function summarizeMultiSelect_(rows) {
  const script = valueOf_(rows, 'user.d2.script');
  const manual = valueOf_(rows, 'user.d2.manual');
  const d4 = valueOf_(rows, 'user.d4');
  const d3 = valueOf_(rows, 'user.d3');
  const builder = valueOf_(rows, 'ms.builder');
  const diffRow = lastRow_(rows, 'ms.diff');
  const diff = diffRow ? String(diffRow.value) : undefined;
  const evidence =
    'user.d2.script=' +
    script +
    '、user.d2.manual=' +
    manual +
    '、user.d4=' +
    d4 +
    '、user.d3=' +
    d3 +
    '、ms.builder=' +
    builder +
    '、ms.diff=' +
    diff +
    '、ms.d3.before=' +
    valueOf_(rows, 'ms.d3.before') +
    '、ms.d2.set=' +
    String(valueOf_(rows, 'ms.d2.set')).slice(0, 120) +
    '、ms.d2.manual=' +
    String(valueOf_(rows, 'ms.d2.manual')).slice(0, 120) +
    '、ms.d2.value=' +
    valueOf_(rows, 'ms.d2.value');
  if (manual === undefined) return undecided_(evidence, '足りない控え: user.d2.manual');
  if (manual !== 'はい') return decided_('S01', '手でもオンにできない', evidence);
  if (script === 'はい' && builder === 'none') {
    return undecided_(
      evidence,
      '食い違い: user.d2.script がはいなのに、ビルダーの複数選択のメソッドを呼んでいない（ms.builder が none）',
    );
  }
  if (script === 'はい') return decided_('S01', 'ビルダーで設定できる', evidence);
  if (script === undefined) return undecided_(evidence, '足りない控え: user.d2.script');
  if (diff && d4 === 'はい') return decided_('S01', '高度なサービスで設定できる', evidence);
  if (d3 === 'はい') return decided_('S01', 'コピーで設定できる', evidence);
  const missing = [];
  if (d4 === undefined) missing.push('user.d4');
  if (d3 === undefined) missing.push('user.d3');
  if (missing.length > 0) return undecided_(evidence, '足りない控え: ' + missing.join('、'));
  return decided_('S01', 'できない', evidence);
}

function summarizeRebuild_(rows) {
  const manual = valueOf_(rows, 'user.d2.manual');
  const d5 = valueOf_(rows, 'user.d5');
  const ms5 = valueOf_(rows, 'ms.d5');
  const evidence =
    'user.d2.manual=' + manual + '、user.d5=' + d5 + '、ms.d5=' + String(ms5).slice(0, 120);
  if (manual === undefined) return undecided_(evidence, '足りない控え: user.d2.manual');
  if (manual !== 'はい') {
    return undecided_(
      evidence,
      '手でオンにした D2 で複数選べなかったので、判定しない（結果が出ている。やり直さずにそのまま貼る）',
    );
  }
  if (ms5 === 'skipped' && d5 !== undefined) {
    return undecided_(
      evidence,
      '食い違い: ms.d5 が skipped（作り直しをしていない）なのに、user.d5 の答えがある',
    );
  }
  if (d5 === undefined) return undecided_(evidence, '足りない控え: user.d5');
  return decided_('S01', d5 === 'はい' ? '作り直しで残る' : '作り直しで消える', evidence);
}

function summarizeUnderscore_(rows, scenario, entry, plainFn, underFn) {
  const plain = hasCalled_(rows, entry, plainFn);
  const under = hasCalled_(rows, entry, underFn);
  const createdRows = rows.filter(function (r) {
    return r.fact === 'trigger.created' && (r.value === underFn || r.value === underFn + ':error');
  });
  const created = createdRows.length > 0 ? createdRows[createdRows.length - 1].value : undefined;
  const evidence =
    plainFn + ' の行=' + plain + '、' + underFn + ' の行=' + under + '、trigger.created=' + created;
  if (created === underFn + ':error') return decided_(scenario, '作れない', evidence);
  if (plain && under) return decided_(scenario, '呼べる', evidence);
  if (!plain) return undecided_(evidence, '足りない事実: ' + plainFn + ' の行');
  if (created === undefined)
    return undecided_(evidence, '足りない事実: trigger.created（' + underFn + ' を作った行）');
  return decided_(scenario, '呼べない', evidence);
}

function summarizeOwnerTable_(rows) {
  const entries = [ENTRY.menu, ENTRY.button, ENTRY.edit, ENTRY.timer];
  const lines = [];
  const count = {};
  const failed = {};
  entries.forEach(function (en) {
    const rs = rows.filter(function (r) {
      return r.fact === 'owner' && r.entry === en;
    });
    count[en] = rs.length;
    if (rs.length === 0) {
      lines.push(en + ': 行なし');
      return;
    }
    const bad = rs.filter(function (r) {
      return r.value !== 'ok';
    });
    if (bad.length > 0) failed[en] = true;
    lines.push(
      en +
        ': ' +
        rs.length +
        ' 行、通る ' +
        (rs.length - bad.length) +
        '、止まった理由=[' +
        bad
          .map(function (r) {
            return r.value;
          })
          .join(',') +
        ']',
    );
  });
  const evidence = lines.join('、');
  const missing = [];
  if (!count[ENTRY.menu]) missing.push('メニューの owner の行');
  if (!count[ENTRY.button]) missing.push('画像のボタンの owner の行');
  if (missing.length > 0) return undecided_(evidence, '足りない事実: ' + missing.join('、'));
  const parts = impactFor_('S10', '入口ごとの表')
    .replace(/（影響の文は[^）]*）/, '')
    .split('。');
  let impact;
  if (failed[ENTRY.menu] || failed[ENTRY.button]) {
    impact = parts[1];
  } else {
    impact = parts[0];
    const trig = count[ENTRY.edit] + count[ENTRY.timer] > 0;
    if (trig) impact += '。' + (failed[ENTRY.edit] || failed[ENTRY.timer] ? parts[3] : parts[2]);
  }
  return { verdict: '入口ごとの表', evidence: evidence, impact: impact, pending: '' };
}

function summarizeEdits_(rows) {
  const ops = ['手入力', '貼り付け', '行の挿入', '行の削除'];
  const lines = [];
  ops.forEach(function (op) {
    const g = lastGroup_(rows, op);
    if (!g) return;
    const has = function (pred) {
      return g.rows.some(pred);
    };
    const changes = g.rows
      .filter(function (r) {
        return r.fact === 'edit' && r.entry === ENTRY.change;
      })
      .map(function (r) {
        return r.value;
      });
    const yn = function (b) {
      return b ? '動いた' : '動かない';
    };
    lines.push(
      op +
        ': onEdit(シンプル)=' +
        yn(
          has(function (r) {
            return r.fact === 'edit' && r.entry === ENTRY.simple;
          }),
        ) +
        '、編集トリガー(_ なし)=' +
        yn(
          has(function (r) {
            return r.fact === 'called' && r.entry === ENTRY.edit && r.value === 'trigEditPlain';
          }),
        ) +
        '、編集トリガー(_ あり)=' +
        yn(
          has(function (r) {
            return r.fact === 'called' && r.entry === ENTRY.edit && r.value === 'trigEdit_';
          }),
        ) +
        '、onChange=' +
        (changes.length ? changes.join('/') : '動かない'),
    );
  });
  if (lines.length === 0)
    return undecided_('', '足りない事実: 区切り（手入力、貼り付け、行の挿入、行の削除）');
  return decided_('S05', '操作ごとの表', lines.join('。'));
}

function summarizeIcons_(rows) {
  const kinds = [
    ['SVG(base64)', 'user.icon.svg64'],
    ['SVG(URL)', 'user.icon.svgurl'],
    ['PNG', 'user.icon.png'],
  ];
  const lines = [];
  const missing = [];
  kinds.forEach(function (k) {
    const r = lastRow_(rows, 'icon', function (x) {
      return String(x.value).indexOf(k[0] + ':') === 0;
    });
    const seen = valueOf_(rows, k[1]);
    if (!r) missing.push(k[0] + ' の icon の行');
    if (seen === undefined) missing.push(k[1]);
    lines.push(
      k[0] + ': 設定=' + (r ? String(r.value).split(':').pop() : '行なし') + '、見えた=' + seen,
    );
  });
  if (missing.length > 0)
    return undecided_(lines.join('、'), '足りない事実と控え: ' + missing.join('、'));
  return decided_('S06', '種類ごとの表', lines.join('、'));
}

function summarizeButtonUnderscore_(rows) {
  const assign = lastRow_(rows, 'assign', function (r) {
    return String(r.value).indexOf('buttonUnderscore_:') === 0;
  });
  const pressed = hasCalled_(rows, ENTRY.button, 'buttonUnderscore_');
  const s07 = valueOf_(rows, 'user.s07');
  const evidence =
    '割り当て=' +
    (assign ? assign.value : '行なし') +
    '、押して buttonUnderscore_ の行=' +
    (pressed ? 'あり' : 'なし') +
    '、user.s07=' +
    s07;
  if (assign && String(assign.value).slice(-6) === ':error')
    return decided_('S07', '末尾 `_` は使えない', evidence);
  if (pressed) return decided_('S07', '末尾 `_` も使える', evidence);
  if (!assign) return undecided_(evidence, '足りない事実: assign の行（画像のボタンを置く）');
  if (s07 === undefined) return undecided_(evidence, '足りない控え: user.s07');
  return decided_('S07', '末尾 `_` は使えない', evidence);
}

function summarizePhone_(rows) {
  const front = lastGroup_(rows, 'スマホの前');
  const back = lastGroup_(rows, 'スマホの後');
  const missing = [];
  if (!front || !back) missing.push('区切り（スマホの前、スマホの後）');
  ['user.phone.menu', 'user.phone.button', 'user.phone.checkbox'].forEach(function (k) {
    if (valueOf_(rows, k) === undefined) missing.push(k);
  });
  const count = function (fn) {
    return front ? front.rows.filter(fn).length : 0;
  };
  const evidence =
    'メニュー: ' +
    count(function (r) {
      return r.fact === 'called' && r.entry === ENTRY.menu;
    }) +
    ' 行、画像のボタン: ' +
    count(function (r) {
      return r.fact === 'called' && r.entry === ENTRY.button;
    }) +
    ' 行、チェックボックス: ' +
    count(function (r) {
      return r.fact === 'checkbox';
    }) +
    ' 行、user.phone.menu=' +
    valueOf_(rows, 'user.phone.menu') +
    '、user.phone.button=' +
    valueOf_(rows, 'user.phone.button') +
    '、user.phone.checkbox=' +
    valueOf_(rows, 'user.phone.checkbox');
  return missing.length > 0
    ? undecided_(evidence, '足りない事実と控え: ' + missing.join('、'))
    : decided_('S08', '入口ごとの表', evidence);
}

function summarizeWeb_(rows, out) {
  const calls = withOrigins_(rows);
  const byOrigin = function (name) {
    return calls.filter(function (c) {
      return c.origin === name;
    });
  };
  const okIn = function (list) {
    return list.some(function (c) {
      return c.verdict === 'ok';
    });
  };
  const reasons = function (list) {
    return list
      .map(function (c) {
        return c.verdict;
      })
      .join(',');
  };

  // S11
  {
    const b = byOrigin('B の PC');
    const anon = byOrigin('シークレット');
    const anyOk = okIn(b) || okIn(anon);
    const evidence =
      'B の PC: ' + b.length + ' 行、シークレット: ' + anon.length + ' 行、通った行=' + anyOk;
    if (anyOk) out.S11 = decided_('S11', '止まらない', evidence);
    else if (b.length > 0 && anon.length > 0) out.S11 = decided_('S11', '止まる', evidence);
    else {
      const m = [];
      if (b.length === 0) m.push('B の PC の行');
      if (anon.length === 0) m.push('シークレットの行');
      out.S11 = undecided_(evidence, '足りない事実: ' + m.join('、'));
    }
  }
  // S15
  {
    const a = byOrigin('A の PC');
    const b = byOrigin('B の PC');
    const anon = byOrigin('シークレット');
    const evidence =
      'A の PC: ' +
      a.length +
      ' 行（' +
      reasons(a) +
      '）、B の PC: ' +
      b.length +
      ' 行、シークレット: ' +
      anon.length +
      ' 行';
    if (a.length > 0 && !okIn(a)) out.S15 = decided_('S15', '通らない', evidence);
    else if (okIn(a) && b.length > 0 && anon.length > 0 && !okIn(b) && !okIn(anon)) {
      out.S15 = decided_('S15', '通る', evidence);
    } else {
      const m = [];
      if (a.length === 0) m.push('A の PC の行');
      if (b.length === 0) m.push('B の PC の行');
      if (anon.length === 0) m.push('シークレットの行');
      if (okIn(b) || okIn(anon)) m.push('B かシークレットの行で通った');
      out.S15 = undecided_(evidence, '足りない事実: ' + m.join('、'));
    }
  }
  // S18
  {
    const hit = calls.filter(function (c) {
      return (
        (c.origin === 'A のスマホの Safari' || c.origin === 'A のスマホの Chrome') && c.d === '2'
      );
    });
    const s18 = valueOf_(rows, 'user.s18');
    const evidence =
      'A のスマホの d=2 の行: ' + hit.length + ' 行（' + reasons(hit) + '）、user.s18=' + s18;
    if (s18 === 'いいえ') out.S18 = decided_('S18', '開けない', evidence);
    else if (okIn(hit)) out.S18 = decided_('S18', '開ける', evidence);
    else if (hit.length > 0) out.S18 = decided_('S18', '開けない', evidence);
    else
      out.S18 = undecided_(
        evidence,
        '足りない事実: A のスマホの Safari か Chrome で、d=2 から呼んだ行',
      );
  }
}

function summarizeFake_(rows) {
  const fakes = rows
    .filter(function (r) {
      return r.fact === 'fake';
    })
    .map(function (r) {
      const p = String(r.value).split(':');
      return { kind: p[0], real: p[1] };
    });
  const errors = rows.filter(function (r) {
    return r.fact === 'fake.error';
  });
  const kinds = ['値だけ', 'form1', 'form2'];
  const missing = kinds.filter(function (k) {
    return !fakes.some(function (f) {
      return f.kind === k;
    });
  });
  const evidence =
    fakes
      .map(function (f) {
        return f.kind + ':' + f.real;
      })
      .join('、') +
    (errors.length
      ? '、fake.error=[' +
        errors
          .map(function (r) {
            return r.value;
          })
          .join(' / ') +
        ']'
      : '');
  if (
    fakes.some(function (f) {
      return f.real === 'true';
    })
  )
    return decided_('S13', '見分けられない', evidence);
  if (errors.length > 0) return decided_('S13', 'form を送れない', evidence);
  if (missing.length === 0) return decided_('S13', '見分けられる', evidence);
  return undecided_(evidence, '足りない事実: ' + missing.join('、') + ' の行');
}

function summarizeDeploy_(rows) {
  const parsed = rows
    .filter(function (r) {
      return r.fact === 'doget';
    })
    .map(function (r) {
      return parseDoget_(r.value);
    })
    .filter(Boolean);
  // S16
  const keys = ['user.s16.b', 'user.s16.anon', 'user.s16.first'];
  const b = valueOf_(rows, 'user.s16.b');
  const anon = valueOf_(rows, 'user.s16.anon');
  const first = valueOf_(rows, 'user.s16.first');
  const bad = parsed.some(function (p) {
    return p.d === '2' && p.owner !== 'ok';
  });
  const ev16 =
    'user.s16.b=' +
    b +
    '、user.s16.anon=' +
    anon +
    '、user.s16.first=' +
    first +
    '、2つ目の doGet に持ち主以外の行=' +
    bad;
  let s16;
  if (b === 'はい' || anon === 'はい' || first === 'いいえ' || bad)
    s16 = decided_('S16', '作れない', ev16);
  else {
    const missing = keys.filter(function (k) {
      return valueOf_(rows, k) === undefined;
    });
    s16 =
      missing.length > 0
        ? undecided_(ev16, '足りない控え: ' + missing.join('、'))
        : decided_('S16', '作れる', ev16);
  }
  // S17: 持ち主の行（同じ出どころ）だけを比べる。同じ d の中のそろい具合も根拠に出す
  const pick = function (d) {
    const all = parsed.filter(function (p) {
      return p.d === d;
    });
    const own = all.filter(function (p) {
      return p.owner === 'ok';
    });
    return own.length > 0 ? own : all;
  };
  const distinct = function (list, field) {
    const seen = {};
    list.forEach(function (p) {
      seen[p[field]] = 1;
    });
    return Object.keys(seen).length;
  };
  const one = pick('1');
  const two = pick('2');
  let s17;
  if (one.length === 0 || two.length === 0) {
    s17 = undecided_(
      '',
      '足りない事実: ' +
        (one.length === 0 ? 'd=1 の doGet の行' : '') +
        (one.length === 0 && two.length === 0 ? '、' : '') +
        (two.length === 0 ? 'd=2 の doGet の行' : ''),
    );
  } else {
    const l1 = one[one.length - 1];
    const l2 = two[two.length - 1];
    const evidence =
      'getUrl のハッシュ: ' +
      l1.hash +
      ' と ' +
      l2.hash +
      '、e の値のハッシュ: ' +
      l1.ehash +
      ' と ' +
      l2.ehash +
      '、d=1 内のハッシュ: ' +
      distinct(one, 'hash') +
      ' 種類、d=2 内のハッシュ: ' +
      distinct(two, 'hash') +
      ' 種類';
    s17 = decided_(
      'S17',
      l1.hash !== l2.hash || l1.ehash !== l2.ehash ? '見分けられる' : '見分けられない',
      evidence,
    );
  }
  return { s16: s16, s17: s17 };
}

function summarize_(rows) {
  rows = rows || [];
  const out = {};

  out.S01 = summarizeMultiSelect_(rows);
  out['S01-rebuild'] = summarizeRebuild_(rows);

  // S02
  {
    const under = hasCalled_(rows, ENTRY.menu, 'menuUnderscore_');
    const plain = hasCalled_(rows, ENTRY.menu, 'menuPlain');
    const s02 = valueOf_(rows, 'user.s02');
    const evidence =
      'menuUnderscore_ の行=' + under + '、menuPlain の行=' + plain + '、user.s02=' + s02;
    if (under) out.S02 = decided_('S02', '呼べる', evidence);
    else if (!plain)
      out.S02 = undecided_(
        evidence,
        '足りない事実: menuPlain の行（「メニュー: 末尾が _ でない関数」を押す）',
      );
    else if (s02 === undefined) out.S02 = undecided_(evidence, '足りない控え: user.s02');
    else out.S02 = decided_('S02', '呼べない', evidence);
  }

  out.S03 = summarizeUnderscore_(rows, 'S03', ENTRY.timer, 'timerPlain', 'timer_');
  out.S09 = summarizeUnderscore_(rows, 'S09', ENTRY.edit, 'trigEditPlain', 'trigEdit_');

  // S04
  {
    const inList = valueOf_(rows, 'list.inList');
    const inRange = valueOf_(rows, 'list.inRange');
    const evidence = 'list.inList=' + inList + '、list.inRange=' + inRange;
    if (inList === 'false' || inRange === 'false') out.S04 = decided_('S04', '出ない', evidence);
    else if (inRange === 'unknown') {
      out.S04 = undecided_(
        evidence,
        '範囲を読めなかった（list.inRange が unknown。S04 用のセル F2 の入力規則を読めなかった）',
      );
    } else if (inList === 'true' && inRange === 'true') out.S04 = decided_('S04', '出る', evidence);
    else out.S04 = undecided_(evidence, '足りない事実: list.inList、list.inRange');
  }

  out.S05 = summarizeEdits_(rows);
  out.S06 = summarizeIcons_(rows);

  out.S07 = hasCalled_(rows, ENTRY.button, 'buttonPlain')
    ? decided_('S07', '動く', 'buttonPlain の行=あり')
    : undecided_('buttonPlain の行=なし', '足りない事実: buttonPlain の行（画像のボタンを押す）');
  out['S07-underscore'] = summarizeButtonUnderscore_(rows);

  out.S08 = summarizePhone_(rows);

  out.S10 = summarizeOwnerTable_(rows);
  out.S14 =
    out.S10.verdict === '入口ごとの表'
      ? decided_('S14', '入口ごとの表', out.S10.evidence)
      : out.S10;
  if (out.S14.verdict === '入口ごとの表') out.S14.impact = out.S10.impact;

  summarizeWeb_(rows, out);

  // S12
  {
    const edit = lastRow_(rows, 'uid', function (r) {
      return r.entry === ENTRY.edit;
    });
    const timer = lastRow_(rows, 'uid', function (r) {
      return r.entry === ENTRY.timer;
    });
    const names = { 一致: '一致する', 一致しない: '一致しない', 消えた後: '消えた後' };
    const make = function (r, label) {
      if (!r) return undecided_('', '足りない事実: uid の行（' + label + '）');
      const v = names[r.value];
      if (!v) return undecided_('uid=' + r.value, '照合できなかった（' + r.value + '）');
      return decided_('S12', v, 'uid=' + r.value);
    };
    out.S12 = make(edit, '編集トリガー');
    out['S12-timer'] = make(timer, '時間主導');
  }

  out.S13 = summarizeFake_(rows);
  const d = summarizeDeploy_(rows);
  out.S16 = d.s16;
  out.S17 = d.s17;

  return out;
}

// 値の形を短い文字列にする（中身は短い文字列だけ出す）。偽のイベントの形を調べるために使う
function shape_(v, depth) {
  const t = typeof v;
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  if (t === 'function') return 'function';
  if (t === 'string') return v.length <= 30 ? 'string("' + v + '")' : 'string(' + v.length + '字)';
  if (t !== 'object') return t + '(' + String(v) + ')';
  const probes = [
    'getSheet',
    'getId',
    'getSheets',
    'getRow',
    'getValue',
    'getBytes',
    'getName',
    'getContentType',
  ];
  const methods = probes.filter(function (m) {
    return typeof v[m] === 'function';
  });
  let keys = [];
  try {
    keys = Object.keys(v);
  } catch (err) {
    keys = [];
  }
  const tag = Object.prototype.toString.call(v);
  if (depth <= 0) return tag + '{鍵' + keys.length + '個, メソッド:[' + methods.join(',') + ']}';
  const inner = keys.slice(0, 12).map(function (k) {
    return k + ':' + shape_(v[k], depth - 1);
  });
  return tag + '{' + inner.join(', ') + '}、メソッド:[' + methods.join(',') + ']';
}
