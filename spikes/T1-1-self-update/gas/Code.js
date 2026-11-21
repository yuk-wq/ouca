// T1-1 検証用のコード。テスト用スクリプトにだけ送る。本体（src/）には入れない。
// 素の JavaScript（ビルドしない）。make-bundle.mjs が、次の1行だけを書き換えてコード B を作る。
const SPIKE_CODE_LABEL = 'A';

const SHEET_LOG = 'T1-1 検証ログ';
const SHEET_PUBLISH = 'T1-1 公開データ';
const BUNDLE_URLS = {
  spike: 'https://github.com/yuk-wq/ouca/releases/download/spike-t1-1/ouca-bundle.json',
  latest: 'https://github.com/yuk-wq/ouca/releases/latest/download/ouca-bundle.json',
};
const API_BASE = 'https://script.googleapis.com/v1/projects/';
const PROP_STATE = 'T11_STATE';
const PROP_STOP = 'T11_STOP_AFTER';
const PROP_URL_KEY = 'T11_URL_KEY';
const PROP_BUNDLE_COUNT = 'T11_BUNDLE_COUNT';
const PROP_BUNDLE_PREFIX = 'T11_BUNDLE_';
const TRIGGER_HANDLER = 'publishMenuSpikeFromTrigger';
const CHUNK_SIZE = 2500;

// ---------------------------------------------------------------- 守り

// Web アプリから呼ばれたら止める（active が空、または active と effective が違う）。
// スプレッドシートの持ち主との照合は入れない。編集者の操作を検証に使うため。
// 止めたときは、ログのタブにも書かない。
function assertOwnerRun_() {
  const active = Session.getActiveUser().getEmail();
  const effective = Session.getEffectiveUser().getEmail();
  if (!active || active !== effective) {
    throw new Error('この操作はメニューからだけ動かせる（守りで止めた）');
  }
}

// ---------------------------------------------------------------- メニュー

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('T1-1 検証（コード ' + SPIKE_CODE_LABEL + '）')
    .addItem('取得を試す（固定の URL 2 つ）', 'menuFetchTest')
    .addItem('アプリを更新（段階 1〜4）', 'menuUpdate')
    .addItem('アプリを更新（段階 1〜5）', 'menuUpdateWithStage5')
    .addSeparator()
    .addSubMenu(
      ui
        .createMenu('止める設定')
        .addItem('段階 1 の後で止める', 'menuStopAfter1')
        .addItem('段階 2 の後で止める', 'menuStopAfter2')
        .addItem('段階 3 の後で止める', 'menuStopAfter3')
        .addItem('段階 4 の後で止める', 'menuStopAfter4')
        .addItem('止めない', 'menuStopNone'),
    )
    .addItem('取得先を切り替える（spike / latest）', 'menuToggleUrl')
    .addSeparator()
    .addItem('メニューの公開の代わり（押し直し）', 'menuPublish')
    .addItem('初期の Web アプリを作る（バージョンとデプロイ）', 'menuInitialDeploy')
    .addItem('前のバージョンに戻す', 'menuRollback')
    .addItem('状態を見る', 'menuStatus')
    .addItem('記録を消す', 'menuClear')
    .addToUi();
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

function menuUpdate() {
  assertOwnerRun_();
  runOp_('アプリを更新（段階 1〜4）', function () {
    return runUpdate_(false);
  });
}

function menuUpdateWithStage5() {
  assertOwnerRun_();
  runOp_('アプリを更新（段階 1〜5）', function () {
    return runUpdate_(true);
  });
}

function menuStopAfter1() {
  assertOwnerRun_();
  setStop_('1');
}
function menuStopAfter2() {
  assertOwnerRun_();
  setStop_('2');
}
function menuStopAfter3() {
  assertOwnerRun_();
  setStop_('3');
}
function menuStopAfter4() {
  assertOwnerRun_();
  setStop_('4');
}
function menuStopNone() {
  assertOwnerRun_();
  setStop_('');
}

function menuToggleUrl() {
  assertOwnerRun_();
  runOp_('取得先を切り替える', function () {
    const props = PropertiesService.getScriptProperties();
    const next = currentUrlKey_() === 'spike' ? 'latest' : 'spike';
    props.setProperty(PROP_URL_KEY, next);
    return '取得先: ' + next + ' ' + BUNDLE_URLS[next];
  });
}

function menuPublish() {
  assertOwnerRun_();
  runOp_('メニューの公開の代わり（押し直し）', function () {
    return publishMenuSpike_('メニューから押し直し');
  });
}

function menuInitialDeploy() {
  assertOwnerRun_();
  runOp_('初期の Web アプリを作る', function () {
    const sid = ScriptApp.getScriptId();
    const web = findWebDeployment_(listDeployments_());
    if (web) {
      return '既に Web アプリのデプロイがある: ' + describeDeployment_(web);
    }
    const version = api_('post', sid + '/versions', { description: 'T1-1 初期' });
    const dep = api_('post', sid + '/deployments', {
      versionNumber: version.versionNumber,
      manifestFileName: 'appsscript',
      description: 'T1-1 初期',
    });
    return (
      'バージョン ' +
      version.versionNumber +
      ' を作り、デプロイを作った: ' +
      describeDeployment_(dep)
    );
  });
}

function menuRollback() {
  assertOwnerRun_();
  runOp_('前のバージョンに戻す', function () {
    const sid = ScriptApp.getScriptId();
    const state = loadState_();
    if (!state || state.prevVersion === null || state.prevVersion === undefined) {
      throw new Error(
        '戻す先のバージョン番号の記録がない（更新の開始時に Web アプリのデプロイがなかった）',
      );
    }
    const content = api_('get', sid + '/content?versionNumber=' + state.prevVersion);
    const files = toFiles_(content.files);
    const fetchedLabel = labelOfFiles_(files);
    api_('put', sid + '/content', { files: files });
    const web = findWebDeployment_(listDeployments_());
    let deployDetail;
    if (web) {
      const dep = updateDeployment_(sid, web.deploymentId, state.prevVersion, 'T1-1 戻す');
      deployDetail = 'デプロイを更新: ' + describeDeployment_(dep);
    } else {
      const dep = api_('post', sid + '/deployments', {
        versionNumber: state.prevVersion,
        manifestFileName: 'appsscript',
        description: 'T1-1 戻す',
      });
      deployDetail = 'デプロイを新しく作った: ' + describeDeployment_(dep);
    }
    state.rolledBackAt = nowText_();
    saveState_(state);
    return (
      'バージョン ' +
      state.prevVersion +
      ' の中身を取り出せた（ファイル ' +
      files.length +
      ' 個、コード ' +
      fetchedLabel +
      '）。HEAD に戻した。' +
      deployDetail +
      '。止まった後の戻しなら、stages=' +
      JSON.stringify(Object.keys(state.stages))
    );
  });
}

function menuStatus() {
  assertOwnerRun_();
  runOp_('状態を見る', function () {
    const sid = ScriptApp.getScriptId();
    const props = PropertiesService.getScriptProperties();
    const state = loadState_();
    const lines = [];
    lines.push('実行中のコード: ' + SPIKE_CODE_LABEL);
    lines.push('取得先: ' + currentUrlKey_());
    lines.push('止める設定: ' + (props.getProperty(PROP_STOP) || '（なし）'));
    lines.push('段階の記録: ' + (state ? JSON.stringify(summarizeState_(state)) : '（なし）'));
    const head = api_('get', sid + '/content');
    lines.push('HEAD のコード: ' + labelOfFiles_(head.files));
    const deps = listDeployments_();
    lines.push(
      'デプロイ ' +
        deps.length +
        ' 件: ' +
        deps
          .map(function (d) {
            return describeDeployment_(d);
          })
          .join(' / '),
    );
    lines.push('バージョンの数: ' + countVersions_(sid));
    lines.push(
      '時間主導のトリガー: ' +
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
    props.deleteProperty(PROP_STATE);
    props.deleteProperty(PROP_STOP);
    props.deleteProperty(PROP_URL_KEY);
    clearBundle_();
    let removed = 0;
    ScriptApp.getProjectTriggers().forEach(function (t) {
      if (t.getHandlerFunction() === TRIGGER_HANDLER) {
        ScriptApp.deleteTrigger(t);
        removed++;
      }
    });
    return (
      '段階の記録、止める設定、取得先、取得したバンドルを消した。トリガー ' +
      removed +
      ' 件を消した'
    );
  });
}

// ---------------------------------------------------------------- メニューの公開の代わり

// 「T1-1 公開データ」タブに、動いたコードと日時と呼ばれ方を書く
function publishMenuSpike(source) {
  assertOwnerRun_();
  return publishMenuSpike_(source);
}

function publishMenuSpike_(source) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_PUBLISH);
  if (!sh) {
    sh = ss.insertSheet(SHEET_PUBLISH);
    appendTextRow_(sh, ['日時', '動いたコード', '呼ばれ方']);
  }
  appendTextRow_(sh, [nowText_(), SPIKE_CODE_LABEL, source || '']);
  return '公開データに書いた（動いたコード ' + SPIKE_CODE_LABEL + '、' + source + '）';
}

// 1回だけの時間主導のトリガーから呼ぶ
// 入口の守りの代わりに、イベントの triggerUid がこのスクリプトのトリガーの ID と一致するときだけ動かす
function publishMenuSpikeFromTrigger(e) {
  const uid = e && e.triggerUid ? String(e.triggerUid) : '';
  const ids = ScriptApp.getProjectTriggers().map(function (t) {
    return String(t.getUniqueId());
  });
  const matched = !!uid && ids.indexOf(uid) >= 0;
  log_(
    'メニューの公開の代わり（トリガー）の確認',
    matched ? 'OK' : 'NG',
    'triggerUid ' +
      (uid || '（なし）') +
      '、トリガーの ID ' +
      JSON.stringify(ids) +
      '、一致 ' +
      matched,
  );
  if (!matched) return;
  const detail = publishMenuSpike_('時間主導のトリガー');
  log_('メニューの公開の代わり（トリガー）', 'OK', detail);
}

// ---------------------------------------------------------------- Web アプリ

function doGet() {
  const emails = [];
  ['getEffectiveUser', 'getActiveUser'].forEach(function (name) {
    let value;
    try {
      value = maskEmail_(Session[name]().getEmail()) || '（空）';
    } catch (err) {
      value = '（取れない: ' + err.message + '）';
    }
    emails.push([name, value]);
  });
  const rows = emails
    .map(function (pair) {
      return '<li>' + escapeHtml_(pair[0]) + ': ' + escapeHtml_(pair[1]) + '</li>';
    })
    .join('');
  const html =
    '<!doctype html><meta charset="utf-8"><title>T1-1</title>' +
    '<h1>コード ' +
    escapeHtml_(SPIKE_CODE_LABEL) +
    '</h1><ul>' +
    rows +
    '</ul><p>' +
    escapeHtml_(nowText_()) +
    '</p>';
  return HtmlService.createHtmlOutput(html);
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

// ---------------------------------------------------------------- 更新（段階 1〜5）

function runUpdate_(withStage5) {
  const sid = ScriptApp.getScriptId();
  const props = PropertiesService.getScriptProperties();
  let state = loadState_();
  const notes = [];

  if (!state) {
    const web = findWebDeployment_(listDeployments_());
    state = {
      startedAt: nowText_(),
      urlKey: currentUrlKey_(),
      prevVersion: web ? web.deploymentConfig.versionNumber : null,
      deploymentId: web ? web.deploymentId : null,
      webAppUrlBefore: web ? webAppUrl_(web) : null,
      withStage5: !!withStage5,
      stages: {},
    };
    saveState_(state);
    log_(
      '更新 開始',
      'OK',
      '更新前の Web アプリのバージョン番号: ' +
        state.prevVersion +
        '、デプロイ: ' +
        state.deploymentId +
        '、URL: ' +
        state.webAppUrlBefore,
    );
  } else {
    if (withStage5) state.withStage5 = true;
    notes.push('記録があるので続きから進める（開始 ' + state.startedAt + '）');
  }

  const last = state.withStage5 ? 5 : 4;
  for (let n = 1; n <= last; n++) {
    if (state.stages[n]) {
      notes.push('段階 ' + n + ' は済み（' + state.stages[n].at + '）。飛ばす');
      continue;
    }
    const info = STAGES[n - 1](sid, state);
    state.stages[n] = { at: nowText_(), info: info };
    saveState_(state);
    log_('更新 段階 ' + n, 'OK', info);
    if (n <= 4 && props.getProperty(PROP_STOP) === String(n)) {
      props.deleteProperty(PROP_STOP);
      const err = new Error('段階 ' + n + ' の後で、設定どおりにわざと止めた');
      err.name = 'T11Stop';
      throw err;
    }
  }
  notes.push('段階 1〜' + last + ' が済んだ');
  return notes.join('。');
}

const STAGES = [
  // 段階 1: 取得と確認
  function (sid, state) {
    const result = fetchBundle_(BUNDLE_URLS[state.urlKey]);
    saveBundle_(result.bundle);
    state.bundleVersion = result.bundle.version;
    return (
      '取得 ' +
      result.code +
      '、バンドルのバージョン ' +
      result.bundle.version +
      '、ファイル ' +
      result.bundle.files
        .map(function (f) {
          return f.name + '(' + f.type + ')';
        })
        .join(', ') +
      '、コード ' +
      labelOfFiles_(result.bundle.files)
    );
  },
  // 段階 2: 中身の置き換え
  function (sid) {
    const bundle = loadBundle_();
    if (!bundle)
      throw new Error('取得したバンドルが残っていない。段階 1 からやり直す（記録を消す）');
    api_('put', sid + '/content', { files: toFiles_(bundle.files) });
    return (
      'projects.updateContent が成功（コード ' + labelOfFiles_(bundle.files) + ' に置き換えた）'
    );
  },
  // 段階 3: スクリプトのバージョン番号の作成
  function (sid, state) {
    const version = api_('post', sid + '/versions', {
      description: 'T1-1 ' + (state.bundleVersion || ''),
    });
    state.newVersion = version.versionNumber;
    return 'projects.versions.create が成功。バージョン番号 ' + version.versionNumber;
  },
  // 段階 4: デプロイの切り替え
  function (sid, state) {
    if (!state.newVersion) throw new Error('新しいバージョン番号の記録がない（段階 3 が未完了）');
    const web = findWebDeployment_(listDeployments_());
    const urlBefore = web ? webAppUrl_(web) : null;
    let mode;
    if (web) {
      updateDeployment_(
        sid,
        web.deploymentId,
        state.newVersion,
        'T1-1 ' + (state.bundleVersion || ''),
      );
      mode = 'deployments.update';
    } else {
      api_('post', sid + '/deployments', {
        versionNumber: state.newVersion,
        manifestFileName: 'appsscript',
        description: 'T1-1 ' + (state.bundleVersion || ''),
      });
      mode = 'deployments.create（Web アプリのデプロイがなかった）';
    }
    const after = findWebDeployment_(listDeployments_());
    const urlAfter = after ? webAppUrl_(after) : null;
    state.webAppUrlAfter = urlAfter;
    return (
      mode +
      '。切り替え前の URL: ' +
      urlBefore +
      '、切り替え後の URL: ' +
      urlAfter +
      '、同じ: ' +
      (urlBefore === urlAfter) +
      '、向け先のバージョン番号: ' +
      (after ? after.deploymentConfig.versionNumber : null)
    );
  },
  // 段階 5: メニューの公開のやり直し
  function () {
    const same = publishMenuSpike_('同じ実行から（段階 5）');
    ScriptApp.newTrigger(TRIGGER_HANDLER)
      .timeBased()
      .after(60 * 1000)
      .create();
    return '同じ実行から呼んだ: ' + same + '。1 分後に動く 1 回だけのトリガーを作った';
  },
];

// ---------------------------------------------------------------- 取得

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
      const bundle = JSON.parse(res.getContentText());
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
    detail += '、本文の先頭 ' + res.getContentText().slice(0, 200);
  }
  return parts.join('; ') + '; ' + detail;
}

function fetchBundle_(url) {
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  const code = res.getResponseCode();
  if (code !== 200) {
    throw new Error('取得に失敗 ' + code + ' ' + url + ' ' + res.getContentText().slice(0, 300));
  }
  const bundle = JSON.parse(res.getContentText());
  const files = bundle.files || [];
  const hasManifest = files.some(function (f) {
    return f.name === 'appsscript' && f.type === 'JSON';
  });
  const hasServer = files.some(function (f) {
    return f.type === 'SERVER_JS';
  });
  if (bundle.app !== 'ouca' || bundle.schemaVersion !== 1 || !hasManifest || !hasServer) {
    throw new Error('バンドルの形が違う（app、schemaVersion、appsscript、SERVER_JS を確かめる）');
  }
  return { code: code, bundle: bundle };
}

function hostOf_(url) {
  return String(url).replace(/^(https?:\/\/[^/?#]+).*$/, '$1');
}

// ---------------------------------------------------------------- Apps Script API

function api_(method, path, payload) {
  const options = {
    method: method,
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true,
  };
  if (payload !== undefined) {
    options.contentType = 'application/json';
    options.payload = JSON.stringify(payload);
  }
  const res = UrlFetchApp.fetch(API_BASE + path, options);
  const code = res.getResponseCode();
  const text = res.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error(
      'Apps Script API ' +
        method.toUpperCase() +
        ' ' +
        path.split('?')[0].replace(/^[^/]+/, '<scriptId>') +
        ' -> ' +
        code +
        ' ' +
        text,
    );
  }
  return text ? JSON.parse(text) : {};
}

function listDeployments_() {
  return api_('get', ScriptApp.getScriptId() + '/deployments').deployments || [];
}

// バージョン番号を持ち、Web アプリの入口があるデプロイ（@HEAD は除く）
function findWebDeployment_(deployments) {
  return (
    deployments.filter(function (d) {
      return (
        d.deploymentConfig &&
        d.deploymentConfig.versionNumber !== undefined &&
        webAppUrl_(d) !== null
      );
    })[0] || null
  );
}

function webAppUrl_(deployment) {
  const entry = (deployment.entryPoints || []).filter(function (e) {
    return e.entryPointType === 'WEB_APP';
  })[0];
  return entry && entry.webApp ? entry.webApp.url : null;
}

function updateDeployment_(sid, deploymentId, versionNumber, description) {
  return api_('put', sid + '/deployments/' + deploymentId, {
    deploymentConfig: {
      scriptId: sid,
      versionNumber: versionNumber,
      manifestFileName: 'appsscript',
      description: description,
    },
  });
}

function describeDeployment_(d) {
  const cfg = d.deploymentConfig || {};
  return (
    String(d.deploymentId).slice(0, 12) +
    '… バージョン ' +
    (cfg.versionNumber === undefined ? '@HEAD' : cfg.versionNumber) +
    ' ' +
    (webAppUrl_(d) || '（Web アプリの入口なし）')
  );
}

function countVersions_(sid) {
  let count = 0;
  let token = '';
  for (let i = 0; i < 10; i++) {
    const res = api_(
      'get',
      sid + '/versions?pageSize=50' + (token ? '&pageToken=' + encodeURIComponent(token) : ''),
    );
    count += (res.versions || []).length;
    token = res.nextPageToken;
    if (!token) break;
  }
  return count;
}

function toFiles_(files) {
  return files.map(function (f) {
    return { name: f.name, type: f.type, source: f.source };
  });
}

function labelOfFiles_(files) {
  const code = files.filter(function (f) {
    return f.type === 'SERVER_JS';
  })[0];
  const m = code && /const SPIKE_CODE_LABEL = '([^']*)'/.exec(code.source);
  return m ? m[1] : '（分からない）';
}

// ---------------------------------------------------------------- 状態、バンドルの保存

function loadState_() {
  const text = PropertiesService.getScriptProperties().getProperty(PROP_STATE);
  return text ? JSON.parse(text) : null;
}

function saveState_(state) {
  PropertiesService.getScriptProperties().setProperty(PROP_STATE, JSON.stringify(state));
}

function summarizeState_(state) {
  return {
    startedAt: state.startedAt,
    stagesDone: Object.keys(state.stages),
    prevVersion: state.prevVersion,
    newVersion: state.newVersion,
    bundleVersion: state.bundleVersion,
    webAppUrlBefore: state.webAppUrlBefore,
    webAppUrlAfter: state.webAppUrlAfter,
    withStage5: state.withStage5,
    rolledBackAt: state.rolledBackAt,
  };
}

// プロパティは 1 つの値が 9KB までなので、バンドルを分けて保存する
function saveBundle_(bundle) {
  clearBundle_();
  const text = JSON.stringify(bundle);
  const values = {};
  let count = 0;
  for (let i = 0; i < text.length; i += CHUNK_SIZE) {
    values[PROP_BUNDLE_PREFIX + count] = text.slice(i, i + CHUNK_SIZE);
    count++;
  }
  values[PROP_BUNDLE_COUNT] = String(count);
  PropertiesService.getScriptProperties().setProperties(values);
}

function loadBundle_() {
  const props = PropertiesService.getScriptProperties();
  const count = Number(props.getProperty(PROP_BUNDLE_COUNT) || 0);
  if (!count) return null;
  let text = '';
  for (let i = 0; i < count; i++) text += props.getProperty(PROP_BUNDLE_PREFIX + i) || '';
  return JSON.parse(text);
}

function clearBundle_() {
  const props = PropertiesService.getScriptProperties();
  const count = Number(props.getProperty(PROP_BUNDLE_COUNT) || 0);
  for (let i = 0; i < count; i++) props.deleteProperty(PROP_BUNDLE_PREFIX + i);
  props.deleteProperty(PROP_BUNDLE_COUNT);
}

function currentUrlKey_() {
  return PropertiesService.getScriptProperties().getProperty(PROP_URL_KEY) === 'latest'
    ? 'latest'
    : 'spike';
}

function setStop_(value) {
  runOp_('止める設定', function () {
    const props = PropertiesService.getScriptProperties();
    if (value) props.setProperty(PROP_STOP, value);
    else props.deleteProperty(PROP_STOP);
    return value ? '段階 ' + value + ' の後で止める' : '止めない';
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
    SPIKE_CODE_LABEL,
    result,
    String(detail === undefined ? '' : detail).slice(0, 5000),
  ]);
  console.log(op + ' [' + SPIKE_CODE_LABEL + '] ' + result + ' ' + detail);
}

// 書式を文字列にして書く（= で始まる値が数式にならないようにする）
function appendTextRow_(sheet, values) {
  const range = sheet.getRange(sheet.getLastRow() + 1, 1, 1, values.length);
  range.setNumberFormat('@').setValues([values.map(String)]);
}
