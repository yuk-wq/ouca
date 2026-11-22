// 保存するサーバーのコード（モジュール）の元。関数の本体として評価され、オブジェクトを返す。
// ローダーが new Function('ctx', この中身)(ctx) で評価する。make-bundle.mjs が、これをバンドルに入れる。
// globalThis には書き込まない。

const CODE_LABEL = 'T12-initial';
const MARK_KEY = 'T12_MARK';
const SAMPLE_KEY = 'T12_SAMPLE';
const SAMPLE_VALUE = 'T12-sample-value'; // ダミーの値
const CODE_ID_PREFIX = 'T12@';
const BUTTON_HANDLER = 'menuInspect';
const DAILY_HANDLER = 'runDaily';
const EDIT_HANDLER = 'runOnEdit';
const CODE_PROTECTION_DESC = 'T1-2 _コード（保護。編集者は持ち主だけ）';
const BUTTON_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAGAAAAAgCAIAAABiouoDAAAAZklEQVR4nO3XwQmAMBBE0TSTyizfIvTiSTBLIOCI7zMFLO+27dCw9vYB6V1AfdvtNkCAAAECFDxAgAABAhQ8QOuAxu/cdwNUBKgIUNEyoH8OECBAgAAFDxAgQIAABQ/QDJCeAlR0Aoo/G+vIXh/RAAAAAElFTkSuQmCC'; // 96x32 の小さな PNG（青い四角）

const TAB = {
  contents: 'T1-2 テンプレートの内容',
  protectSheet: 'T1-2 保護シート',
  protectRange: 'T1-2 保護範囲',
  validation: 'T1-2 入力規則',
  list: 'T1-2 リスト',
  format: 'T1-2 書式とグラフ',
  admin: 'T1-2 管理',
};

// ---------------------------------------------------------------- 小さな道具

// 取れなかった API は、例外の文言を値にして続ける（検証全体を止めない）
function safe_(fn) {
  try {
    return fn();
  } catch (err) {
    return '取れなかった（' + String((err && err.message) || err).slice(0, 80) + '）';
  }
}

function lower_(s) {
  return String(s || '').toLowerCase();
}

// メールアドレスは、シートに書かない。持ち主との同一は、小文字にしたアドレスの SHA-256（16進）で比べる
function hashEmail_(email) {
  const text = lower_(email);
  if (!text) return '';
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8)
    .map(function (b) {
      const v = b < 0 ? b + 256 : b;
      return (v < 16 ? '0' : '') + v.toString(16);
    })
    .join('');
}

function includesHash_(emails, hash) {
  return (
    !!hash &&
    emails.some(function (e) {
      return hashEmail_(e) === hash;
    })
  );
}

function emailsOf_(users) {
  return (users || []).map(function (u) {
    return lower_(u.getEmail());
  });
}

function sheet_(name) {
  return SpreadsheetApp.getActive().getSheetByName(name);
}

function getOrCreate_(name) {
  return sheet_(name) || SpreadsheetApp.getActive().insertSheet(name);
}

// 書式を文字列にして書く（= で始まる値が数式にならないようにする）
function putText_(sh, row, col, rows) {
  sh.getRange(row, col, rows.length, rows[0].length)
    .setNumberFormat('@')
    .setValues(
      rows.map(function (r) {
        return r.map(String);
      }),
    );
}

function removeProtections_(sh) {
  [SpreadsheetApp.ProtectionType.SHEET, SpreadsheetApp.ProtectionType.RANGE].forEach(function (t) {
    sh.getProtections(t).forEach(function (p) {
      p.remove();
    });
  });
}

// 編集者を、いま動かしている人（持ち主）だけにする
// TODO(確認): removeEditors に User の配列を渡せることは公式の例からの推測
// ドメインの設定（canDomainEdit、setDomainEdit）は、個人アカウントで失敗するかもしれないので、失敗しても続ける
// 戻り値は、ドメインの設定についての文言
function ownerOnly_(protection) {
  const me = Session.getEffectiveUser();
  protection.addEditor(me);
  const others = protection.getEditors().filter(function (u) {
    return u.getEmail() !== me.getEmail();
  });
  if (others.length) protection.removeEditors(others);
  try {
    if (protection.canDomainEdit()) protection.setDomainEdit(false);
    return 'ドメインの設定は確かめた';
  } catch (err) {
    return (
      'ドメインの設定は取れなかった（' + String((err && err.message) || err).slice(0, 80) + '）'
    );
  }
}

function ensureCodeProtection_(sh) {
  const existing = sh.getProtections(SpreadsheetApp.ProtectionType.SHEET);
  if (existing.length) return '保護はすでにある';
  const p = sh.protect().setDescription(CODE_PROTECTION_DESC);
  return '保護を作った（編集者は持ち主だけ。' + ownerOnly_(p) + '）';
}

function ensureDailyTrigger_() {
  const has = ScriptApp.getProjectTriggers().some(function (t) {
    return (
      t.getHandlerFunction() === DAILY_HANDLER && t.getEventType() === ScriptApp.EventType.CLOCK
    );
  });
  if (has) return '時間主導（毎日）のトリガーはすでにある。作らなかった';
  ScriptApp.newTrigger(DAILY_HANDLER).timeBased().everyDays(1).atHour(3).create();
  return '時間主導（毎日）のトリガーを作った';
}

function valueText_(v) {
  if (v === null || v === undefined) return '（なし）';
  if (Array.isArray(v)) return JSON.stringify(v);
  if (typeof v.getA1Notation === 'function')
    return v.getSheet().getName() + '!' + v.getA1Notation();
  return String(v);
}

// ---------------------------------------------------------------- 観察（作ったものを実際に読む）
// テンプレートでは「期待」を作るために、コピー先では「実際」を調べるために、同じ関数を使う。
// 戻り値: count（数）、feature（特徴。期待と比べる）、extra（比べず、詳細に出すだけ）

// 保護の特徴は、説明、範囲、警告のみかだけ。編集者の人数とテンプレートの持ち主を含むかは、別の行で見る
function protectionInfo_(p, withRange) {
  const parts = ['説明=' + p.getDescription(), '警告のみ=' + p.isWarningOnly()];
  if (withRange) parts.unshift('範囲=' + p.getRange().getA1Notation());
  return parts.join('、');
}

function observeProtections_(tabName, type, withRange) {
  const sh = sheet_(tabName);
  if (!sh) return { count: 0, feature: 'タブがない', extra: '' };
  const list = sh.getProtections(type);
  return {
    count: list.length,
    feature: list
      .map(function (p) {
        return protectionInfo_(p, withRange);
      })
      .sort()
      .join(' / '),
    extra: '',
  };
}

// 編集者の行のための対象。ラベルは、特徴に出す名前
const PROTECTION_TARGETS = [
  { label: 'シート全体', tab: TAB.protectSheet, type: 'SHEET' },
  { label: '範囲', tab: TAB.protectRange, type: 'RANGE' },
  { label: '_コード', tab: '_コード', type: 'SHEET' },
];

// 対象ごとに、保護の説明の順で、fn(保護) の結果を並べる
function perProtection_(fn) {
  const parts = [];
  let total = 0;
  PROTECTION_TARGETS.forEach(function (t) {
    const sh = sheet_(t.tab);
    if (!sh) {
      parts.push(t.label + '=タブがない');
      return;
    }
    const list = sh.getProtections(SpreadsheetApp.ProtectionType[t.type]).sort(function (x, y) {
      return protectionInfo_(x, t.type === 'RANGE') < protectionInfo_(y, t.type === 'RANGE')
        ? -1
        : 1;
    });
    total += list.length;
    parts.push(
      t.label +
        '=' +
        (list
          .map(function (p) {
            return fn(p);
          })
          .join(',') || 'なし'),
    );
  });
  return { count: total, feature: parts.join(' / '), extra: '' };
}

// TODO(確認): コピー先で getEditors() が何を返すか（コピーした人だけか、元の編集者が残るか）が、この検証の結果になる
function observeEditorCounts_() {
  return perProtection_(function (p) {
    return p.getEditors().length + '人';
  });
}

function observeEditorOwnerIn_(env) {
  return perProtection_(function (p) {
    return String(includesHash_(emailsOf_(p.getEditors()), env.templateOwnerHash));
  });
}

function observeValidation_() {
  const sh = sheet_(TAB.validation);
  if (!sh) return { count: 0, feature: 'タブがない', extra: '' };
  const parts = [];
  let count = 0;
  ['B2', 'B3', 'B4', 'B5'].forEach(function (a1) {
    const dv = sh.getRange(a1).getDataValidation();
    if (!dv) {
      parts.push(a1 + '=なし');
      return;
    }
    count++;
    // TODO(確認): getCriteriaType() の文字列表記と、getCriteriaValues() の中身（リストの配列、Range、真偽）は推測
    const type = safe_(function () {
      return String(dv.getCriteriaType());
    });
    const values = safe_(function () {
      return dv.getCriteriaValues().map(valueText_).join('｜');
    });
    const invalid = safe_(function () {
      return dv.getAllowInvalid();
    });
    parts.push(a1 + '=' + type + '[' + values + ']、不正値を許す=' + invalid);
  });
  return { count: count, feature: parts.join(' / '), extra: '' };
}

function observeFormat_() {
  const sh = sheet_(TAB.format);
  if (!sh) return { count: 0, feature: 'タブがない', extra: '' };
  const rules = sh.getConditionalFormatRules();
  const parts = rules.map(function (rule) {
    const ranges = rule.getRanges().map(function (r) {
      return r.getA1Notation();
    });
    // TODO(確認): getBooleanCondition() が null を返す場合の扱いと、getCriteriaType() の表記は推測
    const cond = safe_(function () {
      const c = rule.getBooleanCondition();
      if (!c) return '条件なし（真偽の条件ではない）';
      return String(c.getCriteriaType()) + '[' + c.getCriteriaValues().join('｜') + ']';
    });
    return ranges.join('+') + ':' + cond;
  });
  return { count: rules.length, feature: parts.sort().join(' / '), extra: '' };
}

// 型定義（google-apps-script.spreadsheet.d.ts）で確かめた: EmbeddedChart に種類を返すメソッドはなく、
// modify() で得る EmbeddedChartBuilder の getChartType() で取る（modify() は build() しなければ何も変えない）
function chartType_(chart) {
  return String(chart.modify().getChartType());
}

function observeChart_() {
  const sh = sheet_(TAB.format);
  if (!sh) return { count: 0, feature: 'タブがない', extra: '' };
  const charts = sh.getCharts();
  const parts = charts.map(function (c) {
    const type = safe_(function () {
      return chartType_(c);
    });
    const ranges = safe_(function () {
      return c.getRanges().map(function (r) {
        return r.getA1Notation();
      });
    });
    return '種類=' + type + '、データの範囲=' + ranges;
  });
  return { count: charts.length, feature: parts.sort().join(' / '), extra: '' };
}

function observeImage_() {
  const sh = sheet_(TAB.admin);
  if (!sh) return { count: 0, feature: 'タブがない', extra: '' };
  const images = sh.getImages();
  const parts = images.map(function (img) {
    // TODO(確認): OverGridImage.getScript() の戻り値（割り当てがないとき null か空）は推測
    const script = safe_(function () {
      return String(img.getScript());
    });
    return '割り当て先=' + script;
  });
  return { count: images.length, feature: parts.sort().join(' / '), extra: '' };
}

function observeCodeTab_() {
  const sh = sheet_('_コード');
  if (!sh) return { count: 0, feature: 'タブがない', extra: '' };
  return { count: 1, feature: '非表示=' + sh.isSheetHidden(), extra: '' };
}

function observeCodeProtect_() {
  return observeProtections_('_コード', SpreadsheetApp.ProtectionType.SHEET, false);
}

function observeCodeContent_() {
  const sh = sheet_('_コード');
  if (!sh) return { count: 0, feature: 'タブがない', extra: '' };
  const v = sh.getRange(1, 1, 2, 1).getValues();
  if (!v[0][0]) return { count: 0, feature: '1 行目が空', extra: '' };
  return { count: 1, feature: '文字数=' + v[1][0] + '、先頭の id=' + v[0][0], extra: '' };
}

function observeTriggers_() {
  const ts = ScriptApp.getProjectTriggers();
  const parts = ts.map(function (t) {
    return t.getHandlerFunction() + ':' + t.getEventType();
  });
  return { count: ts.length, feature: parts.sort().join(' / '), extra: '' };
}

function observeMark_() {
  const text = PropertiesService.getScriptProperties().getProperty(MARK_KEY);
  if (!text) return { count: 0, feature: MARK_KEY + ' がない', extra: '' };
  const id = safe_(function () {
    return JSON.parse(text).id;
  });
  return { count: 1, feature: MARK_KEY + ' あり、印の id=' + id, extra: '' };
}

function observeSample_() {
  const v = PropertiesService.getScriptProperties().getProperty(SAMPLE_KEY);
  if (v === null || v === undefined)
    return { count: 0, feature: SAMPLE_KEY + ' がない', extra: '' };
  return {
    count: 1,
    feature: SAMPLE_KEY + ' あり、値は期待どおり=' + (v === SAMPLE_VALUE),
    extra: '',
  };
}

function observeKeys_() {
  const keys = PropertiesService.getScriptProperties().getKeys().sort();
  return { count: keys.length, feature: keys.join(','), extra: '' };
}

// 順番がそのまま検証ログの順番になる。note は詳細に出す読み方の目安
const CHECKS = [
  {
    key: 'protect.sheet',
    label: '保護 シート全体（' + TAB.protectSheet + '）',
    observe: function () {
      return observeProtections_(TAB.protectSheet, SpreadsheetApp.ProtectionType.SHEET, false);
    },
  },
  {
    key: 'protect.range',
    label: '保護 範囲（' + TAB.protectRange + '。警告のみ 1、編集者を持ち主だけ 1）',
    observe: function () {
      return observeProtections_(TAB.protectRange, SpreadsheetApp.ProtectionType.RANGE, true);
    },
  },
  {
    key: 'validation',
    label: '入力規則（' + TAB.validation + ' の B2〜B5 の 4 種類）',
    observe: observeValidation_,
  },
  { key: 'format', label: '条件付き書式（' + TAB.format + '）', observe: observeFormat_ },
  { key: 'chart', label: 'グラフ（' + TAB.format + '）', observe: observeChart_ },
  { key: 'image', label: '画像のボタン（' + TAB.admin + '）', observe: observeImage_ },
  { key: 'code.tab', label: '_コード タブ（あるか、非表示か）', observe: observeCodeTab_ },
  { key: 'code.protect', label: '_コード の保護', observe: observeCodeProtect_ },
  {
    key: 'protect.editors',
    label: '保護の編集者の人数（シート全体、範囲、_コード）',
    observe: observeEditorCounts_,
    kind: 'info',
    note: 'コピーで変わってよいので、結果は参考にする',
  },
  {
    key: 'protect.ownerin',
    label: '保護の編集者に、テンプレートの持ち主を含むか（シート全体、範囲、_コード）',
    observe: observeEditorOwnerIn_,
    kind: 'ownerin',
    note: 'コピー先では、含まない（false）のが想定。含むと、結果は「違う」になる',
  },
  {
    key: 'code.content',
    label: '_コード の中身（文字数と先頭の id）',
    observe: observeCodeContent_,
  },
  {
    key: 'triggers',
    label: 'トリガー',
    observe: observeTriggers_,
    note: 'コピー先では 0 が想定（トリガーはコピーされない）。初期設定の後は時間主導の 1 つになる',
  },
  {
    key: 'props.mark',
    label: 'スクリプトのプロパティ ' + MARK_KEY,
    observe: observeMark_,
    note: '初期設定の前に調べたときだけ、コピーされたかの判断に使う（初期設定が印を作り直すため）',
  },
  { key: 'props.sample', label: 'スクリプトのプロパティ ' + SAMPLE_KEY, observe: observeSample_ },
  { key: 'props.keys', label: 'スクリプトのプロパティの鍵の一覧', observe: observeKeys_ },
];

const FAIL_PATTERN = /取れなかった（[^）]*）/;

// 取れなかった（…）が、期待と実際の両方で同じ文字列なら、比べて判定する。片方だけなら「取れなかった」
function judge_(expected, actual) {
  const failActual = FAIL_PATTERN.exec(actual.feature);
  const failExpected = expected ? FAIL_PATTERN.exec(expected.feature) : null;
  if (failActual || failExpected) {
    // 観察が丸ごと例外で終わった（数が -1）ときは、両方で同じでも比べない
    if (expected && expected.count === -1) return failExpected ? failExpected[0] : '取れなかった';
    if (actual.count === -1) return failActual ? failActual[0] : '取れなかった';
    if (expected && actual.count === expected.count && actual.feature === expected.feature) {
      return '残った';
    }
    return (failActual || failExpected)[0];
  }
  if (!expected) return '（期待の記録なし）';
  if (actual.count === 0 && expected.count > 0) return '残らなかった';
  if (actual.count === expected.count && actual.feature === expected.feature) return '残った';
  return '違う';
}

// 結果の種類が通常と違う行（kind）のための判定
function judgeByKind_(check, expected, actual, env) {
  const fail = FAIL_PATTERN.exec(actual.feature);
  if (fail) return fail[0];
  if (check.kind === 'info') return '参考';
  if (check.kind === 'ownerin') {
    if (!env.templateOwnerHash) return '（期待の記録なし）';
    if (actual.count === 0) return '（保護がない）';
    // 特徴は「シート全体=false / 範囲=false,true / _コード=false」の形。2つ目以降の true も拾う
    const has = /(^|[=,])true(?=[, ]|$)/.test(actual.feature);
    if (env.isTemplate) return has ? '残った' : '違う';
    return has ? '違う' : '残らなかった';
  }
  return judge_(expected, actual);
}

function expectText_(check, expected, env) {
  if (!expected) return '（記録なし）';
  if (check.kind === 'info') {
    return 'コピーで変わってよい（テンプレートは ' + expected.feature + '）';
  }
  if (check.kind === 'ownerin') {
    return env.isTemplate
      ? 'テンプレート自身（含む=true）'
      : 'コピー先では含まない（false）。テンプレートは ' + expected.feature;
  }
  return '数 ' + expected.count + '、' + expected.feature;
}

// ---------------------------------------------------------------- テンプレートの内容タブ

function readContents_() {
  const sh = sheet_(TAB.contents);
  if (!sh || sh.getLastRow() < 2) return null;
  const rows = sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues();
  const out = { meta: {}, checks: {} };
  rows.forEach(function (r) {
    const key = String(r[0]);
    if (key.indexOf('meta.') === 0) out.meta[key.slice(5)] = String(r[3]);
    else out.checks[key] = { count: Number(r[2]), feature: String(r[3]) };
  });
  return out;
}

function writeContents_(ctx, env) {
  const ss = SpreadsheetApp.getActive();
  const sh = getOrCreate_(TAB.contents);
  sh.clear();
  const rows = [['キー', '項目', '期待の数', '特徴']];
  CHECKS.forEach(function (c) {
    let o;
    try {
      o = c.observe(env);
    } catch (err) {
      o = {
        count: -1,
        feature: '取れなかった（' + String((err && err.message) || err).slice(0, 80) + '）',
        extra: '',
      };
    }
    rows.push([c.key, c.label, o.count, o.feature]);
  });
  rows.push(['meta.spreadsheetId', 'テンプレートのスプレッドシートの ID', '', ss.getId()]);
  rows.push(['meta.scriptId', 'テンプレートのスクリプトの ID', '', ScriptApp.getScriptId()]);
  rows.push([
    'meta.owner',
    'テンプレートの持ち主のメールアドレスのハッシュ（SHA-256）',
    '',
    env.templateOwnerHash,
  ]);
  rows.push(['meta.builtAt', '組み立てた日時', '', ctx.now()]);
  putText_(sh, 1, 1, rows);
  return rows.length - 1;
}

// ---------------------------------------------------------------- テンプレートを組み立てる

function step_(notes, label, fn) {
  try {
    notes.push(label + ': OK（' + fn() + '）');
  } catch (err) {
    notes.push(label + ': 失敗（' + String((err && err.message) || err) + '）');
  }
}

function buildProtectSheet_() {
  const sh = getOrCreate_(TAB.protectSheet);
  removeProtections_(sh);
  sh.clear();
  putText_(sh, 1, 1, [['T1-2 シート全体の保護'], ['このタブ全体を保護している'], ['ダミー']]);
  sh.protect().setDescription('T1-2 シート全体の保護（説明つき）');
  return 'シート全体の保護 1 つ';
}

function buildProtectRange_() {
  const sh = getOrCreate_(TAB.protectRange);
  removeProtections_(sh);
  sh.clear();
  putText_(sh, 1, 1, [
    ['警告のみ', '持ち主だけ'],
    ['ダミー', 'ダミー'],
    ['ダミー', 'ダミー'],
  ]);
  sh.getRange('A2:A3').protect().setDescription('T1-2 範囲の保護（警告のみ）').setWarningOnly(true);
  const domainNote = ownerOnly_(
    sh.getRange('B2:B3').protect().setDescription('T1-2 範囲の保護（編集者は持ち主だけ）'),
  );
  return '範囲の保護 2 つ（警告のみ 1、編集者を持ち主だけ 1。' + domainNote + '）';
}

function buildValidation_() {
  const list = getOrCreate_(TAB.list);
  list.clear();
  putText_(list, 1, 1, [['候補'], ['りんご'], ['みかん'], ['ぶどう'], ['もも']]);
  const sh = getOrCreate_(TAB.validation);
  sh.clear();
  sh.clearConditionalFormatRules();
  putText_(sh, 1, 1, [
    ['B1: （見出し）'],
    ['B2: リストからの選択'],
    ['B3: 別の範囲を参照するリスト'],
    ['B4: チェックボックス'],
    ['B5: 数値の範囲（1〜100）'],
  ]);
  const make = function () {
    return SpreadsheetApp.newDataValidation();
  };
  sh.getRange('B2').setDataValidation(
    make().requireValueInList(['高', '中', '低'], true).setAllowInvalid(false).build(),
  );
  sh.getRange('B3').setDataValidation(
    make().requireValueInRange(list.getRange('A2:A5'), true).setAllowInvalid(false).build(),
  );
  sh.getRange('B4').setDataValidation(make().requireCheckbox().build());
  sh.getRange('B5').setDataValidation(
    make().requireNumberBetween(1, 100).setAllowInvalid(false).build(),
  );
  return '入力規則 4 種類（リスト、別の範囲のリスト、チェックボックス、数値の範囲）';
}

function buildFormatAndChart_() {
  const sh = getOrCreate_(TAB.format);
  sh.getCharts().forEach(function (c) {
    sh.removeChart(c);
  });
  sh.clear();
  sh.getRange('A1:C6').setValues([
    ['名前', '数', 'メモ'],
    ['豆A', 30, 'OK'],
    ['豆B', 70, 'NG'],
    ['豆C', 55, 'OK'],
    ['豆D', 10, 'NG'],
    ['豆E', 90, 'OK'],
  ]);
  sh.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule()
      .whenNumberGreaterThan(50)
      .setBackground('#f4cccc')
      .setRanges([sh.getRange('B2:B6')])
      .build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextContains('NG')
      .setBackground('#fff2cc')
      .setRanges([sh.getRange('C2:C6')])
      .build(),
  ]);
  sh.insertChart(
    sh
      .newChart()
      .setChartType(Charts.ChartType.COLUMN)
      .addRange(sh.getRange('A1:B6'))
      .setPosition(8, 1, 0, 0)
      .setOption('title', 'T1-2 縦棒グラフ（ダミー）')
      .build(),
  );
  return '条件付き書式 2 つ（数値、テキスト）と縦棒グラフ 1 つ';
}

// TODO(確認): insertImage(Blob, 列, 行) と OverGridImage.assignScript(関数名) の使い方は推測
function buildAdminButton_() {
  const sh = getOrCreate_(TAB.admin);
  sh.getImages().forEach(function (img) {
    img.remove();
  });
  sh.clear();
  putText_(sh, 1, 1, [
    ['T1-2 管理'],
    ['下の青い四角の画像が、画像のボタン（押すと「コピー先を調べる」が動く）'],
  ]);
  const blob = Utilities.newBlob(Utilities.base64Decode(BUTTON_PNG), 'image/png', 'btn.png');
  const img = sh.insertImage(blob, 1, 4);
  img.assignScript(BUTTON_HANDLER);
  return '画像 1 つを置き、' + BUTTON_HANDLER + ' を割り当てた';
}

function buildCodeTab_(ctx) {
  const ss = SpreadsheetApp.getActive();
  const existing = ss.getSheetByName(ctx.sheetCode);
  let note = '';
  if (existing) {
    const head = ctx.readCodeHeader();
    const foreign = !head || head.id.indexOf(CODE_ID_PREFIX) !== 0;
    note = foreign
      ? '注意: T1-1 の検証で作った _コード（またはこの形式でないもの）が残っていたので、保護と中身を消して作り直した。'
      : '注意: 前に作った T1-2 の _コード があったので、保護と中身を消して作り直した。';
    removeProtections_(existing);
  }
  const saved = ctx.saveCode(ctx.initialBundleText());
  ctx.writeMark({ id: saved.id });
  const protection = ensureCodeProtection_(ss.getSheetByName(ctx.sheetCode));
  return (
    note +
    '同梱の初期のコード（' +
    saved.chars +
    ' 字）を保存し、非表示にした。' +
    protection +
    '。印を作った（id ' +
    saved.id +
    '）'
  );
}

function buildTriggers_() {
  const messages = [ensureDailyTrigger_()];
  const hasEdit = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === EDIT_HANDLER;
  });
  if (hasEdit) {
    messages.push('編集トリガーはすでにある。作らなかった');
  } else {
    ScriptApp.newTrigger(EDIT_HANDLER).forSpreadsheet(SpreadsheetApp.getActive()).onEdit().create();
    messages.push('インストール型の編集トリガーを作った');
  }
  return messages.join('。');
}

function buildTemplate(ctx) {
  const notes = [];
  const owner = SpreadsheetApp.getActive().getOwner();
  const env = { templateOwnerHash: owner ? hashEmail_(owner.getEmail()) : '' };
  step_(notes, '保護（シート全体）', buildProtectSheet_);
  step_(notes, '保護（範囲）', buildProtectRange_);
  step_(notes, '入力規則', buildValidation_);
  step_(notes, '条件付き書式とグラフ', buildFormatAndChart_);
  step_(notes, '画像のボタン', buildAdminButton_);
  step_(notes, '_コード タブ', function () {
    return buildCodeTab_(ctx);
  });
  step_(notes, 'トリガー', buildTriggers_);
  step_(notes, 'スクリプトのプロパティ', function () {
    PropertiesService.getScriptProperties().setProperty(SAMPLE_KEY, SAMPLE_VALUE);
    return SAMPLE_KEY + ' を設定した（' + MARK_KEY + ' は _コード の保存で設定済み）';
  });
  step_(notes, 'テンプレートの内容タブ', function () {
    return writeContents_(ctx, env) + ' 行を書いた（作ったものを読み直して記録した）';
  });
  return notes.join('\n');
}

// ---------------------------------------------------------------- コピー先を調べる

// isList は編集者、閲覧者の一覧。持ち主は一覧に出ないので、テンプレート自身では参考にとどめる
function ownerRow_(ctx, item, tplHash, isTemplate, emails, isList) {
  let expected;
  if (isList) {
    expected = isTemplate
      ? 'テンプレート自身（持ち主は一覧に出ない。参考）'
      : 'テンプレートの持ち主は含まれない（false）';
  } else {
    expected = isTemplate
      ? 'テンプレートの持ち主として残る（true）'
      : 'コピーした人のものになり、テンプレートの持ち主ではない（false）';
  }
  if (typeof emails === 'string') return [item, expected, emails, emails, ''];
  if (!tplHash)
    return [item, expected, '（テンプレートの持ち主の記録なし）', '（期待の記録なし）', ''];
  const has = includesHash_(emails, tplHash);
  let result = has ? '残った' : '残らなかった';
  if (isList && isTemplate) result = '参考';
  return [
    item,
    expected,
    'テンプレートの持ち主を含む=' + has,
    result,
    '人数 ' +
      emails.length +
      '、メールアドレス ' +
      (emails.map(ctx.maskEmail).join('、') || '（なし）'),
  ];
}

function inspectCopy(ctx) {
  const ss = SpreadsheetApp.getActive();
  const contents = readContents_();
  const meta = contents ? contents.meta : {};
  const tplHash = String(meta.owner || '');
  const isTemplate = contents ? meta.spreadsheetId === ss.getId() : false;
  const env = { templateOwnerHash: tplHash, isTemplate: isTemplate };
  const rows = [];
  const add = function (item, expected, actual, result, detail) {
    rows.push([ctx.now(), '調べる', item, expected, actual, result, detail || '']);
  };

  rows.push([
    ctx.now(),
    'コピー先を調べる 開始',
    '',
    '',
    '',
    '開始',
    contents
      ? 'このスプレッドシートはテンプレート自身か=' +
        isTemplate +
        '（テンプレートの内容タブの ID と比べた。false ならコピー）'
      : 'テンプレートの内容タブがない。期待と比べられない（実際だけを書く）',
  ]);

  // 持ち主の確かめ（入口の守りを通ったあとの記録）
  const g = ctx.ownerCheck();
  add(
    '持ち主の確かめ（入口の守り）',
    'active、effective、持ち主が同じ',
    'active あり=' +
      g.hasActive +
      '、active と effective が同じ=' +
      g.activeIsEffective +
      '、持ち主を取れた=' +
      g.hasOwner +
      '、effective と持ち主が同じ=' +
      g.effectiveIsOwner,
    g.ok ? '残った' : '違う',
    'active ' +
      ctx.maskEmail(g.active) +
      '、effective ' +
      ctx.maskEmail(g.effective) +
      '、持ち主 ' +
      ctx.maskEmail(g.owner),
  );

  // スクリプトの複製
  const scriptId = safe_(function () {
    return ScriptApp.getScriptId();
  });
  const sameScript = meta.scriptId ? meta.scriptId === scriptId : null;
  add(
    'スクリプトが複製されている',
    isTemplate ? 'テンプレート自身' : 'コピー先のスクリプトとして、この処理が動く',
    'この処理が動いた。テンプレートのスクリプトと同じ ID か=' +
      (sameScript === null ? '（記録なし）' : sameScript),
    isTemplate || sameScript === false
      ? '残った'
      : sameScript === null
        ? '（期待の記録なし）'
        : '違う',
    'この処理がこのスプレッドシートのスクリプトで動いたこと自体が、複製の証拠になる',
  );

  // 持ち主、編集者、閲覧者
  const own = safe_(function () {
    const o = ss.getOwner();
    return o ? [lower_(o.getEmail())] : [];
  });
  const eff = lower_(
    safe_(function () {
      return Session.getEffectiveUser().getEmail();
    }),
  );
  const editors = safe_(function () {
    return emailsOf_(ss.getEditors());
  });
  const viewers = safe_(function () {
    return emailsOf_(ss.getViewers());
  });
  [
    ['スプレッドシートの持ち主（getOwner）', own, false],
    ['実行する人（getEffectiveUser）', eff.indexOf('取れなかった') === 0 ? eff : [eff], false],
    ['編集者の一覧（getEditors）', editors, true],
    ['閲覧者の一覧（getViewers）', viewers, true],
  ].forEach(function (pair) {
    const r = ownerRow_(ctx, pair[0], tplHash, isTemplate, pair[1], pair[2]);
    add(r[0], r[1], r[2], r[3], r[4]);
  });

  // 作ったものを 1 つずつ調べる
  CHECKS.forEach(function (c) {
    let actual;
    try {
      actual = c.observe(env);
    } catch (err) {
      actual = {
        count: -1,
        feature: '取れなかった（' + String((err && err.message) || err).slice(0, 80) + '）',
        extra: '',
      };
    }
    const expected = contents ? contents.checks[c.key] : null;
    const detail = [actual.extra, c.note].filter(Boolean).join('。');
    add(
      c.label,
      expectText_(c, expected, env),
      '数 ' + actual.count + '、' + actual.feature,
      judgeByKind_(c, expected, actual, env),
      detail,
    );
  });

  // onOpen の直近の経路（シンプルトリガーが残したキャッシュ）
  const open = safe_(function () {
    return CacheService.getScriptCache().get(ctx.cacheOpenKey);
  });
  add(
    'onOpen の直近の経路（スクリプトのキャッシュ）',
    'コピー先を最初に開いたときの経路が残る',
    open || '（記録なし。6 時間で消える）',
    '参考',
    '',
  );

  ctx.logRows(rows);
  const tally = {};
  rows.forEach(function (r) {
    const key = r[5].indexOf('取れなかった') === 0 ? '取れなかった' : r[5];
    tally[key] = (tally[key] || 0) + 1;
  });
  return (
    '調べた。' +
    Object.keys(tally)
      .map(function (k) {
        return k + ' ' + tally[k];
      })
      .join('、') +
    '（テンプレート自身か=' +
    isTemplate +
    '）'
  );
}

// ---------------------------------------------------------------- 初期設定、状態、メニュー

function initialize(ctx) {
  const notes = [];
  const info = ctx.info || {};
  notes.push(
    '動かしたコード: ' +
      (info.source || '') +
      (info.reason ? '（保存したコードを読めなかった理由: ' + info.reason + '）' : ''),
  );
  const mark = safe_(function () {
    return ctx.readMark();
  });
  const head = ctx.readCodeHeader();
  let state;
  if (mark && typeof mark === 'object' && head && mark.id === head.id) {
    state =
      '印があり、_コード の id と一致している。印は作り直さなかった（道: スクリプトのプロパティがコピーされ、印が一致した）';
  } else {
    // 保存済みのバンドルが T1-2 の形で読めるなら、そこから印を作り直す
    let reusable = false;
    let why = '';
    if (!head) {
      why = '_コード がない、または空';
    } else if (head.id.indexOf(CODE_ID_PREFIX) !== 0) {
      why = '_コード が T1-2 の形でない（T1-1 の検証で作ったものが残っている）';
    } else {
      try {
        const bundle = JSON.parse(ctx.readCodeText(head.id));
        reusable = bundle.app === 'ouca';
        if (!reusable) why = '_コード の中身がバンドルの形でない';
      } catch (err) {
        why = '_コード を読めない: ' + String((err && err.message) || err);
      }
    }
    if (reusable) {
      ctx.writeMark({ id: head.id });
      state =
        '印がなかった（または合わなかった）ので、保存済みのバンドルの id から印を作り直した（道: 保存済みのバンドル）';
    } else {
      const saved = ctx.saveCode(ctx.initialBundleText());
      ctx.writeMark({ id: saved.id });
      state =
        '同梱の初期のコード（' +
        saved.chars +
        ' 字）を _コード に保存し、印を作った（道: 同梱のコード。理由: ' +
        why +
        '）';
    }
  }
  notes.push(state);
  const codeSheet = sheet_(ctx.sheetCode);
  if (codeSheet) notes.push('_コード の保護: ' + ensureCodeProtection_(codeSheet));
  notes.push(ensureDailyTrigger_());
  buildMenu(ctx);
  notes.push('メニューを作り直した（再読み込みの前は、メニューが 2 つ並ぶことがある）');
  return notes.join('\n');
}

function status(ctx) {
  const props = PropertiesService.getScriptProperties();
  const lines = [];
  const mark = props.getProperty(MARK_KEY);
  lines.push('印 ' + MARK_KEY + ': ' + (mark ? mark : '（なし）'));
  lines.push('スクリプトのプロパティの鍵: ' + (props.getKeys().sort().join(', ') || '（なし）'));
  const head = ctx.readCodeHeader();
  lines.push(
    '_コード の 1 行目: ' + (head ? 'id ' + head.id + '、' + head.length + ' 字' : '（なし）'),
  );
  lines.push(
    '動かしているコード: ' +
      ((ctx.info && ctx.info.source) || '') +
      '（ラベル ' +
      CODE_LABEL +
      '）',
  );
  const triggers = ScriptApp.getProjectTriggers().map(function (t) {
    return t.getHandlerFunction() + ':' + t.getEventType();
  });
  lines.push('トリガー ' + triggers.length + ' 個: ' + (triggers.join(', ') || '（なし）'));
  const tabs = SpreadsheetApp.getActive()
    .getSheets()
    .map(function (s) {
      return s.getName() + (s.isSheetHidden() ? '（非表示）' : '');
    });
  lines.push('タブ: ' + tabs.join(', '));
  return lines.join('\n');
}

function buildMenu() {
  SpreadsheetApp.getUi()
    .createMenu('OUCA')
    .addItem('初期設定', 'menuInit')
    .addItem('テンプレートを組み立てる', 'menuBuild')
    .addItem('コピー先を調べる', 'menuInspect')
    .addItem('状態を見る', 'menuStatus')
    .addToUi();
}

// ---------------------------------------------------------------- トリガー、Web アプリ

// 動いても害のないもの。シートには書かない（編集のたびに行が増えないように）
function onDaily() {
  console.log('毎日のトリガー: コード ' + CODE_LABEL + ' が動いた');
}

function onEditTrigger() {
  console.log('編集トリガー: コード ' + CODE_LABEL + ' が動いた');
}

// 保存した HTML に、画面の隅の帯を足す。匿名でも開けるので、メールアドレスは先頭 2 文字とドメインだけ
function renderPage(ctx, html) {
  const esc = ctx.escapeHtml;
  const info = ctx.info || {};
  const who = ['getEffectiveUser', 'getActiveUser']
    .map(function (name) {
      let value;
      try {
        value = ctx.maskEmail(Session[name]().getEmail()) || '（空）';
      } catch (err) {
        value = '（取れない）';
      }
      return esc(name) + ': ' + esc(value);
    })
    .join(' / ');
  // 真偽を 2 つ出す。メールアドレスは出さない
  // TODO(確認): Web アプリ（doGet）の中で SpreadsheetApp.getActive() が使えるか。使えなければ「取れなかった（…）」と出る
  const sameOwner = safe_(function () {
    const o = SpreadsheetApp.getActive().getOwner();
    const eff = lower_(Session.getEffectiveUser().getEmail());
    return !!o && !!eff && lower_(o.getEmail()) === eff;
  });
  const sameTemplate = safe_(function () {
    const c = readContents_();
    if (!c || !c.meta.owner) return '記録なし';
    return hashEmail_(Session.getEffectiveUser().getEmail()) === c.meta.owner;
  });
  const flags =
    'effective がこのスプレッドシートの持ち主と同じ=' +
    esc(sameOwner) +
    ' / effective がテンプレートの持ち主と同じ=' +
    esc(sameTemplate);
  const band =
    '<div id="t12-band" style="position:fixed;right:0;bottom:0;z-index:99999;' +
    'background:#ffe;border:2px solid #c90;padding:6px;font:12px sans-serif">' +
    '<b>T1-2 コード ' +
    esc(CODE_LABEL) +
    '</b>（読み込み元 ' +
    esc(info.source || '') +
    '）<br>' +
    who +
    '<br>' +
    flags +
    '<br>' +
    esc(ctx.now()) +
    '</div>';
  const m = /<body[^>]*>/.exec(html);
  if (!m) return band + html;
  return html.slice(0, m.index + m[0].length) + band + html.slice(m.index + m[0].length);
}

return {
  codeLabel: CODE_LABEL,
  buildMenu: buildMenu,
  renderPage: renderPage,
  buildTemplate: buildTemplate,
  inspectCopy: inspectCopy,
  initialize: initialize,
  status: status,
  onDaily: onDaily,
  onEditTrigger: onEditTrigger,
};
