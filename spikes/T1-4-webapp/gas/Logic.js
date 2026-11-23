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

// recordFact が受け付ける値（誰でも呼べるので、決めた一覧にないものは断る）
const SCENARIO_IDS = ['', 'W1', 'W2', 'W3', 'W3-html', 'W4', 'W5', 'W6', 'W7', 'W8', 'W9'];
const FACT_NAMES = [
  'embed',
  'module',
  'classic',
  'viewport',
  'viewport.html',
  'storage.local',
  'storage.idb',
  'rtt',
  'user.width',
  'user.homeicon',
  'user.cannotopen',
  'user.account',
];
const MAX_FIELD = 100;
const MAX_TEXT = 1500;

// 調べる画面の「どこから開いたか」の選択肢（DESIGN.md §2 の一覧と同じ順）
const ORIGINS = [
  'PC の Chrome、アカウント A（持ち主）だけでログイン',
  'PC の Chrome、アカウント B だけでログイン',
  'PC の Chrome、B が既定で A も追加（B で先にログインし、後から A を足す。T1-2 で開けなかった状況）',
  'PC の Chrome、シークレットウィンドウ（ログインしていない）',
  'iPhone の Safari',
  'iPhone の LINE の中のブラウザ',
  'iPhone のホーム画面に追加したアイコンから',
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
    impact: '置き換えとエスケープの方法を変える。メインのセッションが決める',
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
    impact: 'メインのセッションが決める',
  },
  {
    scenarios: ['W3-html'],
    verdict: '使われない',
    impact: '§4.2 の注意のまま',
  },
  {
    scenarios: ['W3-html'],
    verdict: '使われる',
    impact:
      'W3 は判定しない。HTML の中の viewport を外したビルドで確かめ直す。どちらを正にするかはメインのセッションが決める',
  },
  {
    scenarios: ['W4'],
    verdict: '開き方ごとの表',
    impact:
      'どこかで消える、混ざる、書けないなら、お気に入り、前回の名前、端末 ID は「残れば使う」扱いのまま（§4、§5.1）。消える開き方を手順書と画面の案内に書くかをメインのセッションが決める。iOS で7日ほど開かないと消える仕組み（ITP）は、この検証では確かめない',
  },
  {
    scenarios: ['W5'],
    verdict: '種類ごとの表',
    impact: '付けられないなら、§4.3 の「付けられない見込み」を確定する',
  },
  {
    scenarios: ['W6'],
    verdict: '成り立つ',
    impact: '§3.3 のまま。`/dev` はデザイン担当の確かめにだけ使う',
  },
  {
    scenarios: ['W6'],
    verdict: '成り立たない',
    impact: 'メインのセッションが決める',
  },
  {
    scenarios: ['W7'],
    verdict: '埋め込みが必須',
    impact: '埋め込み（§4.2）を必須にし、`getCatalog` は埋め込みがないときだけ使う（§3.1 のまま）',
  },
  {
    scenarios: ['W7'],
    verdict: '往復も実用の速さ',
    impact:
      '埋め込みは初回表示のために使い続ける。`getCatalog` の往復も、更新の確かめなどに使える速さとする',
  },
  {
    scenarios: ['W8'],
    verdict: '開き方ごとの表',
    impact: 'どこかが「開けた」でなければ、お客さんへの案内を足す（W9）',
  },
  {
    scenarios: ['W9'],
    verdict: '案内が要る',
    impact:
      '開けない画面は Google のもので、こちらの画面は出ない。案内は、オーナーが LINE で送る文と手順書に書く（例「開けないときは、シークレットウィンドウか別のブラウザで開く」）。文の中身はメインのセッションが決める',
  },
  {
    scenarios: ['W9'],
    verdict: '案内は要らない',
    impact: '案内を足さない',
  },
];

// 開き方の位置づけ（ORIGINS の添字）
const ORIGIN_PC_B_A = ORIGINS[2];
const PHONE_ORIGINS = [ORIGINS[4], ORIGINS[5], ORIGINS[6], ORIGINS[7], ORIGINS[8]];
const LINE_ORIGINS = [ORIGINS[5], ORIGINS[8]];
// お客さんが使い得る開き方（DESIGN.md §2 の一覧の「お客さん」の印）
const CUSTOMER_ORIGINS = [ORIGINS[1], ORIGINS[2], ORIGINS[4], ORIGINS[5], ORIGINS[7], ORIGINS[8]];

// ---------------------------------------------------------------- 外から受け取る値の確かめ

// recordFact の6つの引数を確かめる。決めた一覧にないものは例外。値と詳細は 1500 字で切って返す
function checkFact_(scenario, origin, fact, value, detail, build) {
  const args = [scenario, origin, fact, value, detail, build];
  for (let i = 0; i < args.length; i++) {
    if (typeof args[i] !== 'string')
      throw new Error('文字列でない値は書けない（' + (i + 1) + ' 番目）');
  }
  if (scenario.length > MAX_FIELD || SCENARIO_IDS.indexOf(scenario) < 0) {
    throw new Error('決めた一覧にないシナリオ');
  }
  if (origin !== '' && (origin.length > MAX_FIELD * 2 || ORIGINS.indexOf(origin) < 0)) {
    throw new Error('決めた一覧にない開き方');
  }
  if (fact.length > MAX_FIELD || FACT_NAMES.indexOf(fact) < 0) {
    throw new Error('決めた一覧にない事実');
  }
  return {
    scenario: scenario,
    origin: origin,
    fact: fact,
    value: value.slice(0, MAX_TEXT),
    detail: detail.slice(0, MAX_TEXT),
    build: build.slice(0, MAX_FIELD),
  };
}

// ---------------------------------------------------------------- 埋め込み

// 目印を JSON に置き換える。置き換えは位置で切って足す（$& などを解釈させない）。
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

function atOrigin_(o) {
  return function (r) {
    return r.origin === o;
  };
}

// 最新のビルドの印（doGet が書いた最後の build の行の値）と同じ印の行だけにする。build の行がなければ全部
function currentBuildRows_(rows) {
  const b = lastRow_(rows, 'build');
  if (!b) return rows;
  const mark = String(b.value);
  return rows.filter(function (r) {
    return r.build === mark;
  });
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

// W3-html。スマホの開き方の行だけを使い、開き方ごとに出す
function htmlViewportOf_(rows) {
  const items = [];
  PHONE_ORIGINS.forEach(function (o) {
    const r = lastRow_(rows, 'viewport.html', atOrigin_(o));
    if (!r) return;
    const p = parseJson_(r.value) || {};
    items.push({ origin: o, innerWidth: p.innerWidth, used: p.innerWidth === 500 });
  });
  return items;
}

function summarizeW3Html_(rows) {
  const items = htmlViewportOf_(rows);
  if (items.length === 0)
    return undecided_('', '足りない事実: viewport.html（スマホの開き方の行）');
  const evidence = items
    .map(function (i) {
      return i.origin + ': innerWidth=' + i.innerWidth;
    })
    .join(' / ');
  const used = items.some(function (i) {
    return i.used;
  });
  return decided_('W3-html', used ? '使われる' : '使われない', evidence);
}

function summarizeW3_(rows) {
  const usedHtml = htmlViewportOf_(rows).filter(function (i) {
    return i.used;
  });
  const failed = [];
  const pending = [];
  const notes = [];
  let seen = 0;
  PHONE_ORIGINS.forEach(function (o) {
    const vr = lastRow_(rows, 'viewport', atOrigin_(o));
    if (!vr) return;
    seen++;
    const p = parseJson_(vr.value) || {};
    const ratio = p.screenWidth > 0 ? p.innerWidth / p.screenWidth : 0;
    const ratioOk = ratio >= 0.95 && ratio <= 1.05;
    const ur = lastRow_(rows, 'user.width', atOrigin_(o));
    notes.push(
      o +
        ': 幅の比=' +
        Math.round(ratio * 1000) / 1000 +
        '、user.width=' +
        (ur ? ur.value : '(なし)'),
    );
    if (!ratioOk || (ur && ur.value !== 'はい')) failed.push(o);
    else if (!ur) pending.push(o);
  });
  const evidence = notes.join(' / ');
  if (usedHtml.length > 0) {
    return undecided_(
      evidence,
      'W3-html が「使われる」ので、判定しない（' +
        usedHtml
          .map(function (i) {
            return i.origin;
          })
          .join('、') +
        '）',
    );
  }
  if (seen === 0) return undecided_(evidence, '足りない事実: viewport（スマホの開き方の行）');
  if (failed.length > 0)
    return decided_('W3', '合わない', evidence + ' / 合わない: ' + failed.join('、'));
  if (pending.length > 0) {
    return undecided_(evidence, '足りない控え: user.width（' + pending.join('、') + '）');
  }
  return decided_('W3', '合う', evidence);
}

// 保存の1つのセル。list は、その開き方と保存の種類の /exec の行（詳細を parse したもの）
function storageCell_(list, kind) {
  if (kind === 'unknown') {
    return list.some(function (x) {
      return x.d.kind === 'unknown';
    })
      ? '見分けられない'
      : '確かめていない';
  }
  // 最初の訪問は、前の値がないのが当たり前なので数えない
  const sub = list.slice(1).filter(function (x) {
    return x.d.kind === kind;
  });
  if (sub.length === 0) return '確かめていない';
  if (
    sub.some(function (x) {
      return x.v.wrote === false;
    })
  ) {
    return '書けなかった';
  }
  const kept = sub.filter(function (x) {
    return x.v.had === true;
  }).length;
  if (kept === sub.length) return '残った（' + kept + '/' + sub.length + '）';
  if (kept === 0) return '消えた';
  return '混ざった（' + kept + '/' + sub.length + '）';
}

function summarizeW4_(rows) {
  const all = rowsOf_(rows, 'storage.local').concat(rowsOf_(rows, 'storage.idb'));
  if (all.length === 0) return undecided_('', '足りない事実: storage.local、storage.idb');
  const parsed = function (fact, o) {
    return rowsOf_(rows, fact, atOrigin_(o))
      .map(function (r) {
        return { d: parseJson_(r.detail) || {}, v: parseJson_(r.value) || {} };
      })
      .filter(function (x) {
        return x.d.via === 'exec';
      });
  };
  const table = ORIGINS.map(function (o) {
    const cells = function (fact) {
      const list = parsed(fact, o);
      return {
        reload: storageCell_(list, 'reload'),
        reopen: storageCell_(list, 'reopen'),
        unknown: storageCell_(list, 'unknown'),
      };
    };
    return { origin: o, local: cells('storage.local'), idb: cells('storage.idb') };
  });
  // iframe の保存先（location.origin のハッシュ）を、開き方と入口ごとに出す
  const storageOrigins = [];
  const seen = {};
  all.forEach(function (r) {
    const d = parseJson_(r.detail) || {};
    const key = r.origin + '|' + d.via + '|' + d.hash;
    if (seen[key]) return;
    seen[key] = true;
    storageOrigins.push({ origin: r.origin, via: d.via, hash: d.hash });
  });
  return decided_('W4', '開き方ごとの表', 'storage の行=' + all.length + '件', {
    table: table,
    storageOrigins: storageOrigins,
  });
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
    const k = r.origin + '|' + p.via;
    if (!(k in by)) keys.push(k);
    by[k] = {
      origin: r.origin,
      via: p.via,
      urlKind: p.urlKind,
      effectiveIsOwner: p.effectiveIsOwner === true,
      read: p.read === true,
      wrote: p.wrote === true,
    };
  });
  const table = keys.map(function (k) {
    return by[k];
  });
  const execRows = table.filter(function (t) {
    return t.via === 'exec';
  });
  if (execRows.length === 0) {
    return undecided_('', '足りない事実: exec（/exec で開いた、開き方つきの行）');
  }
  const bad = execRows.filter(function (t) {
    return !(t.effectiveIsOwner && t.read && t.wrote);
  });
  const evidence =
    '/exec の行=' +
    execRows.length +
    '件、成り立たない入口=[' +
    bad
      .map(function (t) {
        return t.origin;
      })
      .join('、') +
    ']';
  return decided_('W6', bad.length === 0 ? '成り立つ' : '成り立たない', evidence, { table: table });
}

function summarizeW7_(rows) {
  const bySize = {};
  const origins = [];
  rowsOf_(rows, 'rtt').forEach(function (r) {
    const p = parseJson_(r.value);
    if (!p || typeof p.size !== 'number' || !Array.isArray(p.times)) return;
    bySize[r.origin + '|' + p.size] = { origin: r.origin, size: p.size, times: p.times };
  });
  Object.keys(bySize).forEach(function (k) {
    origins.push(bySize[k]);
  });
  if (origins.length === 0) return undecided_('', '足りない事実: rtt');
  const rank = function (o) {
    const i = ORIGINS.indexOf(o);
    return i < 0 ? 99 : i;
  };
  origins.sort(function (a, b) {
    return rank(a.origin) - rank(b.origin) || a.size - b.size;
  });
  const table = origins.map(function (x) {
    const st = rttStats_(x.times);
    return {
      origin: x.origin,
      size: x.size,
      median: st.median,
      max: st.max,
      over1s: st.median > 1000,
    };
  });
  const evidence = '往復の組=' + table.length + '件';
  if (
    table.some(function (t) {
      return t.over1s;
    })
  ) {
    return decided_('W7', '埋め込みが必須', evidence, { table: table });
  }
  const line = table.some(function (t) {
    return LINE_ORIGINS.indexOf(t.origin) >= 0;
  });
  if (!line) {
    return undecided_(
      evidence,
      '足りない事実: LINE の中のブラウザの往復（' + LINE_ORIGINS.join('、') + '）',
    );
  }
  return decided_('W7', '往復も実用の速さ', evidence, { table: table });
}

// 開き方ごとの、開けたか。5つの状態のどれか
function openStatuses_(rows) {
  const cannot = {};
  rowsOf_(rows, 'user.cannotopen').forEach(function (r) {
    const p = parseJson_(r.value);
    if (p && p.origin) cannot[p.origin] = { state: p.state, text: String(p.text || '') };
  });
  return ORIGINS.map(function (o) {
    const opened = rows.some(function (r) {
      return r.origin === o && r.fact !== 'user.cannotopen';
    });
    const c = cannot[o];
    if (opened && c) return { origin: o, status: '回によって違う', text: c.text };
    if (opened) return { origin: o, status: '開けた', text: '' };
    if (c) {
      return {
        origin: o,
        status: c.state === 'failed' ? '画面は出たがサーバーを呼べなかった' : '開けなかった',
        text: c.text,
      };
    }
    return { origin: o, status: '確かめていない', text: '' };
  });
}

function summarizeW8_(rows) {
  const table = openStatuses_(rows);
  const checked = table.filter(function (t) {
    return t.status !== '確かめていない';
  });
  if (checked.length === 0) {
    return undecided_('', '足りない事実: 開き方ごとの行（調べる画面から送った行）');
  }
  return decided_('W8', '開き方ごとの表', '確かめた開き方=' + checked.length + '件', {
    table: table,
  });
}

function summarizeW9_(rows) {
  const st = {};
  openStatuses_(rows).forEach(function (t) {
    st[t.origin] = t.status;
  });
  // A（持ち主）でログインしたスマホの行は、お客さんの判定に数えない
  const excluded = CUSTOMER_ORIGINS.filter(function (o) {
    const a = lastRow_(rows, 'user.account', atOrigin_(o));
    return !!a && a.value === 'A';
  });
  const counted = CUSTOMER_ORIGINS.filter(function (o) {
    return excluded.indexOf(o) < 0;
  });
  const failed = counted.filter(function (o) {
    return st[o] !== '開けた' && st[o] !== '確かめていない';
  });
  const unchecked = counted.filter(function (o) {
    return st[o] === '確かめていない';
  });
  const evidence =
    '開けなかった=[' +
    failed.join('、') +
    ']、確かめていない=[' +
    unchecked.join('、') +
    ']、A でログインしたため数えない=[' +
    excluded.join('、') +
    ']';
  if (failed.length > 0) return decided_('W9', '案内が要る', evidence);
  const pcOk = counted.indexOf(ORIGIN_PC_B_A) >= 0 && st[ORIGIN_PC_B_A] === '開けた';
  const lineOk = LINE_ORIGINS.some(function (o) {
    return counted.indexOf(o) >= 0 && st[o] === '開けた';
  });
  if (pcOk && lineOk) return decided_('W9', '案内は要らない', evidence);
  const missing = [];
  if (!pcOk) missing.push(ORIGIN_PC_B_A);
  if (!lineOk) missing.push(LINE_ORIGINS.join('、'));
  return undecided_(evidence, '確かめていない開き方: ' + missing.join('、'));
}

function summarize_(rows) {
  rows = currentBuildRows_(rows || []);
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
