// 保存するサーバーのコード（モジュール）の元。関数の本体として評価され、オブジェクトを返す。
// ローダーが new Function('ctx', この中身)(ctx) で評価する。make-bundle.mjs が次の1行だけを書き換えて A と B を作る。
const CODE_LABEL = 'A';

return {
  codeLabel: CODE_LABEL,

  // メニューの題名はこのコードが決める。項目の関数名はローダーの固定の一覧
  buildMenu: function (ctx) {
    const menu = SpreadsheetApp.getUi().createMenu(
      'T1-1 ローダー検証（コード ' + CODE_LABEL + '）',
    );
    ctx.addFixedItems(menu);
    menu.addToUi();
  },

  // 「メニューを公開」の代わり。「T1-1 公開データ」タブに1行書く
  publishMenu: function (ctx, source) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sh = ss.getSheetByName(ctx.sheetPublish);
    if (!sh) {
      sh = ss.insertSheet(ctx.sheetPublish);
      ctx.appendTextRow(sh, ['日時', '動いたコード', '呼ばれ方', '読み込み元', '読み込み ms']);
    }
    const info = ctx.info || {};
    ctx.appendTextRow(sh, [
      ctx.nowText(),
      CODE_LABEL,
      source || '',
      info.source || '',
      info.totalMs === undefined ? '' : info.totalMs,
    ]);
    return '公開データに書いた（動いたコード ' + CODE_LABEL + '、' + source + '）';
  },

  // 画面の API（google.script.run）の代わり。JSON にできる値だけを返す
  getCatalog: function (ctx) {
    const info = ctx.info || {};
    return {
      codeLabel: CODE_LABEL,
      loadedFrom: info.source || '',
      totalMs: info.totalMs === undefined ? null : info.totalMs,
      at: ctx.nowText(),
    };
  },

  // 画面の HTML（保存した index）に、どのコードか、読み込みにかかった時間などの帯を足して返す
  renderPage: function (ctx, html) {
    const info = ctx.info || {};
    const esc = ctx.escapeHtml;
    const owner = ['getEffectiveUser', 'getActiveUser']
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
    const band =
      '<div id="t11-band" style="position:fixed;left:0;right:0;bottom:0;z-index:99999;' +
      'background:#ffe;border-top:2px solid #c90;padding:6px;font:12px sans-serif">' +
      '<b>T1-1 コード ' +
      esc(CODE_LABEL) +
      '</b>（読み込み元 ' +
      esc(info.source || '') +
      '、' +
      esc(info.totalMs) +
      ' ms、バージョン ' +
      esc(info.version || '') +
      '）<br>' +
      owner +
      '<br>' +
      '<button type="button" onclick="t11Call()">画面の API を呼ぶ</button> ' +
      '<span id="t11-result"></span></div>' +
      '<script>function t11Call(){var r=document.getElementById("t11-result");r.textContent="呼び出し中";' +
      'google.script.run.withSuccessHandler(function(v){r.textContent="返ってきたコード: "+v.codeLabel+"（"+v.loadedFrom+"、"+v.totalMs+" ms）";})' +
      '.withFailureHandler(function(e){r.textContent="失敗: "+e.message;}).getCatalogSpike();}</script>';
    const m = /<body[^>]*>/.exec(html);
    if (!m) return band + html;
    return html.slice(0, m.index + m[0].length) + band + html.slice(m.index + m[0].length);
  },

  // マニフェストにない範囲（script.send_mail）を使う操作。コード B だけが持つ
  probeOutOfScope: function () {
    if (CODE_LABEL === 'A') return 'コード A はこの確認を持たない';
    return 'MailApp.getRemainingDailyQuota() が動いた: ' + MailApp.getRemainingDailyQuota();
  },
};
