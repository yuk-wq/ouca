// T1-3 検証: トリガー（インストール型の編集、変更、時間主導）と、画像のボタンの関数。
// トリガーの作成と削除はメニューから行う。削除は OWN_HANDLERS の名前のものだけを消す。

function menuCreateTriggers() {
  const ss = ss_();
  deleteOwnTriggers_();
  const defs = [
    {
      fn: 'trigEditPlain',
      scenario: 'S09',
      make: function () {
        return ScriptApp.newTrigger('trigEditPlain').forSpreadsheet(ss).onEdit().create();
      },
    },
    {
      fn: 'trigEdit_',
      scenario: 'S09',
      make: function () {
        return ScriptApp.newTrigger('trigEdit_').forSpreadsheet(ss).onEdit().create();
      },
    },
    {
      fn: 'trigChange',
      scenario: 'S05',
      make: function () {
        return ScriptApp.newTrigger('trigChange').forSpreadsheet(ss).onChange().create();
      },
    },
    {
      fn: 'timerPlain',
      scenario: 'S03',
      make: function () {
        return ScriptApp.newTrigger('timerPlain')
          .timeBased()
          .after(60 * 1000)
          .create();
      },
    },
    {
      fn: 'timer_',
      scenario: 'S03',
      make: function () {
        return ScriptApp.newTrigger('timer_')
          .timeBased()
          .after(60 * 1000)
          .create();
      },
    },
  ];
  defs.forEach(function (d) {
    try {
      d.make();
      log_(d.scenario, ENTRY.menu, 'trigger.created', d.fn, '作った');
    } catch (err) {
      log_(
        d.scenario,
        ENTRY.menu,
        'trigger.created',
        d.fn + ':error',
        maskDigits_((err && err.message) || err).slice(0, 300),
      );
    }
  });
  ss.toast('トリガーを作った。時間主導は1〜2分後に動く', 'T1-3', 8);
}

function deleteOwnTriggers_() {
  let n = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (OWN_HANDLERS.indexOf(t.getHandlerFunction()) >= 0) {
      ScriptApp.deleteTrigger(t);
      n++;
    }
  });
  return n;
}

function menuDeleteTriggers() {
  const n = deleteOwnTriggers_();
  log_('', ENTRY.menu, 'called', 'menuDeleteTriggers', 'この検証のトリガーを ' + n + ' 個消した');
  ss_().toast('トリガーを ' + n + ' 個消した', 'T1-3', 5);
}

function menuListTriggers() {
  const ts = ScriptApp.getProjectTriggers();
  const desc = ts.map(function (t) {
    return (
      t.getHandlerFunction() +
      ':' +
      String(t.getEventType()) +
      ':' +
      String(t.getTriggerSource()) +
      '（ID末尾4字 ' +
      String(t.getUniqueId()).slice(-4) +
      '）'
    );
  });
  log_(
    'S12',
    ENTRY.menu,
    'called',
    'menuListTriggers',
    'プロジェクトのトリガー ' + ts.length + ' 個: ' + desc.join(' / '),
  );
}

// ---------------------------------------------------------------- インストール型の編集トリガー

function trigEditPlain(e) {
  handleInstalledEdit_(e, 'trigEditPlain', 'C6');
}

function trigEdit_(e) {
  handleInstalledEdit_(e, 'trigEdit_', 'D6');
}

function isT13Sheet_(name) {
  return String(name).indexOf('T1-3 ') === 0 && name !== SHEET.log && name !== SHEET.summary;
}

function handleInstalledEdit_(e, fn, resultCell) {
  const range = e && e.range && typeof e.range.getSheet === 'function' ? e.range : null;
  const sheetName = range ? range.getSheet().getName() : '(range なし)';
  // 検証用のタブ以外の編集は記録しない
  if (range && !isT13Sheet_(sheetName)) return;
  const a1 = range ? range.getA1Notation() : '(なし)';
  const real = isRealSheetEvent_(e, ss_().getId(), 'edit');
  const user = safe_(function () {
    return maskEmail_(e.user.getEmail());
  });

  log_(
    'S09',
    ENTRY.edit,
    'called',
    fn,
    'シート=' +
      sheetName +
      '、セル=' +
      a1 +
      '、authMode=' +
      String(e && e.authMode) +
      '、e.user=' +
      user +
      '、本物のシートのオブジェクトか=' +
      real,
  );
  logOwner_('S10', ENTRY.edit, '');
  const m = uidInfo_(e, fn);
  log_('S12', ENTRY.edit, 'uid', m.result, uidDetail_(m));
  log_('S05', ENTRY.edit, 'edit', 'onEdit', 'シート=' + sheetName + '、セル=' + a1);

  // スマホのチェックボックス: 付けたら、結果をセルに出し、チェックを外す（e.value で判断する）
  const d = decideCheckbox_({ sheetName: sheetName, a1: a1, value: e && e.value }, SHEET.admin);
  if (d.run) {
    const sh = range.getSheet();
    sh.getRange(resultCell).setValue('処理が動いた ' + now_() + '（' + fn + '、編集トリガー）');
    if (d.reset) sh.getRange('B6').setValue(false);
    log_(
      'S08',
      ENTRY.edit,
      'checkbox',
      'reset=' + (sh.getRange('B6').getValue() === false),
      fn + ' が処理した',
    );
  }
}

// ---------------------------------------------------------------- インストール型の変更トリガー

function trigChange(e) {
  log_('S05', ENTRY.change, 'called', 'trigChange', 'authMode=' + String(e && e.authMode));
  log_('S05', ENTRY.change, 'edit', String((e && e.changeType) || '(changeType なし)'), '');
}

// ---------------------------------------------------------------- 時間主導のトリガー

function timerPlain(e) {
  handleTimer_(e, 'timerPlain');
}

function timer_(e) {
  handleTimer_(e, 'timer_');
}

function handleTimer_(e, fn) {
  log_('S03', ENTRY.timer, 'called', fn, '');
  logOwner_('S10', ENTRY.timer, '');
  const m = uidInfo_(e, fn);
  log_(
    'S12',
    ENTRY.timer,
    'uid',
    m.result,
    uidDetail_(m) +
      '。時間主導の「一致しない」「消えた後」は、動いた時点でトリガーが一覧から消えた後の可能性がある',
  );
}

// ---------------------------------------------------------------- 画像のボタンの関数

function buttonPlain() {
  log_('S07', ENTRY.button, 'called', 'buttonPlain', '');
  ss_().toast('buttonPlain が動いた', 'T1-3', 5);
}

function buttonUnderscore_() {
  log_('S07', ENTRY.button, 'called', 'buttonUnderscore_', '');
  ss_().toast('buttonUnderscore_ が動いた', 'T1-3', 5);
}

function buttonOwnerCheck() {
  logOwner_('S10', ENTRY.button, '');
  ss_().toast('持ち主の確かめをログに書いた', 'T1-3', 5);
}
