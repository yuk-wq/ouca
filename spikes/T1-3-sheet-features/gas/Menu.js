// T1-3 検証: メニュー（シンプルトリガー onOpen と、メニューの項目）。
// 末尾が _ の関数（menuUnderscore_）をメニューに割り当てて、押して動くかを確かめる。

function onOpen(e) {
  SpreadsheetApp.getUi()
    .createMenu('T1-3 検証')
    .addItem('準備（タブとダミーデータを作る）', 'menuSetup')
    .addSeparator()
    .addItem('複数選択: Apps Script で設定を試す', 'menuMultiSelect')
    .addItem('複数選択: 手で設定した後の入力規則を調べる', 'menuMultiInspect')
    .addItem('候補を足す（項目タブに1行）', 'menuAddOption')
    .addItem('セルに画像を入れる（SVG と PNG）', 'menuIcons')
    .addSeparator()
    .addItem('画像のボタンを置く（管理タブ）', 'menuPlaceButtons')
    .addItem('メニュー: 末尾が _ の関数', 'menuUnderscore_')
    .addItem('メニュー: 末尾が _ でない関数', 'menuPlain')
    .addItem('持ち主の確かめ（メニュー）', 'menuOwnerCheck')
    .addSeparator()
    .addItem('トリガーを作る（編集、変更、1分後）', 'menuCreateTriggers')
    .addItem('トリガーを調べる', 'menuListTriggers')
    .addItem('トリガーを消す', 'menuDeleteTriggers')
    .addSeparator()
    .addItem('区切りを書く', 'menuMark')
    .addItem('控えを書く', 'menuNote')
    .addItem('まとめを作る', 'menuSummarize')
    .addItem('Web アプリの URL を調べる（伏せて記録）', 'menuWebInfo')
    .addToUi();
  // シンプルトリガーとして動いたことを残す（承認の前でも動く）
  try {
    log_('', ENTRY.simple, 'called', 'onOpen', 'メニューを作った');
  } catch (err) {
    // ログに書けなくても、メニューは出す
  }
}

// ---------------------------------------------------------------- 準備

function menuSetup() {
  const ss = ss_();
  PropertiesService.getScriptProperties().setProperty(PROP_SSID, ss.getId());
  logSheet_();

  // 豆の表: 見出しと5行のダミー。D 列が複数選択のプルダウンの対象。G 列は貼り付けの元
  const beans = sheet_(SHEET.beans);
  beans.getRange('A1:G7').clearContent().clearDataValidations();
  beans.getRange('D2:D6').clearDataValidations();
  beans.getRange('A1:E6').setValues([
    ['名前', '産地', '焙煎度', '味わい', 'メモ'],
    ['ダミー豆A', 'ダミー国1', 3, '', ''],
    ['ダミー豆B', 'ダミー国2', 5, '', ''],
    ['ダミー豆C', 'ダミー国3', 2, '', ''],
    ['ダミー豆D', 'ダミー国4', 6, '', ''],
    ['ダミー豆E', 'ダミー国5', 4, '', ''],
  ]);
  beans
    .getRange('G1:G4')
    .setValues([['貼り付けの元'], ['ペースト1'], ['ペースト2'], ['ペースト3']]);
  beans.getRange('A1:G1').setFontWeight('bold');
  beans.setColumnWidth(4, 220);

  // 項目: 候補を足す元
  const items = sheet_(SHEET.items);
  items.getRange('A1:B50').clearContent();
  items.getRange('A1:A2').setValues([['項目名（候補の元）'], ['チョコレート']]);
  items.getRange('B1').setValue('ここに足した項目名が、_リスト を通ってプルダウンに出る');
  items.getRange('A1').setFontWeight('bold');
  items.setColumnWidth(1, 220);

  // _リスト: 組み込みの候補 + 項目タブの項目名（VSTACK）。空のセルは TOCOL で除く
  const list = sheet_(SHEET.list);
  list.getRange('A1:A200').clearContent();
  list.getRange('A1').setFormula('=VSTACK("果実","ナッツ",TOCOL(\'' + SHEET.items + "'!A2:A,1))");
  list.setColumnWidth(1, 220);

  // 管理: ボタンの見出しとチェックボックス
  const admin = sheet_(SHEET.admin);
  admin.getRange('A1:F8').clearContent();
  admin.getRange('A1').setValue('T1-3 管理タブ（画像のボタンとチェックボックスの検証）');
  admin.getRange('A2:C2').setValues([['_なしの関数', '_ありの関数', '持ち主の確かめ']]);
  admin
    .getRange('A5:D5')
    .setValues([
      ['項目', 'チェック', '結果（_なしの編集トリガー）', '結果（_ありの編集トリガー）'],
    ]);
  admin.getRange('A6').setValue('メニューを公開（スマホ用チェックボックス）');
  admin.getRange('B6').insertCheckboxes();
  admin.getRange('B6').setValue(false);
  admin.getRange('A1:D5').setFontWeight('bold');
  admin.setColumnWidths(1, 4, 230);
  admin.setRowHeight(3, 44);

  const icons = sheet_(SHEET.icons);
  icons.getRange('A1:B1').setValues([['画像', '種類']]);
  icons.getRange('A1:B1').setFontWeight('bold');

  log_(
    '',
    ENTRY.menu,
    'setup',
    'menuSetup',
    '5つのタブ（豆の表、項目、_リスト、管理、アイコン）とダミーデータを作った',
  );
  ss.toast('準備ができた', 'T1-3', 5);
}

// ---------------------------------------------------------------- S01 複数選択のプルダウン

function methodNames_(obj) {
  const names = {};
  try {
    for (const k in obj) names[k] = 1;
  } catch (err) {
    // 列挙できなければ次へ
  }
  try {
    let p = Object.getPrototypeOf(obj);
    while (p && p !== Object.prototype) {
      Object.getOwnPropertyNames(p).forEach(function (k) {
        names[k] = 1;
      });
      p = Object.getPrototypeOf(p);
    }
  } catch (err) {
    // 同上
  }
  return Object.keys(names);
}

function menuMultiSelect() {
  const ss = ss_();
  const beans = ss.getSheetByName(SHEET.beans);
  const list = ss.getSheetByName(SHEET.list);
  if (!beans || !list) throw new Error('先に「準備」を押す');

  const builder = SpreadsheetApp.newDataValidation()
    .requireValueInRange(list.getRange('A1:A200'), true)
    .setAllowInvalid(false);
  const names = methodNames_(builder);
  const hits = names.filter(function (n) {
    return /multi|multiple|chip|many|select/i.test(n);
  });
  const criteria = safe_(function () {
    return Object.keys(SpreadsheetApp.DataValidationCriteria).join(',');
  });
  log_(
    'S01',
    ENTRY.menu,
    'ms.methods',
    String(names.length),
    (names.length === 0 ? '列挙できなかった（メソッド名が 0 個）。' : '') +
      '複数選択に関係しそうな名前=[' +
      hits.join(',') +
      ']。全名=' +
      names.join(',') +
      '。DataValidationCriteria=' +
      criteria,
  );

  // 関係しそうな名前があれば、true を渡して呼んでみる（例外は詳細に残す）
  const called = [];
  const failed = [];
  hits.forEach(function (n) {
    if (typeof builder[n] !== 'function') return;
    try {
      builder[n](true);
      called.push(n);
    } catch (err) {
      failed.push(n + ': ' + maskDigits_((err && err.message) || err).slice(0, 80));
    }
  });
  log_(
    'S01',
    ENTRY.menu,
    'ms.builder',
    called.length > 0 ? 'called' : 'none',
    '呼べた=[' + called.join(',') + ']、例外=[' + failed.join(' / ') + ']',
  );

  // 1つ選ぶ形のプルダウンを D2 だけに付ける。D3:D6 は入力規則なしにして、コピーの確かめに使う
  beans.getRange('D3:D6').clearDataValidations();
  beans.getRange('D2').setDataValidation(builder.build());
  const st = readValidationState_(SHEET.beans, 'D2');
  log_(
    'S01',
    ENTRY.menu,
    'ms.d2.set',
    validationValue_(st),
    st.message ||
      'D2 だけにプルダウンを設定した。ここで複数選べるか試し、メニュー「控えを書く」の1番に書く',
  );
  ss.toast('D2 にプルダウンを設定した。複数選べるか試す', 'T1-3', 5);
}

function menuMultiInspect() {
  const ss = ss_();
  const beans = ss.getSheetByName(SHEET.beans);
  if (!beans) throw new Error('先に「準備」を押す');
  const d2 = beans.getRange('D2');
  const dv = d2.getDataValidation();
  const st2 = readValidationState_(SHEET.beans, 'D2');
  const criteria = dv
    ? safe_(function () {
        return String(dv.getCriteriaType());
      })
    : 'getDataValidation が null';
  log_(
    'S01',
    ENTRY.menu,
    'ms.d2.manual',
    validationValue_(st2),
    'getCriteriaType=' + criteria + (st2.message ? '、' + st2.message : ''),
  );
  if (!dv) {
    log_('S01', ENTRY.menu, 'ms.d5', 'skipped', 'D2 に入力規則がないので、D5 には書かなかった');
    ss.toast('D2 の入力規則を Apps Script から読めない。ログを見る', 'T1-3', 8);
    return;
  }

  // 手でオンにする前（ms.d2.set）と後の D2 の JSON の差
  const setRow = readRows_().filter(function (r) {
    return r.fact === 'ms.d2.set';
  });
  if (setRow.length > 0 && st2.state === 'rule') {
    let setRule = null;
    try {
      setRule = JSON.parse(setRow[setRow.length - 1].value);
    } catch (err) {
      setRule = null;
    }
    if (setRule) {
      log_(
        'S01',
        ENTRY.menu,
        'ms.diff',
        diffPaths_(setRule, st2.rule).join(','),
        '値が空なら、JSON に違いがない',
      );
    }
  }

  // 高度なサービスで、手でオンにした D2 の JSON をそのまま D4 に書く
  let d4 = 'error';
  let d4detail = '';
  if (st2.state === 'rule') {
    try {
      beans.getRange('D4').clearDataValidations();
      Sheets.Spreadsheets.batchUpdate(
        {
          requests: [
            {
              setDataValidation: {
                range: {
                  sheetId: beans.getSheetId(),
                  startRowIndex: 3,
                  endRowIndex: 4,
                  startColumnIndex: 3,
                  endColumnIndex: 4,
                },
                rule: st2.rule,
              },
            },
          ],
        },
        ss.getId(),
      );
      const st4 = readValidationState_(SHEET.beans, 'D4');
      d4 = validationValue_(st4) === validationValue_(st2) ? 'same' : 'different';
      d4detail = 'D4 の JSON=' + validationValue_(st4);
    } catch (err) {
      d4detail = maskDigits_((err && err.message) || err).slice(0, 200);
    }
  } else {
    d4detail = 'D2 の JSON を読めなかった（' + st2.state + '）';
  }
  log_(
    'S01',
    ENTRY.menu,
    'ms.d4',
    d4,
    d4detail + '。D4 で複数選べるか試し、メニュー「控えを書く」の3番に書く',
  );

  // D2 の入力規則を D3 へコピーして、前後の D3 を読む
  const before = readValidationState_(SHEET.beans, 'D3');
  log_('S01', ENTRY.menu, 'ms.d3.before', validationValue_(before), 'コピーの前の D3');
  const copy = safe_(function () {
    d2.copyTo(beans.getRange('D3'), SpreadsheetApp.CopyPasteType.PASTE_DATA_VALIDATION, false);
    return 'コピーした';
  });
  const after = readValidationState_(SHEET.beans, 'D3');
  log_(
    'S01',
    ENTRY.menu,
    'ms.d3.after',
    validationValue_(after),
    copy + '。D3 で複数選べるか試し、メニュー「控えを書く」の4番に書く',
  );
  // 手でオンにした D2 の入力規則を、作り直して D5 に設定する（「メニューを公開」が作り直しても残るかを見る）
  let d5detail = '';
  try {
    beans.getRange('D5').setDataValidation(dv.copy().build());
    d5detail = 'getDataValidation().copy().build() で設定した。D5 で複数選べるか試す';
  } catch (err) {
    d5detail = '設定できなかった（' + maskDigits_((err && err.message) || err).slice(0, 200) + '）';
  }
  const st5 = readValidationState_(SHEET.beans, 'D5');
  log_('S01', ENTRY.menu, 'ms.d5', validationValue_(st5), d5detail);
  ss.toast('D4、D3、D5 の確かめを試した。それぞれで複数選べるか試す', 'T1-3', 8);
}

// ---------------------------------------------------------------- S04 候補を足す

function menuAddOption() {
  const ss = ss_();
  const items = ss.getSheetByName(SHEET.items);
  const list = ss.getSheetByName(SHEET.list);
  const beans = ss.getSheetByName(SHEET.beans);
  if (!items || !list || !beans) throw new Error('先に「準備」を押す');
  const name = '追加' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'HHmmss');
  items.getRange(Math.max(items.getLastRow(), 1) + 1, 1).setValue(name);
  SpreadsheetApp.flush();

  const values = list
    .getRange('A1:A200')
    .getValues()
    .map(function (r) {
      return String(r[0]);
    });
  const idx = values.indexOf(name);
  const dv = beans.getRange('D2').getDataValidation();
  let a1 = '(D2 に入力規則がない)';
  if (dv) {
    a1 = safe_(function () {
      return dv.getCriteriaValues()[0].getA1Notation();
    });
  }
  const inRange = idx >= 0 && rangeCovers_(a1, idx + 1);
  log_('S04', ENTRY.menu, 'list.added', name, '項目タブに足した');
  log_(
    'S04',
    ENTRY.menu,
    'list.inList',
    String(idx >= 0),
    '_リストの値は ' + values.filter(Boolean).length + ' 個。プルダウンを開いて目でも確かめる',
  );
  log_('S04', ENTRY.menu, 'list.inRange', String(inRange), 'D2 のプルダウンが参照する範囲=' + a1);
  ss.toast('候補「' + name + '」を足した。D2 のプルダウンを開いて確かめる', 'T1-3', 8);
}

// ---------------------------------------------------------------- S06 セルの画像

function menuIcons() {
  const icons = sheet_(SHEET.icons);
  const attempts = [
    { kind: 'SVG(base64)', url: 'data:image/svg+xml;base64,' + Utilities.base64Encode(ICON_SVG) },
    { kind: 'SVG(URL)', url: 'data:image/svg+xml;utf8,' + encodeURIComponent(ICON_SVG) },
    { kind: 'PNG', url: 'data:image/png;base64,' + ICON_PNG },
  ];
  icons.getRange('A2:B10').clearContent();
  attempts.forEach(function (a, i) {
    const row = i + 2;
    icons.getRange(row, 2).setValue(a.kind);
    icons.setRowHeight(row, 48);
    let ok = true;
    let detail = '';
    try {
      const img = SpreadsheetApp.newCellImage()
        .setSourceUrl(a.url)
        .setAltTextTitle('T1-3 ' + i)
        .setAltTextDescription('ダミーのアイコン')
        .build();
      icons.getRange(row, 1).setValue(img);
      SpreadsheetApp.flush();
      detail = '設定できた。画像が見えるかは目で確かめ、メニュー「控えを書く」の6〜8番に書く';
    } catch (err) {
      ok = false;
      detail = maskDigits_((err && err.message) || err).slice(0, 300);
    }
    log_('S06', ENTRY.menu, 'icon', a.kind + ':' + (ok ? 'ok' : 'ng'), detail);
  });
}

// ---------------------------------------------------------------- S07 画像のボタン

function menuPlaceButtons() {
  const admin = sheet_(SHEET.admin);
  admin.getImages().forEach(function (img) {
    img.remove();
  });
  const defs = [
    { col: 1, fn: 'buttonPlain', b64: BTN_BLUE },
    { col: 2, fn: 'buttonUnderscore_', b64: BTN_GREEN },
    { col: 3, fn: 'buttonOwnerCheck', b64: BTN_ORANGE },
  ];
  defs.forEach(function (d) {
    const blob = Utilities.newBlob(Utilities.base64Decode(d.b64), 'image/png', d.fn + '.png');
    const img = admin.insertImage(blob, d.col, 3);
    let ok = true;
    let detail = '割り当てた。押して動くかは、画像を押して確かめる';
    try {
      img.assignScript(d.fn);
    } catch (err) {
      ok = false;
      detail = maskDigits_((err && err.message) || err).slice(0, 300);
    }
    log_('S07', ENTRY.menu, 'assign', d.fn + ':' + (ok ? 'ok' : 'error'), detail);
  });
}

// ---------------------------------------------------------------- S02 メニューから呼ぶ関数

function menuUnderscore_() {
  log_('S02', ENTRY.menu, 'called', 'menuUnderscore_', '');
  ss_().toast('menuUnderscore_ が動いた', 'T1-3', 5);
}

function menuPlain() {
  log_('S02', ENTRY.menu, 'called', 'menuPlain', '');
  ss_().toast('menuPlain が動いた', 'T1-3', 5);
}

function menuOwnerCheck() {
  logOwner_('S10', ENTRY.menu, '');
  ss_().toast('持ち主の確かめをログに書いた', 'T1-3', 5);
}

// ---------------------------------------------------------------- 区切り、控え、まとめ

function menuMark() {
  const ui = SpreadsheetApp.getUi();
  const choices = MARKS.map(function (m, i) {
    return i + 1 + ' ' + m;
  }).join('\n');
  const res = ui.prompt(
    '区切りを書く（操作の前に書く）',
    '番号で選ぶ\n' + choices,
    ui.ButtonSet.OK_CANCEL,
  );
  if (res.getSelectedButton() !== ui.Button.OK) return;
  const name = markByNumber_(res.getResponseText());
  if (!name) {
    ui.alert('番号が合わない。1〜' + MARKS.length + ' で選ぶ');
    return;
  }
  log_('', ENTRY.menu, 'mark', name, '');
}

function menuNote() {
  const ui = SpreadsheetApp.getUi();
  const list = NOTE_QUESTIONS.map(function (q, i) {
    return i + 1 + ' ' + q.question;
  }).join('\n');
  const first = ui.prompt(
    '控えを書く（問いを選ぶ）',
    '番号で選ぶ\n' + list,
    ui.ButtonSet.OK_CANCEL,
  );
  if (first.getSelectedButton() !== ui.Button.OK) return;
  const q = noteByNumber_(first.getResponseText());
  if (!q) {
    ui.alert('番号が合わない。1〜' + NOTE_QUESTIONS.length + ' で選ぶ');
    return;
  }
  const second = ui.prompt(
    q.question,
    q.kind === 'yesno' ? '「はい」か「いいえ」で答える' : '画面の文言をそのまま書く',
    ui.ButtonSet.OK_CANCEL,
  );
  if (second.getSelectedButton() !== ui.Button.OK) return;
  const v = validateNoteAnswer_(q, second.getResponseText());
  if (!v.ok) {
    ui.alert('書かなかった: ' + v.message);
    return;
  }
  log_(q.scenario, ENTRY.menu, q.key, v.value, '控え: ' + q.question);
  ss_().toast('控えを書いた（' + q.key + '）', 'T1-3', 5);
}

function menuSummarize() {
  const out = summarize_(readRows_());
  const sh = sheet_(SHEET.summary);
  sh.clearContents();
  sh.getRange('A:F').setNumberFormat('@');
  const keys = Object.keys(out).sort();
  const table = [['シナリオ', '名前', '判定', '根拠', '設計への影響', '未確定の理由']];
  keys.forEach(function (k) {
    const r = out[k];
    const base = k.slice(0, 3);
    table.push([
      k,
      (SCENARIOS[base] || '') + (k.length > 3 ? '（' + k.slice(4) + '）' : ''),
      r.verdict,
      scrubText_(r.evidence),
      r.impact,
      scrubText_(r.pending),
    ]);
  });
  sh.getRange(1, 1, table.length, 6).setValues(table);
  ss_().toast('「' + SHEET.summary + '」タブに書いた', 'T1-3', 5);
}

function menuWebInfo() {
  const u = classifyUrl_(
    safe_(function () {
      return ScriptApp.getService().getUrl();
    }),
  );
  const enabled = safe_(function () {
    return String(ScriptApp.getService().isEnabled());
  });
  log_(
    'S17',
    ENTRY.menu,
    'called',
    'menuWebInfo',
    'getUrl の種類=' +
      u.kind +
      '、ID末尾4字=' +
      u.tail4 +
      '、ハッシュ=' +
      u.hash8 +
      '、isEnabled=' +
      enabled,
  );
}
