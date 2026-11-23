// T1-3 検証: GAS を呼ぶ共通の部分。判定と照合は Logic.js の純粋な関数に任せ、ここは値を集めて渡すだけにする。
// 利用者の入力やイベントの中身は、必ず文字列にして、列の書式を書式なしテキストにしてから書く。

const SHEET = {
  log: 'T1-3 検証ログ',
  summary: 'T1-3 まとめ',
  beans: 'T1-3 豆の表',
  items: 'T1-3 項目',
  list: 'T1-3 _リスト',
  admin: 'T1-3 管理',
  icons: 'T1-3 アイコン',
};

const PROP_SSID = 'T13_SSID';
// この検証が作るトリガーの関数名。消すときはこの名前のものだけを消す
const OWN_HANDLERS = ['trigEditPlain', 'trigEdit_', 'trigChange', 'timerPlain', 'timer_'];

function safe_(fn) {
  try {
    return fn();
  } catch (err) {
    return '取れなかった（' + maskDigits_((err && err.message) || err).slice(0, 120) + '）';
  }
}

// いまのスプレッドシート。Web アプリの中では getActiveSpreadsheet が null になるので、準備で保存した ID で開く
function ss_() {
  let s = null;
  try {
    s = SpreadsheetApp.getActiveSpreadsheet();
  } catch (err) {
    s = null;
  }
  if (s) return s;
  const id = PropertiesService.getScriptProperties().getProperty(PROP_SSID);
  if (!id) throw new Error('スプレッドシートを特定できない。メニューの「準備」を先に押す');
  return SpreadsheetApp.openById(id);
}

function sheet_(name) {
  const ss = ss_();
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function now_() {
  return Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
}

function logSheet_() {
  const ss = ss_();
  let sh = ss.getSheetByName(SHEET.log);
  if (sh) return sh;
  sh = ss.insertSheet(SHEET.log);
  sh.getRange('A:F').setNumberFormat('@');
  sh.getRange(1, 1, 1, 6).setValues([['日時', 'シナリオ', '入口', '事実', '値', '詳細']]);
  sh.setFrozenRows(1);
  sh.setColumnWidths(1, 1, 150);
  sh.setColumnWidths(2, 1, 80);
  sh.setColumnWidths(3, 1, 200);
  sh.setColumnWidths(4, 1, 150);
  sh.setColumnWidths(5, 1, 260);
  sh.setColumnWidths(6, 1, 600);
  return sh;
}

// 1つの事実ごとに1行。値と詳細は、メールアドレスと URL を伏せてから書く
function log_(scenario, entry, fact, value, detail) {
  const sh = logSheet_();
  const row = [
    now_(),
    String(scenario || ''),
    String(entry || ''),
    String(fact || ''),
    scrubText_(value).slice(0, 600),
    scrubText_(detail).slice(0, 1500),
  ];
  // 値を書く前に、列全体を「書式なしテキスト」にする（= で始まる値も数式にならない）
  sh.getRange('A:F').setNumberFormat('@');
  sh.appendRow(row);
}

function readRows_() {
  const sh = ss_().getSheetByName(SHEET.log);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh
    .getRange(2, 1, sh.getLastRow() - 1, 6)
    .getValues()
    .map(function (r) {
      return {
        time: String(r[0]),
        scenario: String(r[1]),
        entry: String(r[2]),
        fact: String(r[3]),
        value: String(r[4]),
        detail: String(r[5]),
      };
    });
}

function tryEmail_(fn) {
  try {
    return { v: String(fn() || ''), err: '' };
  } catch (err) {
    return { v: '', err: maskDigits_((err && err.message) || err).slice(0, 80) };
  }
}

// 持ち主の確かめ。取った値は伏せる前のまま ownerVerdict_ に渡し、ログには伏せた値だけを書く
function collectOwner_() {
  const active = tryEmail_(function () {
    return Session.getActiveUser().getEmail();
  });
  const effective = tryEmail_(function () {
    return Session.getEffectiveUser().getEmail();
  });
  const owner = tryEmail_(function () {
    return ss_().getOwner().getEmail();
  });
  const verdict = ownerVerdict_({ active: active.v, effective: effective.v, owner: owner.v });
  const errs = [active.err, effective.err, owner.err].filter(Boolean).join(' / ');
  return {
    verdict: verdict,
    summary:
      'active=' +
      (maskEmail_(active.v) || '(空)') +
      '、effective=' +
      (maskEmail_(effective.v) || '(空)') +
      '、owner=' +
      (maskEmail_(owner.v) || '(空)') +
      (errs ? '、エラー: ' + errs : ''),
  };
}

function logOwner_(scenario, entry, extra, prefix) {
  const c = collectOwner_();
  // Web アプリからの呼び出しでは、詳細の先頭に出どころとデプロイの印を書く（まとめはこれで組にする）
  log_(
    scenario,
    entry,
    'owner',
    c.verdict.ok ? 'ok' : c.verdict.reason,
    (prefix ? prefix + '、' : '') + c.summary + (extra ? '、' + extra : ''),
  );
  return c.verdict;
}

// イベントの triggerUid と、このプロジェクトのトリガーの ID を照合する
function uidInfo_(e, handler) {
  const list = safe_(function () {
    return ScriptApp.getProjectTriggers().map(function (t) {
      return { id: t.getUniqueId(), handler: t.getHandlerFunction() };
    });
  });
  if (typeof list === 'string')
    return { result: 'uid なし', tail4: '', count: 0, idTails: [], error: list };
  return triggerMatch_(e && e.triggerUid, list, handler);
}

function uidDetail_(m) {
  return (
    'triggerUid の末尾4字=' +
    m.tail4 +
    '、一覧のトリガー ' +
    m.count +
    ' 個（ID末尾4字=[' +
    m.idTails.join(',') +
    ']）'
  );
}

// 入力規則の JSON を高度な Sheets サービスで読む。読む前に flush して、直前の変更を反映させる
function readValidationState_(sheetName, a1) {
  if (typeof Sheets === 'undefined') {
    return {
      state: 'apiError',
      rule: null,
      message: '高度な Sheets サービスが使えない（Sheets が未定義）',
    };
  }
  try {
    SpreadsheetApp.flush();
    const res = Sheets.Spreadsheets.get(ss_().getId(), {
      ranges: ["'" + sheetName + "'!" + a1],
      includeGridData: true,
      fields: 'sheets(data(rowData(values(dataValidation))))',
    });
    return readValidation_(res);
  } catch (err) {
    return readValidation_({ error: String((err && err.message) || err) });
  }
}

// ログに書く値: ルールなら JSON、ほかは none か apiError
function validationValue_(st) {
  return st.state === 'rule' ? JSON.stringify(st.rule) : st.state;
}
