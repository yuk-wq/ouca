// T1-3 検証: Web アプリ（管理用のページの検証）と、シンプルトリガー onEdit。
// onEdit は、シートの編集（シンプルトリガー）と、Web アプリの画面からの google.script.run の両方から呼ばれる。
// 本体は受け取った値の形を記録するだけで、シートの値を書き換えない。

function onEdit(e) {
  const ssId = ss_().getId();
  const real = isRealSheetEvent_(e, ssId, 'edit');
  if (real) {
    const sheetName = e.range.getSheet().getName();
    if (!isT13Sheet_(sheetName)) return;
    log_(
      'S05',
      ENTRY.simple,
      'edit',
      'onEdit',
      'シート=' +
        sheetName +
        '、セル=' +
        e.range.getA1Notation() +
        '（' +
        e.range.getNumRows() +
        '行×' +
        e.range.getNumColumns() +
        '列）、authMode=' +
        String(e.authMode),
    );
    return;
  }
  // google.script.run などから渡された値。中身の形を記録して、画面に返す
  const kind = classifyFake_(e);
  const obj = e && typeof e === 'object';
  const srcShape = obj ? shape_(e.source, 1) : '(e がオブジェクトでない)';
  const rngShape = obj ? shape_(e.range, 1) : '(e がオブジェクトでない)';
  const description = shape_(e, 3);
  log_(
    'S13',
    ENTRY.run,
    'fake',
    kind + ':' + real,
    'e の型=' +
      typeof e +
      '、e.source の型とメソッド=' +
      srcShape +
      '、e.range の型とメソッド=' +
      rngShape +
      '、形=' +
      description,
  );
  return JSON.stringify({
    real: real,
    kind: kind,
    source: srcShape,
    range: rngShape,
    shape: description,
  });
}

// ---------------------------------------------------------------- Web アプリ

// 値を <script> の中に埋めても閉じないように、記号をエスケープする
function safeJson_(obj) {
  return JSON.stringify(obj)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .split(String.fromCharCode(0x2028))
    .join('\\u2028')
    .split(String.fromCharCode(0x2029))
    .join('\\u2029');
}

function doGet(e) {
  const keys = e ? Object.keys(e).sort() : [];
  const params = e && e.parameter ? Object.keys(e.parameter) : [];
  const d = e && e.parameter && e.parameter.d ? String(e.parameter.d).slice(0, 10) : '';
  const u = classifyUrl_(
    safe_(function () {
      return ScriptApp.getService().getUrl();
    }),
  );
  // e のうち、URL の引数に由来しない値（parameter、parameters、queryString を除く）のハッシュ
  const rest = {};
  keys.forEach(function (k) {
    if (k !== 'parameter' && k !== 'parameters' && k !== 'queryString') rest[k] = e[k];
  });
  const ehash = hash8_(JSON.stringify(rest));
  const own = collectOwner_();
  log_(
    'S17',
    ENTRY.doGet,
    'doget',
    encodeDoget_({
      d: d,
      hash: u.hash8,
      ehash: ehash,
      keys: keys,
      owner: own.verdict.ok ? 'ok' : own.verdict.reason,
    }),
    'e の鍵=[' +
      keys.join(',') +
      ']、parameter の鍵=[' +
      params.join(',') +
      ']、getUrl の種類=' +
      u.kind +
      '、ID末尾4字=' +
      u.tail4 +
      '、' +
      own.summary,
  );
  const info = {
    d: d,
    keys: keys,
    parameterKeys: params,
    pathInfo: e ? shape_(e.pathInfo, 1) : '(e なし)',
    contextPath: e ? shape_(e.contextPath, 1) : '(e なし)',
    queryString: e ? shape_(e.queryString, 1) : '(e なし)',
    getUrl: u.kind + '、ID末尾4字=' + u.tail4 + '、ハッシュ=' + u.hash8,
    owner: own.verdict.ok ? '通る' : '止まる（' + own.verdict.reason + '）',
  };
  const t = HtmlService.createTemplateFromFile('Web');
  t.infoJson = safeJson_(info);
  return t
    .evaluate()
    .setTitle('T1-3 管理ページの検証')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function memoOrigin_(origin) {
  const o = String(origin === undefined ? '' : origin);
  return ORIGINS.indexOf(o) >= 0 ? o : '(未選択)';
}

// 画面から呼ぶ。出どころとデプロイの印を web.memo に書いてから、持ち主の確かめをする（止めない版）
function webOwnerCheck(origin, d) {
  log_(
    'S11',
    ENTRY.run,
    'web.memo',
    encodeMemo_({ origin: memoOrigin_(origin), d: String(d === undefined ? '' : d).slice(0, 10) }),
    '画面で選んだ値',
  );
  const v = logOwner_('S15', ENTRY.run, '');
  return JSON.stringify({ passed: v.ok, reason: v.reason });
}

// 同じ確かめを通らなければ例外で止める版。本番の入口の守りと同じ形
function webOwnerGuard(origin, d) {
  log_(
    'S11',
    ENTRY.run,
    'web.memo',
    encodeMemo_({ origin: memoOrigin_(origin), d: String(d === undefined ? '' : d).slice(0, 10) }),
    '画面で選んだ値',
  );
  const v = logOwner_('S15', ENTRY.run, '止める版');
  if (!v.ok) throw new Error('持ち主の確かめで止めた');
  return JSON.stringify({ passed: true, reason: '' });
}
