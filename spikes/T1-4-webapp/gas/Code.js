// T1-4 検証: Web アプリ（調べる画面）の配信と、ログ、まとめ。
// 判断は Logic.js の純粋な関数に任せ、ここは GAS を呼んで値を集めて渡すだけにする。
// 利用者の入力は必ず文字列にして、列の書式を書式なしテキストにしてから書く。

const SHEET = {
  log: 'T1-4 検証ログ',
  summary: 'T1-4 まとめ',
};
const PROP_SSID = 'T14_SSID';
const PAYLOAD_KB = [5, 50, 200];
const TITLE = 'T1-4 調べる画面';
const FAVICON_URL = 'https://www.gstatic.com/images/branding/product/1x/apps_script_48dp.png';
// W1 の確かめ用。置き換えとエスケープで壊れやすい文字を含める。調べる画面（page/probe.ts）も同じ値を持つ
const EMBED_SAMPLE = '$& $1 $$ </script><!--     日本語';
// addMetaTag に渡す内容（名前ごと）
const META_CONTENT = {
  viewport: 'width=device-width, initial-scale=1',
  'apple-mobile-web-app-capable': 'yes',
  'apple-mobile-web-app-title': 'T1-4',
  'apple-mobile-web-app-status-bar-style': 'default',
  'mobile-web-app-capable': 'yes',
  'theme-color': '#6f4e37',
  description: 'T1-4 の検証',
};

// ---------------------------------------------------------------- 共通

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

function now_() {
  return Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
}

function logSheet_() {
  const ss = ss_();
  let sh = ss.getSheetByName(SHEET.log);
  if (sh) return sh;
  sh = ss.insertSheet(SHEET.log);
  sh.getRange('A:G').setNumberFormat('@');
  sh.getRange(1, 1, 1, 6).setValues([['日時', 'シナリオ', '開き方', '事実', '値', '詳細']]);
  sh.setFrozenRows(1);
  return sh;
}

// 1つの事実ごとに1行。値と詳細は、メールアドレスと URL を伏せてから書く
function log_(scenario, origin, fact, value, detail) {
  const sh = logSheet_();
  const row = [
    now_(),
    String(scenario || ''),
    String(origin || ''),
    String(fact || ''),
    scrubText_(value).slice(0, 1500),
    scrubText_(detail).slice(0, 1500),
  ];
  // 値を書く前に、列全体を「書式なしテキスト」にする（= で始まる値も数式にならない）
  sh.getRange('A:G').setNumberFormat('@');
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
        origin: String(r[2]),
        fact: String(r[3]),
        value: String(r[4]),
        detail: String(r[5]),
      };
    });
}

// 実行する人が持ち主か、シートを読めたか、書けたか。メールアドレスは返さない
function execFacts_() {
  const out = { kind: 'other', effectiveIsOwner: false, read: false, wrote: false };
  try {
    out.kind = classifyUrl_(ScriptApp.getService().getUrl()).kind;
  } catch (err) {
    out.kind = 'other';
  }
  try {
    const effective = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
    const owner = String(ss_().getOwner().getEmail() || '').toLowerCase();
    out.effectiveIsOwner = effective !== '' && effective === owner;
  } catch (err) {
    out.effectiveIsOwner = false;
  }
  try {
    logSheet_().getLastRow();
    out.read = true;
  } catch (err) {
    out.read = false;
  }
  try {
    // 書けるかの確かめ。ログの列の外（H1）に書く
    logSheet_().getRange('H1').setValue(now_());
    out.wrote = true;
  } catch (err) {
    out.wrote = false;
  }
  return out;
}

function errorText_(err) {
  return maskDigits_((err && err.message) || err).slice(0, 200);
}

// ログに書けなくても、画面は返す
function tryLog_(scenario, origin, fact, value, detail) {
  try {
    log_(scenario, origin, fact, value, detail);
  } catch (err) {
    // 準備の前など。書けないことは画面の配信を止めない
  }
}

function isString_(v) {
  return typeof v === 'string';
}

// ---------------------------------------------------------------- 入口

function onOpen(e) {
  SpreadsheetApp.getUi()
    .createMenu('T1-4 検証')
    .addItem('準備（ログのタブを作り、ID を保存する）', 'menuSetup')
    .addSeparator()
    .addItem('区切りを書く', 'menuMark')
    .addItem('まとめを作る', 'menuSummarize')
    .addToUi();
}

function menuSetup() {
  const ss = ss_();
  PropertiesService.getScriptProperties().setProperty(PROP_SSID, ss.getId());
  logSheet_();
  ss.toast('準備ができた', 'T1-4', 5);
}

function menuMark() {
  const ui = SpreadsheetApp.getUi();
  const res = ui.prompt('区切りの名前（例: iPhone Safari の前）', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  log_('', '', 'mark', res.getResponseText(), '');
}

function menuSummarize() {
  const out = summarize_(readRows_());
  const ss = ss_();
  const sh = ss.getSheetByName(SHEET.summary) || ss.insertSheet(SHEET.summary);
  sh.clearContents();
  sh.getRange('A:G').setNumberFormat('@');
  const table = [['シナリオ', '名前', '判定', '根拠', '設計への影響', '未確定の理由', '表']];
  Object.keys(out).forEach(function (k) {
    const r = out[k];
    const extra = {};
    if (r.table !== undefined) extra.table = r.table;
    if (r.embedRequired !== undefined) extra.embedRequired = r.embedRequired;
    table.push([
      k,
      SCENARIOS[k] || '',
      r.verdict,
      scrubText_(r.evidence),
      r.impact,
      scrubText_(r.pending),
      Object.keys(extra).length > 0 ? scrubText_(JSON.stringify(extra)) : '',
    ]);
  });
  sh.getRange(1, 1, table.length, 7).setValues(table);
  ss.toast('「' + SHEET.summary + '」タブに書いた', 'T1-4', 5);
}

// 調べる画面を返す。Page.html は make-page.mjs が作る（Vite の出力 1 ファイル）
function doGet(e) {
  let html = HtmlService.createHtmlOutputFromFile('Page').getContent();
  const catalog = { sample: EMBED_SAMPLE, items: ['ダミー豆A', 'ダミー豆B'] };
  html = embedCatalog_(html, PLACEHOLDER, JSON.stringify(catalog));
  const out = HtmlService.createHtmlOutput(html).setTitle(TITLE);

  const metaFacts = META_NAMES.map(function (name) {
    try {
      out.addMetaTag(name, META_CONTENT[name] || 'x');
      return { name: name, ok: true, error: '' };
    } catch (err) {
      return { name: name, ok: false, error: errorText_(err) };
    }
  });
  let favicon = { ok: true, error: '' };
  try {
    out.setFaviconUrl(FAVICON_URL);
  } catch (err) {
    favicon = { ok: false, error: errorText_(err) };
  }

  try {
    metaFacts.forEach(function (m) {
      log_('W5', '', 'meta', JSON.stringify(m), '');
    });
    log_('W5', '', 'favicon', JSON.stringify(favicon), '');
    log_('W6', '', 'exec', JSON.stringify(execFacts_()), 'doGet');
  } catch (err) {
    // ログに書けなくても、画面は返す
  }
  return out;
}

// 調べる画面が、測ったことや控えを送る
function recordFact(scenario, origin, fact, value, detail) {
  const args = [scenario, origin, fact, value, detail];
  for (let i = 0; i < args.length; i++) {
    if (!isString_(args[i])) throw new Error('文字列でない値は書けない（' + (i + 1) + ' 番目）');
  }
  log_(scenario, origin, fact, value, detail);
  return 'ok';
}

// 調べる画面から呼び、実行する人とシートの読み書きを調べる（W6）
function probeExec(origin) {
  if (!isString_(origin)) throw new Error('開き方は文字列で渡す');
  const facts = execFacts_();
  const text = JSON.stringify(facts);
  log_('W6', origin, 'exec', text, 'google.script.run');
  return text;
}

// 往復の時間を測るための JSON の文字列。大きさは 5、50、200（KB）だけ
function getPayload(kb) {
  if (typeof kb !== 'number' || PAYLOAD_KB.indexOf(kb) < 0)
    throw new Error('大きさは 5、50、200 だけ');
  // {"pad":""} は 10 文字
  return '{"pad":"' + new Array(kb * 1024 - 9).join('x') + '"}';
}
