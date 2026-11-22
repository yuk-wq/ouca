// T1-2 テンプレートのコピーの検証用ローダー（小さいもの）。テスト用スクリプトにだけ送る。本体（src/）には入れない。
// このファイルは「テンプレートに紐づくスクリプト」の役をする。アプリのコード（モジュール）は、
// 非表示のタブ「_コード」に保存したバンドルにあり、実行のたびにここで読み込んで評価する。
// 一番外側の関数（外から呼べるもの）は固定の一覧:
//   onOpen、doGet、menuInit、menuBuild、menuInspect、menuStatus、runDaily、runOnEdit
//   （menuInspect は、管理タブの画像のボタンにも割り当てる。runDaily は時間主導のトリガー、runOnEdit は編集トリガー）
// 末尾が _ の関数は外から呼べない。保存したコードの関数も、入口の中で評価するので外から呼べない。
// 保存したコードは globalThis に書き込まない。トップレベルでは評価しない。

const SHEET_LOG = 'T1-2 検証ログ';
const SHEET_CODE = '_コード';
const CELL_CHUNK = 40000; // 1 つのセルに入れる文字数（上限 50000 字）
const PROP_MARK = 'T12_MARK';
const CACHE_OPEN = 'T12_OPEN'; // onOpen の経路を、ログが書けない場合に備えてキャッシュにも残す
const LOG_HEADER = ['日時', '操作', '項目', '期待', '実際', '結果', '詳細'];

let memo_ = null; // 同じ実行の中で、読み込んだコードを使い回す

// ---------------------------------------------------------------- 守り

// 持ち主が自分で動かしているかを確かめる（docs/to-be/design.md §3.3）。メールアドレスは返すが、ここでは出さない
function ownerCheck_() {
  const read = function (fn) {
    try {
      return String(fn() || '');
    } catch (err) {
      return '';
    }
  };
  const active = read(function () {
    return Session.getActiveUser().getEmail();
  });
  const effective = read(function () {
    return Session.getEffectiveUser().getEmail();
  });
  const owner = read(function () {
    const o = SpreadsheetApp.getActive().getOwner();
    return o ? o.getEmail() : '';
  });
  const hasActive = !!active;
  const hasOwner = !!owner;
  const activeIsEffective = hasActive && active === effective;
  const effectiveIsOwner = hasOwner && effective === owner;
  return {
    ok: hasActive && hasOwner && activeIsEffective && effectiveIsOwner,
    hasActive: hasActive,
    hasOwner: hasOwner,
    activeIsEffective: activeIsEffective,
    effectiveIsOwner: effectiveIsOwner,
    active: active,
    effective: effective,
    owner: owner,
  };
}

// オーナーの操作（メニュー、画像のボタン）の先頭で呼ぶ。違えば、シートに触れずに止める
function assertOwnerRun_() {
  const c = ownerCheck_();
  if (!c.ok) {
    const why =
      'active あり=' +
      c.hasActive +
      '、active と effective が同じ=' +
      c.activeIsEffective +
      '、持ち主を取れた=' +
      c.hasOwner +
      '、effective と持ち主が同じ=' +
      c.effectiveIsOwner;
    console.log('持ち主の確かめで止めた: ' + why);
    throw new Error('持ち主の確かめで止めた（' + why + '）');
  }
  return c;
}

// 本物のシートのオブジェクトを持つイベントか。編集のイベントでは、範囲も見る
function isRealSheetEvent_(e, needRange) {
  try {
    if (!e || !e.source || typeof e.source.getId !== 'function') return false;
    if (e.source.getId() !== SpreadsheetApp.getActive().getId()) return false;
    if (needRange && !(e.range && typeof e.range.getSheet === 'function')) return false;
    return true;
  } catch (err) {
    return false;
  }
}

// インストール型のトリガー: イベントの triggerUid が、このスクリプトのトリガーの ID と一致するか
// TODO(確認): 時間主導と編集のトリガーのイベントに triggerUid が入ること、getUniqueId() と同じ表記であることは、T1-1 では時間主導だけ確かめた
function isOwnTrigger_(e) {
  const uid = e && e.triggerUid ? String(e.triggerUid) : '';
  if (!uid) return false;
  return ScriptApp.getProjectTriggers().some(function (t) {
    return String(t.getUniqueId()) === uid;
  });
}

// ---------------------------------------------------------------- 入口: シンプルトリガー

function onOpen(e) {
  if (!isRealSheetEvent_(e, false)) return;
  let path;
  let detail;
  try {
    const code = loadCode_({ fresh: true });
    code.module.buildMenu(makeCtx_(code.info));
    path = '保存したコードのメニュー';
    detail = 'メニューを作った（読み込み元 ' + code.info.source + '、' + code.info.chars + ' 字）';
  } catch (err) {
    SpreadsheetApp.getUi()
      .createMenu('OUCA')
      .addItem('初期設定', 'menuInit')
      .addItem('コピー先を調べる', 'menuInspect')
      .addToUi();
    path = '最小のメニュー';
    detail = '保存したコードを読めず、最小のメニューにした: ' + String(err && err.message);
  }
  try {
    CacheService.getScriptCache().put(CACHE_OPEN, nowText_() + ' ' + path + ' ' + detail, 21600);
  } catch (err) {
    // シンプルトリガーの権限ではキャッシュも使えないことがある。メニューは出ているので続ける
  }
  try {
    log_('onOpen（シンプルトリガー）', 'OK', path + ': ' + detail);
  } catch (err) {
    // シンプルトリガーの権限ではログが書けないことがある。メニューは出ているので続ける
  }
}

// ---------------------------------------------------------------- 入口: オーナーの操作（メニュー、画像のボタン）

function menuInit() {
  assertOwnerRun_();
  runOp_('初期設定', function (code) {
    return code.module.initialize(makeCtx_(code.info));
  });
}

function menuBuild() {
  assertOwnerRun_();
  runOp_('テンプレートを組み立てる', function (code) {
    return code.module.buildTemplate(makeCtx_(code.info));
  });
}

// 管理タブの画像のボタンにも割り当てる。初期設定の前でも動く（同梱のコードで動かす）
function menuInspect() {
  assertOwnerRun_();
  runOp_('コピー先を調べる', function (code) {
    return code.module.inspectCopy(makeCtx_(code.info));
  });
}

function menuStatus() {
  assertOwnerRun_();
  runOp_('状態を見る', function (code) {
    return code.module.status(makeCtx_(code.info));
  });
}

// ---------------------------------------------------------------- 入口: トリガー

// 時間主導のトリガー。triggerUid がこのスクリプトのトリガーの ID と一致するときだけ動く
function runDaily(e) {
  if (!isOwnTrigger_(e)) {
    console.log('毎日のトリガーの確認 NG: triggerUid が一致しない');
    return;
  }
  try {
    const code = loadCode_({ allowInitial: true, fresh: true });
    code.module.onDaily(makeCtx_(code.info));
  } catch (err) {
    console.error(String(err && err.message));
  }
}

// インストール型の編集トリガー。triggerUid の一致と、本物のシートのオブジェクトかの両方を確かめる
function runOnEdit(e) {
  if (!isOwnTrigger_(e) || !isRealSheetEvent_(e, true)) {
    console.log('編集トリガーの確認 NG: triggerUid か、シートのオブジェクトが合わない');
    return;
  }
  try {
    const code = loadCode_({ allowInitial: true });
    code.module.onEditTrigger(makeCtx_(code.info));
  } catch (err) {
    console.error(String(err && err.message));
  }
}

// ---------------------------------------------------------------- 入口: Web アプリ

function doGet() {
  try {
    const code = loadCode_({ allowInitial: true });
    const html = code.module.renderPage(makeCtx_(code.info), code.html);
    return HtmlService.createHtmlOutput(html)
      .setTitle('T1-2 テンプレート')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  } catch (err) {
    // 匿名で開けるので、画面には理由を出さない（ログにも書かない。Cloud のログに残す）
    console.error(String(err && err.message));
    return HtmlService.createHtmlOutput('<p>読み込みに失敗しました。</p>');
  }
}

// ---------------------------------------------------------------- 読み込み

function makeCtx_(info) {
  return {
    info: info || null,
    sheetCode: SHEET_CODE,
    sheetLog: SHEET_LOG,
    cacheOpenKey: CACHE_OPEN,
    now: nowText_,
    maskEmail: maskEmail_,
    escapeHtml: escapeHtml_,
    ownerCheck: ownerCheck_,
    log: log_,
    logRows: logRows_,
    readMark: readMark_,
    writeMark: writeMark_,
    readCodeHeader: readCodeHeader_,
    readCodeText: readCodeText_,
    saveCode: saveCode_,
    initialBundleText: function () {
      return JSON.stringify(INITIAL_BUNDLE);
    },
  };
}

// 印が指す _コード を読んで評価する。opts.allowInitial は、読めないときに同梱のコードで動かす。opts.fresh は使い回さない
function loadCode_(opts) {
  opts = opts || {};
  if (!opts.fresh && memo_) return memo_;
  let text = null;
  let source = '';
  let reason = '';
  let id = '';
  try {
    const mark = readMark_();
    if (!mark) throw new Error('印（' + PROP_MARK + '）がない');
    text = readCodeText_(mark.id);
    source = 'シート（_コード）';
    id = mark.id;
  } catch (err) {
    reason = String(err && err.message);
  }
  if (text === null) {
    if (!opts.allowInitial) throw new Error('保存したコードを読めない: ' + reason);
    text = JSON.stringify(INITIAL_BUNDLE);
    source = '同梱';
  }
  const bundle = JSON.parse(text);
  const files = bundle.files || [];
  const serverFile = files.filter(function (f) {
    return f.type === 'SERVER_JS';
  })[0];
  const htmlFile = files.filter(function (f) {
    return f.type === 'HTML';
  })[0];
  if (!serverFile || !htmlFile) throw new Error('保存したコードに SERVER_JS か HTML がない');
  const module = new Function('ctx', serverFile.source)(makeCtx_(null));
  if (!module || typeof module.buildMenu !== 'function') throw new Error('モジュールの形が違う');
  const info = {
    source: source,
    reason: reason,
    id: id,
    version: bundle.version,
    chars: text.length,
  };
  const loaded = { module: module, html: htmlFile.source, info: info };
  memo_ = loaded;
  return loaded;
}

// ---------------------------------------------------------------- 保存先（非表示のタブ「_コード」。枠は 1 つ）
// 1 列目だけを使う。1 行目 id、2 行目 文字数、3 行目から本文を 4 万字ずつ

function readCodeHeader_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_CODE);
  if (!sh) return null;
  const v = sh.getRange(1, 1, 2, 1).getValues();
  if (!v[0][0]) return null;
  return { id: String(v[0][0]), length: Number(v[1][0]) };
}

function readCodeText_(expectedId) {
  const head = readCodeHeader_();
  if (!head) throw new Error('タブ ' + SHEET_CODE + ' がない、または空');
  if (expectedId && head.id !== expectedId) throw new Error('_コード の id が印と合わない');
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_CODE);
  const n = Math.ceil(head.length / CELL_CHUNK);
  const text = sh
    .getRange(3, 1, n, 1)
    .getValues()
    .map(function (r) {
      return String(r[0]);
    })
    .join('');
  if (text.length !== head.length) {
    throw new Error('保存した文字数が合わない（' + text.length + ' / ' + head.length + '）');
  }
  return text;
}

// タブがなければ作って非表示にし、中身を書き直す。保護はここでは触らない
function saveCode_(text) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(SHEET_CODE);
  const created = !sh;
  if (!sh) sh = ss.insertSheet(SHEET_CODE);
  const id =
    'T12@' +
    Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMddHHmmss') +
    '-' +
    Utilities.getUuid().slice(0, 4);
  const values = [[id], [String(text.length)]];
  splitText_(text, CELL_CHUNK).forEach(function (c) {
    values.push([c]);
  });
  sh.clear();
  if (sh.getMaxRows() < values.length) {
    sh.insertRowsAfter(sh.getMaxRows(), values.length - sh.getMaxRows());
  }
  sh.getRange(1, 1, values.length, 1).setNumberFormat('@').setValues(values);
  if (!sh.isSheetHidden()) sh.hideSheet();
  return { id: id, created: created, chars: text.length };
}

function splitText_(text, size) {
  const out = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out.length ? out : [''];
}

// ---------------------------------------------------------------- 印（スクリプトのプロパティ 1 つ）

function readMark_() {
  const text = PropertiesService.getScriptProperties().getProperty(PROP_MARK);
  return text ? JSON.parse(text) : null;
}

function writeMark_(mark) {
  PropertiesService.getScriptProperties().setProperty(PROP_MARK, JSON.stringify(mark));
}

// ---------------------------------------------------------------- ログ

// 初期設定の前でも動かせるように、保存したコードを読めなければ同梱のコードで動かす
function runOp_(op, fn) {
  try {
    const code = loadCode_({ allowInitial: true, fresh: true });
    const detail = fn(code);
    log_(op, 'OK', detail);
    try {
      SpreadsheetApp.getActive().toast('完了: ' + op, 'T1-2', 5);
    } catch (err) {
      // トーストが出せなくても検証には関係しない
    }
  } catch (e) {
    try {
      log_(op, 'NG', String((e && e.message) || e));
    } catch (err2) {
      // ログが書けなくても、元の例外を返す
    }
    throw e;
  }
}

function nowText_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
}

function log_(op, result, detail) {
  logRows_([[nowText_(), op, '', '', '', result, detail]]);
  console.log(op + ' ' + result + ' ' + detail);
}

// 1 行は 7 列（日時、操作、項目、期待、実際、結果、詳細）。書式を文字列にして書く（= で始まる値が数式にならないようにする）
function logRows_(rows) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(SHEET_LOG);
  const all = rows.map(function (r) {
    return r.map(function (v) {
      return String(v === undefined || v === null ? '' : v).slice(0, 5000);
    });
  });
  if (!sh) {
    sh = ss.insertSheet(SHEET_LOG);
    all.unshift(LOG_HEADER);
  }
  sh.getRange(sh.getLastRow() + 1, 1, all.length, LOG_HEADER.length)
    .setNumberFormat('@')
    .setValues(all);
}

// Web アプリは誰でも開けるので、メールアドレスは先頭 2 文字とドメインだけを出す
function maskEmail_(email) {
  const text = String(email || '');
  const at = text.indexOf('@');
  if (at < 0) return text ? '***' : '';
  return text.slice(0, Math.min(2, at)) + '***' + text.slice(at);
}

function escapeHtml_(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
