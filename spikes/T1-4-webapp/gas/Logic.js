// T1-4 検証: GAS を呼ばない純粋な関数。DESIGN.md §2、§4 のとおり。
// import と export は使わない。入口ではないので、関数の名前の末尾はすべて _。
// VERDICTS と ORIGINS は DESIGN.md §2 と同じで、テストが表と比べる。

// HTML の中でメニューの JSON を入れる位置に置く目印の文字列
const PLACEHOLDER = '__OUCA_T14_EMBED__';

// doGet が addMetaTag を試す名前
const META_NAMES = [
  'viewport',
  'apple-mobile-web-app-capable',
  'apple-mobile-web-app-title',
  'apple-mobile-web-app-status-bar-style',
  'mobile-web-app-capable',
  'theme-color',
  'description',
];

const SCENARIOS = {
  W1: 'メニューの埋め込み',
  W2: 'Vite の出力',
  W3: '画面の幅',
  'W3-html': 'HTML の中の viewport',
  W4: '保存の残り方',
  W5: 'meta とアイコン',
  W6: '/dev と実行する人',
  W7: '往復の時間',
  W8: 'ログインの状態と開けるか',
  W9: '開けないときの案内',
};

// 調べる画面の「どこから開いたか」の選択肢（DESIGN.md §2 の一覧と同じ順）
const ORIGINS = [
  'PC の Chrome、アカウント A だけでログイン',
  'PC の Chrome、アカウント A と B の両方でログイン（複数のアカウント）',
  'PC の Chrome、アカウント B だけでログイン',
  'PC の Chrome、シークレットウィンドウ（ログインしていない）',
  'iPhone の Safari',
  'iPhone の LINE の中のブラウザ',
  'Android の Chrome',
  'Android の LINE の中のブラウザ',
];

// 判定の表（DESIGN.md §2）。まとめのタブには verdict をそのまま出す
const VERDICTS = [
  {
    scenarios: ['W1'],
    verdict: '読める',
    impact: '§4.2 のまま',
  },
  {
    scenarios: ['W1'],
    verdict: '壊れる',
    impact: '置き換えとエスケープの方法を変える。M が決める',
  },
  {
    scenarios: ['W2'],
    verdict: '動く',
    impact: '§4.4 のまま',
  },
  {
    scenarios: ['W2'],
    verdict: '動かない',
    impact:
      'ビルドの設定を変える（module でない script に出す、`target` を下げるなど）。直した設定で動くことを確かめ直す',
  },
  {
    scenarios: ['W3'],
    verdict: '合う',
    impact: "§4.2 のまま（`addMetaTag('viewport', …)` を doGet で付ける）",
  },
  {
    scenarios: ['W3'],
    verdict: '合わない',
    impact: 'M が決める',
  },
  {
    scenarios: ['W3-html'],
    verdict: '使われない',
    impact: '§4.2 の注意のまま',
  },
  {
    scenarios: ['W3-html'],
    verdict: '使われる',
    impact: 'どちらを正にするかを M が決める',
  },
  {
    scenarios: ['W4'],
    verdict: '開き方ごとの表',
    impact:
      'どこかで消えるなら、お気に入り、前回の名前、端末 ID は「残れば使う」扱いのまま（§4、§5.1）。消える開き方を手順書と画面の案内に書くかを M が決める。iOS で7日ほど開かないと消える仕組み（ITP）は、この検証では確かめない',
  },
  {
    scenarios: ['W5'],
    verdict: '種類ごとの表',
    impact: '付けられないなら、§4.3 の「付けられない見込み」を確定する',
  },
  {
    scenarios: ['W6'],
    verdict: '入口ごとの表',
    impact:
      '`/exec` で誰が開いてもシートを読み書きできれば §3.3 のまま。`/dev` はデザイン担当の確かめにだけ使う',
  },
  {
    scenarios: ['W7'],
    verdict: '大きさごとの表',
    impact:
      '中央値が1秒を超える大きさがあれば、埋め込み（§4.2）を必須にし、`getCatalog` は埋め込みがないときだけ使う（§3.1 のまま）',
  },
  {
    scenarios: ['W8'],
    verdict: '開き方ごとの表',
    impact: 'どこかで開けないなら、お客さんへの案内を足す（W9）',
  },
  {
    scenarios: ['W9'],
    verdict: '案内が要る',
    impact:
      '開けない画面は Google のもので、こちらの画面は出ない。案内は、オーナーが LINE で送る文と手順書に書く（例「開けないときは、シークレットウィンドウか別のブラウザで開く」）。文の中身は M が決める',
  },
  {
    scenarios: ['W9'],
    verdict: '案内は要らない',
    impact: '案内を足さない',
  },
];

// 調べる画面の位置づけ
const PHONE_ORIGINS = [ORIGINS[4], ORIGINS[5], ORIGINS[6], ORIGINS[7]];
// お客さんが使い得る開き方（W9）
const CUSTOMER_PC_A = ORIGINS[0];
const CUSTOMER_PC_AB = ORIGINS[1];
const CUSTOMER_LINE = [ORIGINS[5], ORIGINS[7]];
const CUSTOMER_ORIGINS = [ORIGINS[0], ORIGINS[1], ORIGINS[5], ORIGINS[7]];

// ---------------------------------------------------------------- 埋め込み

// 目印を JSON に置き換える。置き換えは関数でなく位置で行い（$& などを解釈させない）、
// <（</script> や <!-- を防ぐ）と U+2028、U+2029 をエスケープする。目印がなければ例外。2つ目以降は置き換えない
function embedCatalog_(html, placeholder, json) {
  const text = String(html);
  const at = text.indexOf(placeholder);
  if (at < 0) throw new Error('目印がない: ' + placeholder);
  const safe = String(json)
    .replace(/</g, '\\u003c')
    .split(String.fromCharCode(0x2028))
    .join('\\u2028')
    .split(String.fromCharCode(0x2029))
    .join('\\u2029');
  return text.slice(0, at) + safe + text.slice(at + placeholder.length);
}

// ---------------------------------------------------------------- 伏せ方

function maskEmail_(s) {
  const text = String(s || '');
  if (!text) return '';
  const at = text.indexOf('@');
  if (at < 0) return text.slice(0, 2) + '***';
  return text.slice(0, 2) + '***@' + text.slice(at + 1);
}

function maskDigits_(s) {
  return String(s === undefined || s === null ? '' : s).replace(/\d{6,}/g, '***');
}

// ログに書く前に、文の中のメールアドレスと Web アプリの URL（デプロイ ID）を伏せる
function scrubText_(text) {
  return String(text === undefined || text === null ? '' : text)
    .replace(
      /https:\/\/script\.google\.com\/macros\/s\/[^\s"'/]+\/(exec|dev)/g,
      'https://script.google.com/macros/s/***/$1',
    )
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, function (m) {
      return maskEmail_(m);
    });
}

function hash8_(text) {
  // FNV-1a 32 ビット。同じ値かどうかを比べるための短い印で、元の値には戻せない
  let h = 0x811c9dc5;
  const s = String(text);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return ('00000000' + h.toString(16)).slice(-8);
}

function classifyUrl_(url) {
  const s = String(url || '');
  let kind = 'other';
  let body = s;
  if (s.slice(-5) === '/exec') {
    kind = 'exec';
    body = s.slice(0, -5);
  } else if (s.slice(-4) === '/dev') {
    kind = 'dev';
    body = s.slice(0, -4);
  }
  return { kind: kind, tail4: body.slice(-4), hash8: hash8_(s) };
}

// ---------------------------------------------------------------- 往復の時間

function rttStats_(ms) {
  const a = (ms || []).slice().sort(function (x, y) {
    return x - y;
  });
  if (a.length === 0) return { median: null, max: null };
  const mid = Math.floor(a.length / 2);
  const median = a.length % 2 === 1 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
  return { median: median, max: a[a.length - 1] };
}

// ---------------------------------------------------------------- まとめ

function impactFor_(scenario, verdict) {
  for (let i = 0; i < VERDICTS.length; i++) {
    const v = VERDICTS[i];
    if (v.verdict === verdict && v.scenarios.indexOf(scenario) >= 0) return v.impact;
  }
  return '';
}

function decided_(scenario, verdict, evidence, extra) {
  const out = {
    verdict: verdict,
    evidence: evidence,
    impact: impactFor_(scenario, verdict),
    pending: '',
  };
  if (extra) {
    Object.keys(extra).forEach(function (k) {
      out[k] = extra[k];
    });
  }
  return out;
}

function undecided_(evidence, missing) {
  return { verdict: '未確定', evidence: evidence, impact: '', pending: missing };
}

function parseJson_(text) {
  try {
    const v = JSON.parse(String(text));
    return v && typeof v === 'object' ? v : null;
  } catch (err) {
    return null;
  }
}

function lastRow_(rows, fact, pred) {
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i].fact === fact && (!pred || pred(rows[i]))) return rows[i];
  }
  return null;
}

function rowsOf_(rows, fact, pred) {
  return rows.filter(function (r) {
    return r.fact === fact && (!pred || pred(r));
  });
}

function valueOf_(rows, fact) {
  const r = lastRow_(rows, fact);
  return r ? String(r.value) : undefined;
}

function summarizeW1_(rows) {
  const r = lastRow_(rows, 'embed');
  if (!r) return undecided_('', '足りない事実: embed');
  const p = parseJson_(r.value) || {};
  return decided_(
    'W1',
    p.read === true && p.same === true ? '読める' : '壊れる',
    'embed=' + r.value,
  );
}

function summarizeW2_(rows) {
  const mod = lastRow_(rows, 'module');
  const cls = lastRow_(rows, 'classic');
  const evidence = 'module の行=' + !!mod + '、classic の行=' + !!cls;
  if (mod) return decided_('W2', '動く', evidence);
  if (cls) return decided_('W2', '動かない', evidence);
  return undecided_(evidence, '足りない事実: module、classic');
}

function summarizeW3_(rows) {
  let pass = 0;
  let fail = 0;
  let pendingOrigins = [];
  let seen = 0;
  const notes = [];
  PHONE_ORIGINS.forEach(function (o) {
    const vr = lastRow_(rows, 'viewport', function (r) {
      return r.origin === o;
    });
    if (!vr) return;
    seen++;
    const p = parseJson_(vr.value) || {};
    const ratio = p.screenWidth > 0 ? p.innerWidth / p.screenWidth : 0;
    const ratioOk = ratio >= 0.95 && ratio <= 1.05;
    const ur = lastRow_(rows, 'user.width', function (r) {
      return r.origin === o;
    });
    notes.push(
      o +
        ': 幅の比=' +
        Math.round(ratio * 1000) / 1000 +
        '、user.width=' +
        (ur ? ur.value : '(なし)'),
    );
    if (!ratioOk) fail++;
    else if (!ur) pendingOrigins.push(o);
    else if (ur.value === 'はい') pass++;
    else fail++;
  });
  const evidence = notes.join(' / ');
  if (pass > 0) return decided_('W3', '合う', evidence);
  if (seen === 0) return undecided_(evidence, '足りない事実: viewport（スマホの開き方の行）');
  if (pendingOrigins.length > 0) {
    return undecided_(evidence, '足りない控え: user.width（' + pendingOrigins.join('、') + '）');
  }
  return decided_('W3', '合わない', evidence);
}

function summarizeW3Html_(rows) {
  const r = lastRow_(rows, 'viewport.html');
  if (!r) return undecided_('', '足りない事実: viewport.html');
  const p = parseJson_(r.value) || {};
  return decided_(
    'W3-html',
    p.innerWidth === 500 ? '使われる' : '使われない',
    'viewport.html=' + r.value,
  );
}

function storageCell_(list, kind) {
  if (kind === 'unknown') {
    return list.some(function (r) {
      return r.detail === 'unknown';
    })
      ? '見分けられない'
      : '確かめていない';
  }
  // 最初の訪問は、前の値がないのが当たり前なので数えない
  const sub = list.slice(1).filter(function (r) {
    return r.detail === kind;
  });
  if (
    sub.some(function (r) {
      return (parseJson_(r.value) || {}).had === true;
    })
  )
    return '残った';
  return sub.length > 0 ? '消えた' : '確かめていない';
}

function summarizeW4_(rows) {
  const total = rowsOf_(rows, 'storage.local').length + rowsOf_(rows, 'storage.idb').length;
  if (total === 0) return undecided_('', '足りない事実: storage.local、storage.idb');
  const table = ORIGINS.map(function (o) {
    const cells = function (fact) {
      const list = rowsOf_(rows, fact, function (r) {
        return r.origin === o;
      });
      return {
        reload: storageCell_(list, 'reload'),
        reopen: storageCell_(list, 'reopen'),
        unknown: storageCell_(list, 'unknown'),
      };
    };
    return { origin: o, local: cells('storage.local'), idb: cells('storage.idb') };
  });
  return decided_('W4', '開き方ごとの表', 'storage の行=' + total + '件', { table: table });
}

function summarizeW5_(rows) {
  const metaRows = rowsOf_(rows, 'meta');
  if (metaRows.length === 0) return undecided_('', '足りない事実: meta');
  const names = [];
  const byName = {};
  metaRows.forEach(function (r) {
    const p = parseJson_(r.value) || {};
    const name = String(p.name);
    if (!(name in byName)) names.push(name);
    byName[name] = { name: name, ok: p.ok === true, error: String(p.error || '') };
  });
  const fr = lastRow_(rows, 'favicon');
  const fp = fr ? parseJson_(fr.value) || {} : null;
  const icons = [];
  const idx = {};
  rowsOf_(rows, 'user.homeicon').forEach(function (r) {
    if (r.origin in idx) icons[idx[r.origin]].text = r.value;
    else {
      idx[r.origin] = icons.length;
      icons.push({ origin: r.origin, text: r.value });
    }
  });
  return decided_('W5', '種類ごとの表', 'meta=' + names.length + '件、favicon=' + !!fr, {
    table: {
      meta: names.map(function (n) {
        return byName[n];
      }),
      favicon: fp ? { ok: fp.ok === true, error: String(fp.error || '') } : null,
      homeicon: icons,
    },
  });
}

function summarizeW6_(rows) {
  const keys = [];
  const by = {};
  rowsOf_(rows, 'exec', function (r) {
    return r.origin !== '';
  }).forEach(function (r) {
    const p = parseJson_(r.value) || {};
    const k = r.origin + '|' + p.kind;
    if (!(k in by)) keys.push(k);
    by[k] = {
      origin: r.origin,
      kind: p.kind,
      effectiveIsOwner: p.effectiveIsOwner === true,
      read: p.read === true,
      wrote: p.wrote === true,
    };
  });
  if (keys.length === 0)
    return undecided_('', '足りない事実: exec（開き方つきの行。調べる画面の呼び出し）');
  return decided_('W6', '入口ごとの表', 'exec の行=' + keys.length + '件', {
    table: keys.map(function (k) {
      return by[k];
    }),
  });
}

function summarizeW7_(rows) {
  const bySize = {};
  rowsOf_(rows, 'rtt').forEach(function (r) {
    const p = parseJson_(r.value);
    if (p && typeof p.size === 'number' && Array.isArray(p.times)) bySize[p.size] = p.times;
  });
  const sizes = Object.keys(bySize)
    .map(Number)
    .sort(function (a, b) {
      return a - b;
    });
  if (sizes.length === 0) return undecided_('', '足りない事実: rtt');
  const table = sizes.map(function (size) {
    const st = rttStats_(bySize[size]);
    return { size: size, median: st.median, max: st.max, over1s: st.median > 1000 };
  });
  const embedRequired = table.some(function (t) {
    return t.over1s;
  });
  return decided_('W7', '大きさごとの表', 'rtt の大きさ=' + sizes.join('、') + ' KB', {
    table: table,
    embedRequired: embedRequired,
  });
}

// 開き方ごとの、開けたか。行が来た開き方は「開けた」、開けなかったと控えた開き方は「開けなかった」
function openStatuses_(rows) {
  const cannot = {};
  rowsOf_(rows, 'user.cannotopen').forEach(function (r) {
    const p = parseJson_(r.value);
    if (p && p.origin) cannot[p.origin] = String(p.text || '');
  });
  return ORIGINS.map(function (o) {
    const opened = rows.some(function (r) {
      return r.origin === o && r.fact !== 'user.cannotopen';
    });
    if (opened) return { origin: o, status: '開けた', text: '' };
    if (o in cannot) return { origin: o, status: '開けなかった', text: cannot[o] };
    return { origin: o, status: '確かめていない', text: '' };
  });
}

function summarizeW8_(rows) {
  const table = openStatuses_(rows);
  const checked = table.filter(function (t) {
    return t.status !== '確かめていない';
  });
  if (checked.length === 0)
    return undecided_('', '足りない事実: 開き方ごとの行（調べる画面から送った行）');
  return decided_('W8', '開き方ごとの表', '確かめた開き方=' + checked.length + '件', {
    table: table,
  });
}

function summarizeW9_(rows) {
  const st = {};
  openStatuses_(rows).forEach(function (t) {
    st[t.origin] = t.status;
  });
  const failed = CUSTOMER_ORIGINS.filter(function (o) {
    return st[o] === '開けなかった';
  });
  const unchecked = CUSTOMER_ORIGINS.filter(function (o) {
    return st[o] === '確かめていない';
  });
  const evidence =
    '開けなかった=[' + failed.join('、') + ']、確かめていない=[' + unchecked.join('、') + ']';
  if (failed.length > 0) return decided_('W9', '案内が要る', evidence);
  const abOk = st[CUSTOMER_PC_AB] === '開けた';
  const lineOk = CUSTOMER_LINE.some(function (o) {
    return st[o] === '開けた';
  });
  if (abOk && lineOk) return decided_('W9', '案内は要らない', evidence);
  const missing = [];
  if (!abOk) missing.push(CUSTOMER_PC_AB);
  if (!lineOk) missing.push(CUSTOMER_LINE.join('、'));
  return undecided_(evidence, '確かめていない開き方: ' + missing.join('、'));
}

function summarize_(rows) {
  rows = rows || [];
  return {
    W1: summarizeW1_(rows),
    W2: summarizeW2_(rows),
    W3: summarizeW3_(rows),
    'W3-html': summarizeW3Html_(rows),
    W4: summarizeW4_(rows),
    W5: summarizeW5_(rows),
    W6: summarizeW6_(rows),
    W7: summarizeW7_(rows),
    W8: summarizeW8_(rows),
    W9: summarizeW9_(rows),
  };
}
