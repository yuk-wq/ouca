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
  sh.getRange('A:H').setNumberFormat('@');
  sh.getRange(1, 1, 1, 7).setValues([
    ['日時', 'シナリオ', '開き方', '事実', '値', '詳細', 'ビルドの印'],
  ]);
  sh.setFrozenRows(1);
  return sh;
}

// 行を LockService で順番にして書く。1行なら appendRow、複数行なら 1 回の setValues。
// 値を書く前に、列全体を「書式なしテキスト」にする（= で始まる値も数式にならない）
function writeRows_(rows) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sh = logSheet_();
    sh.getRange('A:G').setNumberFormat('@');
    if (rows.length === 1) {
      sh.appendRow(rows[0]);
    } else if (rows.length > 1) {
      sh.getRange(sh.getLastRow() + 1, 1, rows.length, 7).setValues(rows);
    }
  } finally {
    lock.releaseLock();
  }
}

// 1つの事実の行。値と詳細は、メールアドレスと URL を伏せてから書く
function makeRow_(scenario, origin, fact, value, detail, build) {
  return [
    now_(),
    String(scenario || ''),
    String(origin || ''),
    String(fact || ''),
    scrubText_(value).slice(0, MAX_TEXT),
    scrubText_(detail).slice(0, MAX_TEXT),
    String(build || ''),
  ];
}

function log_(scenario, origin, fact, value, detail, build) {
  writeRows_([makeRow_(scenario, origin, fact, value, detail, build)]);
}

function readRows_() {
  const sh = ss_().getSheetByName(SHEET.log);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh
    .getRange(2, 1, sh.getLastRow() - 1, 7)
    .getValues()
    .map(function (r) {
      return {
        time: String(r[0]),
        scenario: String(r[1]),
        origin: String(r[2]),
        fact: String(r[3]),
        value: String(r[4]),
        detail: String(r[5]),
        build: String(r[6]),
      };
    });
}

// 実行する人が持ち主か、シートを読めたか、書けたか。メールアドレスは返さない。
// via は画面が URL の引数から読んだ入口（exec、dev、none）。getUrl() の種類は別に出す
function execFacts_(via) {
  const out = { via: via, urlKind: 'other', effectiveIsOwner: false, read: false, wrote: false };
  try {
    out.urlKind = classifyUrl_(ScriptApp.getService().getUrl()).kind;
  } catch (err) {
    out.urlKind = 'other';
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
  log_('', '', 'mark', res.getResponseText(), '', '');
}

function menuSummarize() {
  const out = summarize_(readRows_());
  const ss = ss_();
  const sh = ss.getSheetByName(SHEET.summary) || ss.insertSheet(SHEET.summary);
  sh.clearContents();
  sh.getRange('A:G').setNumberFormat('@');
  // 先頭に、使った印と、外した行の数とその印を出す
  const rep = buildReport_(readRows_());
  const excluded = rep.excluded.map(function (x) {
    return (x.build || '(印なし)') + '=' + x.count + '行';
  });
  const table = [
    [
      '使ったビルドの印',
      rep.used || '(build の行なし。全部の行を使った)',
      '外した行',
      excluded.length > 0 ? excluded.join('、') : 'なし',
      '',
      '',
      '',
    ],
    ['シナリオ', '名前', '判定', '根拠', '設計への影響', '未確定の理由', '表'],
  ];
  Object.keys(out).forEach(function (k) {
    const r = out[k];
    const extra = {};
    Object.keys(r).forEach(function (key) {
      if (['verdict', 'evidence', 'impact', 'pending'].indexOf(key) < 0) extra[key] = r[key];
    });
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
  const page = HtmlService.createHtmlOutputFromFile('Page').getContent();
  // ビルドの印。画面が行を送るときに送り返し、まとめは最新の印の行だけを使う。
  // Page.html とサーバーのコードの版を合わせたハッシュにする
  const build = hash8_(page + SERVER_VERSION);
  const catalog = { sample: EMBED_SAMPLE, items: ['ダミー豆A', 'ダミー豆B'] };
  // ビルドの印は、メニューの JSON とは別の2か所（meta と、body の data-build）に埋める。
  // JSON が壊れても、iframe の中で meta が取り除かれても、画面は印を読める
  let html = embedCatalog_(page, BUILD_PLACEHOLDER, build);
  html = embedCatalog_(html, BUILD_PLACEHOLDER, build);
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
    // 行はまとめて1回で書く
    const rows = metaFacts.map(function (m) {
      return makeRow_('W5', '', 'meta', JSON.stringify(m), '', build);
    });
    rows.push(makeRow_('W5', '', 'favicon', JSON.stringify(favicon), '', build));
    rows.push(makeRow_('W6', '', 'exec', JSON.stringify(execFacts_('none')), 'doGet', build));
    rows.push(makeRow_('', '', 'build', build, '', build));
    writeRows_(rows);
  } catch (err) {
    // ログに書けなくても（準備の前など）、画面は返す
  }
  return out;
}

// 調べる画面が、測ったことや控えを送る。誰でも呼べるので、決めた一覧の値だけを受け付ける
function recordFact(scenario, origin, fact, value, detail, build) {
  const r = checkFact_(scenario, origin, fact, value, detail, build);
  log_(r.scenario, r.origin, r.fact, r.value, r.detail, r.build);
  return 'ok';
}

// 調べる画面から呼び、実行する人とシートの読み書きを調べる（W6）。via は画面が URL の引数から読んだ値
function probeExec(origin, via, build) {
  if (!isString_(origin) || !isString_(via) || !isString_(build)) {
    throw new Error('文字列で渡す');
  }
  if (ORIGINS.indexOf(origin) < 0) throw new Error('決めた一覧にない開き方');
  if (['exec', 'dev', 'none'].indexOf(via) < 0) throw new Error('via は exec、dev、none のどれか');
  const text = JSON.stringify(execFacts_(via));
  log_('W6', origin, 'exec', text, 'google.script.run', build.slice(0, MAX_FIELD));
  return text;
}

// 往復の時間を測るための JSON の文字列。大きさは 5、50、200（KB）だけ
function getPayload(kb) {
  if (typeof kb !== 'number' || PAYLOAD_KB.indexOf(kb) < 0) {
    throw new Error('大きさは 5、50、200 だけ');
  }
  // {"pad":""} は 10 文字
  return '{"pad":"' + new Array(kb * 1024 - 9).join('x') + '"}';
}
