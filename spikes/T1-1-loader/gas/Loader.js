// T1-1 読み込み方式の検証用ローダー。テスト用スクリプトにだけ送る。本体（src/）には入れない。
// このファイルは変えない前提。「アプリを更新」で変わるのは、スプレッドシートの非表示のタブ「_コード」に
// 保存したコードと、スクリプトのプロパティの印だけ。
// 一番外側の関数（外から呼べるもの）は固定の一覧:
//   onOpen、doGet、menu*（メニュー）、getCatalogSpike（画面の API の代わり）、runCodeFromTrigger（時間主導のトリガー）
// 末尾が _ の関数は外から呼べない。保存したコードの関数も、この中で評価されるので外から呼べない。

const SHEET_LOG = 'T1-1 検証ログ';
const SHEET_PUBLISH = 'T1-1 公開データ';
const SHEET_CODE = '_コード';
const SLOT_COLUMN = { A: 1, B: 2 };
const STAGING_COLUMN = 3;
const CELL_CHUNK = 40000; // 1 つのセルに入れる文字数（上限 50000 字）
const CACHE_CHUNK = 30000; // 1 つのキャッシュの値（上限 100KB。日本語は 1 字 3 バイトまで）
const CACHE_SECONDS = 21600;
const BUNDLE_URLS = {
  spike: 'https://github.com/yuk-wq/ouca/releases/download/spike-t1-1/ouca-bundle.json',
  latest: 'https://github.com/yuk-wq/ouca/releases/latest/download/ouca-bundle.json',
};
const PROP_MARK = 'T11L_MARK';
const PROP_STATE = 'T11L_STATE';
const PROP_STOP = 'T11L_STOP_AFTER';
const PROP_URL_KEY = 'T11L_URL_KEY';
const PROP_SLOW = 'T11L_SLOW';
const TRIGGER_HANDLER = 'runCodeFromTrigger';
const SLOW_MS = 8000;

let memo_ = null; // 同じ実行の中で、読み込んだコードを使い回す
let memoLabel_ = '（未読み込み）';

// ---------------------------------------------------------------- 守り

// Web アプリ（google.script.run）から呼ばれたら止める。止めたときはログにも書かない
function assertOwnerRun_() {
  const active = Session.getActiveUser().getEmail();
  const effective = Session.getEffectiveUser().getEmail();
  if (!active || active !== effective) {
    throw new Error('この操作はメニューからだけ動かせる（守りで止めた）');
  }
}

// ---------------------------------------------------------------- 入口: シンプルトリガー

function onOpen(e) {
  // 本物のシートのオブジェクトを持つイベントだけ動かす
  if (!e || !e.source || typeof e.source.getSheets !== 'function') return;
  let detail;
  try {
    const code = loadCode_({});
    code.module.buildMenu(makeCtx_(code.info));
    detail =
      'メニューを作った（コード ' + code.module.codeLabel + '、' + describeInfo_(code.info) + '）';
  } catch (err) {
    SpreadsheetApp.getUi()
      .createMenu('T1-1 ローダー検証（未初期設定）')
      .addItem('初期設定（コード A を保存）', 'menuInit')
      .addItem('状態を見る', 'menuStatus')
      .addToUi();
    detail = '保存したコードを読めず、最小のメニューにした: ' + err.message;
  }
  try {
    log_('onOpen（シンプルトリガー）', 'OK', detail);
  } catch (err) {
    // シンプルトリガーの権限ではログが書けないことがある。メニューは出ているので続ける
  }
}

// メニューの固定の一覧。保存したコードが題名を決め、この項目を足す
function addFixedItems_(menu) {
  const ui = SpreadsheetApp.getUi();
  menu
    .addItem('初期設定（コード A を保存）', 'menuInit')
    .addItem('アプリを更新', 'menuUpdate')
    .addItem('前のバージョンに戻す', 'menuRollback')
    .addSeparator()
    .addItem('メニューの公開の代わり（押し直し）', 'menuPublish')
    .addItem('トリガーで新しいコードが動くか（1分後）', 'menuTriggerTest')
    .addItem('読み込み時間を測る', 'menuMeasure')
    .addItem('範囲の外の操作を試す', 'menuProbeScope')
    .addItem('取得を試す（固定の URL 2 つ）', 'menuFetchTest')
    .addSeparator()
    .addSubMenu(
      ui
        .createMenu('止める設定')
        .addItem('段階 1 の後で止める', 'menuStopAfter1')
        .addItem('段階 2 の後で止める', 'menuStopAfter2')
        .addItem('段階 3 の後で止める', 'menuStopAfter3')
        .addItem('段階 4 の後で止める', 'menuStopAfter4')
        .addItem('止めない', 'menuStopNone')
        .addItem('各段階に 8 秒の待ちを入れる', 'menuSlowOn')
        .addItem('待ちを入れない', 'menuSlowOff'),
    )
    .addItem('取得先を切り替える（spike / latest）', 'menuToggleUrl')
    .addItem('状態を見る', 'menuStatus')
    .addItem('記録を消す', 'menuClear');
}

// ---------------------------------------------------------------- 入口: メニュー

function menuInit() {
  assertOwnerRun_();
  runOp_('初期設定', function () {
    const text = JSON.stringify(INITIAL_BUNDLE);
    const id = writeSlot_('A', text, INITIAL_BUNDLE.version);
    writeMark_({ cur: { slot: 'A', id: id }, prev: null });
    memo_ = null;
    const code = loadCode_({ fresh: true });
    code.module.buildMenu(makeCtx_(code.info));
    return (
      '同梱のコード A を枠 A に保存し、印を A にした（' +
      text.length +
      ' 字、バージョン ' +
      INITIAL_BUNDLE.version +
      '）。' +
      describeInfo_(code.info)
    );
  });
}

function menuUpdate() {
  assertOwnerRun_();
  runOp_('アプリを更新', function () {
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(3000)) {
      return '別の更新が動いているので、何もしなかった（LockService）';
    }
    try {
      return runUpdate_();
    } finally {
      lock.releaseLock();
    }
  });
}

function menuRollback() {
  assertOwnerRun_();
  runOp_('前のバージョンに戻す', function () {
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(3000)) return '別の更新が動いているので、何もしなかった（LockService）';
    try {
      const mark = readMark_();
      if (!mark) throw new Error('初期設定がまだ');
      if (!mark.prev) {
        return (
          '戻す先の記録がない。印は枠 ' +
          mark.cur.slot +
          ' のまま（更新が段階 2 までで止まったなら、印はまだ切り替わっていないので戻す必要はない）'
        );
      }
      const head = readHeader_(SLOT_COLUMN[mark.prev.slot]);
      if (!head || head.id !== mark.prev.id) {
        return (
          '前の枠 ' +
          mark.prev.slot +
          ' は上書き済みで戻せない。印は枠 ' +
          mark.cur.slot +
          ' のまま'
        );
      }
      const from = mark.cur.slot;
      writeMark_({ cur: mark.prev, prev: null });
      PropertiesService.getScriptProperties().deleteProperty(PROP_STATE);
      memo_ = null;
      const code = loadCode_({ fresh: true });
      let menuNote;
      try {
        code.module.buildMenu(makeCtx_(code.info));
        menuNote = '戻したコードでメニューを作り直した';
      } catch (err) {
        menuNote = 'メニューの作り直しで例外: ' + err.message;
      }
      return (
        '印を枠 ' +
        from +
        ' から枠 ' +
        mark.prev.slot +
        ' に戻した（コード ' +
        code.module.codeLabel +
        '、GitHub には触れていない。段階の記録を消した）。' +
        menuNote
      );
    } finally {
      lock.releaseLock();
    }
  });
}

function menuPublish() {
  assertOwnerRun_();
  runOp_('メニューの公開の代わり（押し直し）', function () {
    const code = loadCode_({ fresh: true });
    return code.module.publishMenu(makeCtx_(code.info), 'メニューから押し直し');
  });
}

function menuTriggerTest() {
  assertOwnerRun_();
  runOp_('トリガーの作成（1分後）', function () {
    ScriptApp.newTrigger(TRIGGER_HANDLER)
      .timeBased()
      .after(60 * 1000)
      .create();
    return '1 分後に 1 回だけ、保存したコードの publishMenu を呼ぶトリガーを作った。結果は「公開データ」とログの行に出る';
  });
}

function menuMeasure() {
  assertOwnerRun_();
  runOp_('読み込み時間を測る', function () {
    const mark = readMark_();
    if (!mark) throw new Error('初期設定がまだ');
    cacheRemove_(cacheKey_(mark.cur));
    const lines = [];
    const a = loadCode_({ fresh: true });
    lines.push('1 回目（キャッシュなし、シートから）: ' + describeInfo_(a.info));
    const b = loadCode_({ fresh: true });
    lines.push('2 回目（キャッシュから）: ' + describeInfo_(b.info));
    const c = loadCode_({ fresh: true });
    lines.push('3 回目（キャッシュから）: ' + describeInfo_(c.info));
    const d = loadCode_({ fresh: true, noCache: true });
    lines.push('参考（キャッシュを使わず、シートから）: ' + describeInfo_(d.info));
    return lines.join('\n');
  });
}

function menuProbeScope() {
  assertOwnerRun_();
  const code = loadCode_({ fresh: true });
  let detail;
  try {
    detail = '動いた: ' + code.module.probeOutOfScope(makeCtx_(code.info));
  } catch (err) {
    detail = '例外になった: ' + String(err && err.message);
  }
  log_('範囲の外の操作を試す（コード ' + code.module.codeLabel + '）', 'OK', detail);
  SpreadsheetApp.getActiveSpreadsheet().toast(detail.slice(0, 120), 'T1-1', 10);
}

function menuFetchTest() {
  assertOwnerRun_();
  runOp_('取得を試す', function () {
    return Object.keys(BUNDLE_URLS)
      .map(function (key) {
        return '[' + key + '] ' + traceFetch_(BUNDLE_URLS[key]);
      })
      .join('\n');
  });
}

function menuStopAfter1() {
  assertOwnerRun_();
  setProp_('止める設定', PROP_STOP, '1', '段階 1 の後で止める');
}
function menuStopAfter2() {
  assertOwnerRun_();
  setProp_('止める設定', PROP_STOP, '2', '段階 2 の後で止める');
}
function menuStopAfter3() {
  assertOwnerRun_();
  setProp_('止める設定', PROP_STOP, '3', '段階 3 の後で止める');
}
function menuStopAfter4() {
  assertOwnerRun_();
  setProp_('止める設定', PROP_STOP, '4', '段階 4 の後で止める');
}
function menuStopNone() {
  assertOwnerRun_();
  setProp_('止める設定', PROP_STOP, '', '止めない');
}
function menuSlowOn() {
  assertOwnerRun_();
  setProp_('待ちの設定', PROP_SLOW, '1', '各段階の後に 8 秒待つ');
}
function menuSlowOff() {
  assertOwnerRun_();
  setProp_('待ちの設定', PROP_SLOW, '', '待たない');
}

function menuToggleUrl() {
  assertOwnerRun_();
  runOp_('取得先を切り替える', function () {
    const next = currentUrlKey_() === 'spike' ? 'latest' : 'spike';
    PropertiesService.getScriptProperties().setProperty(PROP_URL_KEY, next);
    return '取得先: ' + next + ' ' + BUNDLE_URLS[next];
  });
}

function menuStatus() {
  assertOwnerRun_();
  runOp_('状態を見る', function () {
    const props = PropertiesService.getScriptProperties();
    const mark = readMark_();
    const state = loadState_();
    const lines = [];
    lines.push(
      '印: ' +
        (mark
          ? '今 ' +
            mark.cur.slot +
            '（' +
            mark.cur.id +
            '）、前 ' +
            (mark.prev ? mark.prev.slot + '（' + mark.prev.id + '）' : '（なし）')
          : '（なし。初期設定がまだ）'),
    );
    Object.keys(SLOT_COLUMN).forEach(function (slot) {
      const head = readHeader_(SLOT_COLUMN[slot]);
      lines.push(
        '枠 ' + slot + ': ' + (head ? 'id ' + head.id + '、' + head.length + ' 字' : '（空）'),
      );
    });
    const staged = readHeader_(STAGING_COLUMN);
    lines.push(
      '取得済みの置き場: ' + (staged ? 'id ' + staged.id + '、' + staged.length + ' 字' : '（空）'),
    );
    lines.push('段階の記録: ' + (state ? JSON.stringify(summarizeState_(state)) : '（なし）'));
    lines.push(
      '止める設定: ' +
        (props.getProperty(PROP_STOP) || '（なし）') +
        '、待ち: ' +
        (props.getProperty(PROP_SLOW) ? 'あり' : 'なし') +
        '、取得先: ' +
        currentUrlKey_(),
    );
    if (mark) {
      lines.push(
        'キャッシュ（今の枠）: ' +
          (CacheService.getScriptCache().get(cacheKey_(mark.cur) + '_n') ? 'あり' : 'なし'),
      );
    }
    lines.push(
      '待っているトリガー: ' +
        ScriptApp.getProjectTriggers().filter(function (t) {
          return t.getHandlerFunction() === TRIGGER_HANDLER;
        }).length,
    );
    return lines.join('\n');
  });
}

function menuClear() {
  assertOwnerRun_();
  runOp_('記録を消す', function () {
    const props = PropertiesService.getScriptProperties();
    [PROP_STATE, PROP_STOP, PROP_URL_KEY, PROP_SLOW].forEach(function (k) {
      props.deleteProperty(k);
    });
    // 前の方式（spikes/T1-1-self-update）が残したプロパティも消す
    Object.keys(props.getProperties()).forEach(function (k) {
      if (k.indexOf('T11_') === 0) props.deleteProperty(k);
    });
    const mark = readMark_();
    if (mark) {
      cacheRemove_(cacheKey_(mark.cur));
      if (mark.prev) cacheRemove_(cacheKey_(mark.prev));
    }
    let removed = 0;
    ScriptApp.getProjectTriggers().forEach(function (t) {
      if (t.getHandlerFunction() === TRIGGER_HANDLER) {
        ScriptApp.deleteTrigger(t);
        removed++;
      }
    });
    return (
      '段階の記録、止める設定、待ちの設定、取得先、キャッシュを消した。トリガー ' +
      removed +
      ' 件を消した（保存したコードと印は残す）'
    );
  });
}

// ---------------------------------------------------------------- 入口: 時間主導のトリガー

// 入口の守りの代わりに、イベントの triggerUid がこのスクリプトのトリガーの ID と一致するときだけ動かす
function runCodeFromTrigger(e) {
  const uid = e && e.triggerUid ? String(e.triggerUid) : '';
  const own = ScriptApp.getProjectTriggers().filter(function (t) {
    return String(t.getUniqueId()) === uid;
  })[0];
  if (!uid || !own) {
    // 匿名の人が google.script.run で呼べるので、シートには書かない
    console.log('トリガーの確認 NG: triggerUid ' + (uid || '（なし）') + ' は一致しない');
    return;
  }
  // 1回だけのトリガーを消す（動いた後も残るため）
  ScriptApp.deleteTrigger(own);
  log_('トリガーの確認', 'OK', 'triggerUid ' + uid + '、一致 true、トリガーを消した');
  try {
    const code = loadCode_({ fresh: true });
    const detail = code.module.publishMenu(makeCtx_(code.info), '時間主導のトリガー');
    log_('トリガーで保存したコードを呼ぶ', 'OK', detail + '。' + describeInfo_(code.info));
  } catch (err) {
    log_('トリガーで保存したコードを呼ぶ', 'NG', String(err && err.message));
  }
}

// ---------------------------------------------------------------- 入口: Web アプリ、画面の API

function doGet() {
  try {
    const code = loadCode_({});
    const html = code.module.renderPage(makeCtx_(code.info), code.html);
    return HtmlService.createHtmlOutput(html)
      .setTitle('T1-1 ローダー')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  } catch (err) {
    // 匿名で開けるので、画面には理由を出さない（ログにも書かない。Cloud のログに残す）
    console.error(String(err && err.message));
    return HtmlService.createHtmlOutput('<p>読み込みに失敗しました。</p>');
  }
}

// 画面から google.script.run で呼ぶ。保存したコードの関数が返した値をそのまま返す
function getCatalogSpike() {
  const code = loadCode_({});
  return code.module.getCatalog(makeCtx_(code.info));
}

// ---------------------------------------------------------------- 読み込み

function makeCtx_(info) {
  return {
    info: info || null,
    sheetPublish: SHEET_PUBLISH,
    nowText: nowText_,
    appendTextRow: appendTextRow_,
    maskEmail: maskEmail_,
    escapeHtml: escapeHtml_,
    log: log_,
    addFixedItems: addFixedItems_,
  };
}

// 印が指す枠のコードを読み、評価する。opts.fresh は同じ実行の使い回しをしない、opts.noCache はキャッシュを使わない
function loadCode_(opts) {
  opts = opts || {};
  const mark = readMark_();
  if (!mark) throw new Error('初期設定がまだ（印がない）');
  const key = cacheKey_(mark.cur);
  if (!opts.fresh && memo_ && memo_.key === key) {
    return memo_;
  }
  const t0 = Date.now();
  let text = opts.noCache ? null : cacheGet_(key);
  let source = 'キャッシュ';
  let putMs = 0;
  if (text === null) {
    source = 'シート';
    const head = readHeader_(SLOT_COLUMN[mark.cur.slot]);
    if (!head || head.id !== mark.cur.id) {
      throw new Error('印が指す枠 ' + mark.cur.slot + ' の中身が、印の id と合わない');
    }
    text = readBody_(SLOT_COLUMN[mark.cur.slot], head.length);
  }
  const t1 = Date.now();
  if (source === 'シート' && !opts.noCache) {
    cachePut_(key, text);
    putMs = Date.now() - t1;
  }
  const t2 = Date.now();
  const bundle = JSON.parse(text);
  const t3 = Date.now();
  const files = bundle.files || [];
  const serverFile = files.filter(function (f) {
    return f.type === 'SERVER_JS';
  })[0];
  const htmlFile = files.filter(function (f) {
    return f.type === 'HTML';
  })[0];
  if (!serverFile || !htmlFile) throw new Error('保存したコードに SERVER_JS か HTML がない');
  const ctx = makeCtx_(null);
  const module = new Function('ctx', serverFile.source)(ctx);
  const t4 = Date.now();
  if (!module || typeof module.publishMenu !== 'function') throw new Error('モジュールの形が違う');
  const info = {
    slot: mark.cur.slot,
    id: mark.cur.id,
    version: bundle.version,
    source: source,
    readMs: t1 - t0,
    putMs: putMs,
    parseMs: t3 - t2,
    evalMs: t4 - t3,
    totalMs: t4 - t0,
    chars: text.length,
  };
  const loaded = { key: key, module: module, html: htmlFile.source, info: info };
  memo_ = loaded;
  memoLabel_ = String(module.codeLabel);
  return loaded;
}

function describeInfo_(i) {
  return (
    '枠 ' +
    i.slot +
    '、バージョン ' +
    i.version +
    '、' +
    i.chars +
    ' 字、読み込み元 ' +
    i.source +
    '、読み ' +
    i.readMs +
    ' ms、キャッシュへ書く ' +
    i.putMs +
    ' ms、JSON 解析 ' +
    i.parseMs +
    ' ms、評価 ' +
    i.evalMs +
    ' ms、合計 ' +
    i.totalMs +
    ' ms'
  );
}

// ---------------------------------------------------------------- 保存先（非表示のタブ「_コード」）
// 列 1 が枠 A、列 2 が枠 B、列 3 が取得済みの置き場。1 行目 id、2 行目 文字数、3 行目から本文を 4 万字ずつ

function codeSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_CODE);
  if (!sh) {
    sh = ss.insertSheet(SHEET_CODE);
    sh.hideSheet();
  }
  return sh;
}

function writeColumn_(col, id, text) {
  const sh = codeSheet_();
  const values = [[id], [String(text.length)]];
  splitText_(text, CELL_CHUNK).forEach(function (c) {
    values.push([c]);
  });
  sh.getRange(1, col, sh.getMaxRows(), 1).clearContent();
  if (sh.getMaxRows() < values.length) {
    sh.insertRowsAfter(sh.getMaxRows(), values.length - sh.getMaxRows());
  }
  sh.getRange(1, col, values.length, 1).setNumberFormat('@').setValues(values);
}

function readHeader_(col) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_CODE);
  if (!sh) return null;
  const v = sh.getRange(1, col, 2, 1).getValues();
  if (!v[0][0]) return null;
  return { id: String(v[0][0]), length: Number(v[1][0]) };
}

function readBody_(col, length) {
  const sh = codeSheet_();
  const n = Math.ceil(length / CELL_CHUNK);
  const text = sh
    .getRange(3, col, n, 1)
    .getValues()
    .map(function (r) {
      return String(r[0]);
    })
    .join('');
  if (text.length !== length)
    throw new Error('保存した文字数が合わない（' + text.length + ' / ' + length + '）');
  return text;
}

function writeSlot_(slot, text, version) {
  const id =
    String(version) +
    '@' +
    Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMddHHmmss') +
    '-' +
    Utilities.getUuid().slice(0, 4);
  writeColumn_(SLOT_COLUMN[slot], id, text);
  return id;
}

function splitText_(text, size) {
  const out = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out.length ? out : [''];
}

// ---------------------------------------------------------------- キャッシュ

function cacheKey_(ref) {
  return 'T11L_' + ref.slot + '_' + ref.id;
}

function cacheGet_(key) {
  const cache = CacheService.getScriptCache();
  const n = Number(cache.get(key + '_n') || 0);
  if (!n) return null;
  const keys = [];
  for (let i = 0; i < n; i++) keys.push(key + '_' + i);
  const got = cache.getAll(keys);
  let text = '';
  for (let i = 0; i < n; i++) {
    const part = got[key + '_' + i];
    if (part === undefined || part === null) return null;
    text += part;
  }
  return text;
}

function cachePut_(key, text) {
  const chunks = splitText_(text, CACHE_CHUNK);
  const obj = {};
  chunks.forEach(function (c, i) {
    obj[key + '_' + i] = c;
  });
  obj[key + '_n'] = String(chunks.length);
  CacheService.getScriptCache().putAll(obj, CACHE_SECONDS);
}

function cacheRemove_(key) {
  const cache = CacheService.getScriptCache();
  const n = Number(cache.get(key + '_n') || 0);
  const keys = [key + '_n'];
  for (let i = 0; i < n; i++) keys.push(key + '_' + i);
  cache.removeAll(keys);
}

// ---------------------------------------------------------------- 印（スクリプトのプロパティ 1 つ）

function readMark_() {
  const text = PropertiesService.getScriptProperties().getProperty(PROP_MARK);
  return text ? JSON.parse(text) : null;
}

function writeMark_(mark) {
  PropertiesService.getScriptProperties().setProperty(PROP_MARK, JSON.stringify(mark));
}

// ---------------------------------------------------------------- 更新（段階 1〜4）

function runUpdate_() {
  const props = PropertiesService.getScriptProperties();
  const mark = readMark_();
  if (!mark) throw new Error('初期設定がまだ');
  let state = loadState_();
  const notes = [];
  if (!state) {
    state = {
      startedAt: nowText_(),
      urlKey: currentUrlKey_(),
      targetSlot: mark.cur.slot === 'A' ? 'B' : 'A',
      fromSlot: mark.cur.slot,
      stages: {},
    };
    saveState_(state);
    log_(
      '更新 開始',
      'OK',
      '今の枠 ' + state.fromSlot + '、書き込む枠 ' + state.targetSlot + '、取得先 ' + state.urlKey,
    );
  } else {
    notes.push('記録があるので続きから進める（開始 ' + state.startedAt + '）');
  }
  for (let n = 1; n <= 4; n++) {
    if (state.stages[n]) {
      notes.push('段階 ' + n + ' は済み（' + state.stages[n].at + '）。飛ばす');
      continue;
    }
    const info = STAGES[n - 1](state);
    state.stages[n] = { at: nowText_(), info: info };
    saveState_(state);
    log_('更新 段階 ' + n, 'OK', info);
    if (props.getProperty(PROP_SLOW)) Utilities.sleep(SLOW_MS);
    if (props.getProperty(PROP_STOP) === String(n)) {
      props.deleteProperty(PROP_STOP);
      const err = new Error('段階 ' + n + ' の後で、設定どおりにわざと止めた');
      err.name = 'T11Stop';
      throw err;
    }
  }
  props.deleteProperty(PROP_STATE);
  notes.push('段階 1〜4 が済んだ。段階の記録を消した');
  return notes.join('。');
}

const STAGES = [
  // 段階 1: 取得と確認。取得済みの置き場（列 3）に置く
  function (state) {
    const res = fetchBundle_(BUNDLE_URLS[state.urlKey]);
    const id = res.bundle.version + '@staged-' + Utilities.getUuid().slice(0, 4);
    writeColumn_(STAGING_COLUMN, id, res.text);
    state.stagedId = id;
    state.bundleVersion = res.bundle.version;
    return (
      '取得 ' +
      res.code +
      '、バンドルのバージョン ' +
      res.bundle.version +
      '、' +
      res.text.length +
      ' 字、ファイル ' +
      res.bundle.files
        .map(function (f) {
          return f.name + '(' + f.type + ')';
        })
        .join(', ')
    );
  },
  // 段階 2: 使っていない枠への保存
  function (state) {
    const head = readHeader_(STAGING_COLUMN);
    if (!head || head.id !== state.stagedId)
      throw new Error('取得済みの置き場が空か別のもの。記録を消してやり直す');
    const text = readBody_(STAGING_COLUMN, head.length);
    const id = writeSlot_(state.targetSlot, text, state.bundleVersion);
    const check = readHeader_(SLOT_COLUMN[state.targetSlot]);
    readBody_(SLOT_COLUMN[state.targetSlot], check.length);
    state.targetId = id;
    return (
      '枠 ' +
      state.targetSlot +
      ' に ' +
      text.length +
      ' 字を保存し、読み直して文字数が合うことを確かめた（id ' +
      id +
      '）'
    );
  },
  // 段階 3: 印の切り替え。切り替える前の枠を「前のコード」として記録する
  function (state) {
    const mark = readMark_();
    if (mark.cur.id === state.targetId)
      return '印は既に枠 ' + state.targetSlot + ' になっている。飛ばした';
    writeMark_({ cur: { slot: state.targetSlot, id: state.targetId }, prev: mark.cur });
    memo_ = null;
    return (
      '印を枠 ' +
      mark.cur.slot +
      ' から枠 ' +
      state.targetSlot +
      ' に切り替えた（前のコード: 枠 ' +
      mark.cur.slot +
      '）'
    );
  },
  // 段階 4: 新しいコードでメニューの公開のやり直し。同じ実行の中で、読み込み直してから呼ぶ
  function () {
    const code = loadCode_({ fresh: true });
    const pub = code.module.publishMenu(makeCtx_(code.info), '同じ実行から（段階 4）');
    let menuNote;
    try {
      code.module.buildMenu(makeCtx_(code.info));
      menuNote = '新しいコードでメニューを作り直した';
    } catch (err) {
      menuNote = 'メニューの作り直しで例外: ' + err.message;
    }
    return '読み込み直したコードは ' + code.module.codeLabel + '。' + pub + '。' + menuNote;
  },
];

// ---------------------------------------------------------------- 取得

function fetchBundle_(url) {
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  const code = res.getResponseCode();
  if (code !== 200) {
    throw new Error(
      '取得に失敗 ' + code + ' ' + url + ' ' + res.getContentText('UTF-8').slice(0, 300),
    );
  }
  const text = res.getContentText('UTF-8');
  const bundle = JSON.parse(text);
  const files = bundle.files || [];
  const has = function (type) {
    return files.some(function (f) {
      return f.type === type;
    });
  };
  if (bundle.app !== 'ouca' || bundle.schemaVersion !== 1 || !has('SERVER_JS') || !has('HTML')) {
    throw new Error('バンドルの形が違う（app、schemaVersion、SERVER_JS、HTML を確かめる）');
  }
  return { code: code, text: text, bundle: bundle };
}

function traceFetch_(url) {
  const parts = [];
  let current = url;
  for (let hop = 0; hop < 6; hop++) {
    const res = UrlFetchApp.fetch(current, { followRedirects: false, muteHttpExceptions: true });
    const code = res.getResponseCode();
    const headers = res.getHeaders();
    const location = headers.Location || headers.location || null;
    parts.push(
      '手動 ' +
        (hop + 1) +
        ' 回目 ' +
        hostOf_(current) +
        ' -> ' +
        code +
        (location ? ' Location ' + hostOf_(location) : ''),
    );
    if (!location || code < 300 || code >= 400) break;
    current = location;
  }
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  const code = res.getResponseCode();
  let detail = '既定（followRedirects 既定）の最終コード ' + code;
  if (code === 200) {
    try {
      const bundle = JSON.parse(res.getContentText('UTF-8'));
      detail +=
        '、JSON として読めた、バージョン ' +
        bundle.version +
        '、files ' +
        (bundle.files || []).length +
        ' 個';
    } catch (err) {
      detail += '、JSON として読めない: ' + err.message;
    }
  } else {
    detail += '、本文の先頭 ' + res.getContentText('UTF-8').slice(0, 200);
  }
  return parts.join('; ') + '; ' + detail;
}

function hostOf_(url) {
  return String(url).replace(/^(https?:\/\/[^/?#]+).*$/, '$1');
}

// ---------------------------------------------------------------- 状態

function loadState_() {
  const text = PropertiesService.getScriptProperties().getProperty(PROP_STATE);
  return text ? JSON.parse(text) : null;
}

function saveState_(state) {
  PropertiesService.getScriptProperties().setProperty(PROP_STATE, JSON.stringify(state));
}

function summarizeState_(s) {
  return {
    startedAt: s.startedAt,
    stagesDone: Object.keys(s.stages),
    fromSlot: s.fromSlot,
    targetSlot: s.targetSlot,
    bundleVersion: s.bundleVersion,
  };
}

function currentUrlKey_() {
  return PropertiesService.getScriptProperties().getProperty(PROP_URL_KEY) === 'latest'
    ? 'latest'
    : 'spike';
}

function setProp_(op, key, value, message) {
  runOp_(op, function () {
    const props = PropertiesService.getScriptProperties();
    if (value) props.setProperty(key, value);
    else props.deleteProperty(key);
    return message;
  });
}

// ---------------------------------------------------------------- ログ

function runOp_(op, fn) {
  try {
    const detail = fn();
    log_(op, 'OK', detail);
    try {
      SpreadsheetApp.getActiveSpreadsheet().toast('完了: ' + op, 'T1-1', 5);
    } catch (err) {
      // トーストが出せなくても検証には関係しない
    }
  } catch (e) {
    const stopped = e && e.name === 'T11Stop';
    log_(op, stopped ? '停止（意図）' : 'NG', String((e && e.message) || e));
    throw e;
  }
}

function nowText_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
}

function log_(op, result, detail) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_LOG);
  if (!sh) {
    sh = ss.insertSheet(SHEET_LOG);
    appendTextRow_(sh, ['日時', '操作', 'コード', '結果', '詳細']);
  }
  appendTextRow_(sh, [
    nowText_(),
    op,
    memoLabel_,
    result,
    String(detail === undefined ? '' : detail).slice(0, 5000),
  ]);
  console.log(op + ' [' + memoLabel_ + '] ' + result + ' ' + detail);
}

// 書式を文字列にして書く（= で始まる値が数式にならないようにする）
function appendTextRow_(sheet, values) {
  const range = sheet.getRange(sheet.getLastRow() + 1, 1, 1, values.length);
  range.setNumberFormat('@').setValues([values.map(String)]);
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
