// 調べる画面の純粋な関数。DOM や GAS は呼ばない（受け取った値だけで決まる）。DESIGN.md §4。

// W1 の確かめ用の値。gas/Code.js の EMBED_SAMPLE と同じ
export const EMBED_SAMPLE = '$& $1 $$ </script><!--     日本語';

// 「どこから開いたか」の選択肢。DESIGN.md §2 の一覧と同じ（gas/Logic.js の ORIGINS とも同じ）
export const ORIGIN_CHOICES = [
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

// 初めは何も選ばれておらず、選ぶまで調べられない
export const INITIAL_ORIGIN = '';

export function canProbe(origin: string): boolean {
  return ORIGIN_CHOICES.indexOf(origin) >= 0;
}

// スマホの開き方（DESIGN.md §2 の一覧のうち、iPhone と Android の5つ）。アカウントの控えを送る開き方
export function isPhoneOrigin(origin: string): boolean {
  return ORIGIN_CHOICES.indexOf(origin) >= 4 && ORIGIN_CHOICES.indexOf(origin) <= 8;
}

// そのブラウザでログインしているアカウントの選択肢。初めは何も選ばれず、選ぶまで送れない
export const ACCOUNT_CHOICES = ['なし', 'A', 'B', 'ほか'];
export const INITIAL_ACCOUNT = '';

export function canSendAccount(origin: string, answer: string): boolean {
  return isPhoneOrigin(origin) && ACCOUNT_CHOICES.indexOf(answer) >= 0;
}

export interface ScriptHolder {
  querySelector(selector: string): { textContent: string | null } | null;
}

// <script type="application/json"> を読んで parse する。なければ、壊れていれば null
export function readEmbedded(doc: ScriptHolder): unknown {
  const el = doc.querySelector('script[type="application/json"]');
  if (!el || el.textContent === null) return null;
  try {
    return JSON.parse(el.textContent);
  } catch {
    return null;
  }
}

export interface BuildHolder {
  querySelector(selector: string): { getAttribute(name: string): string | null } | null;
}

export type BuildFrom = 'meta' | 'body' | 'both' | 'none';

function metaBuild(doc: BuildHolder): string {
  try {
    const el = doc.querySelector('meta[name="t14-build"]');
    return (el && el.getAttribute('content')) || '';
  } catch {
    return '';
  }
}

function bodyBuild(doc: BuildHolder): string {
  try {
    const el = doc.querySelector('[data-build]');
    return (el && el.getAttribute('data-build')) || '';
  } catch {
    return '';
  }
}

// ビルドの印を、<meta name="t14-build"> と、body の data-build の両方から探して読む（meta を優先）。
// メニューの JSON が壊れていても、iframe の中で meta が取り除かれても読める。なければ空
export function buildOf(doc: BuildHolder): string {
  return metaBuild(doc) || bodyBuild(doc);
}

// 印を読めた場所
export function buildSource(doc: BuildHolder): BuildFrom {
  const m = metaBuild(doc) !== '';
  const b = bodyBuild(doc) !== '';
  return m && b ? 'both' : m ? 'meta' : b ? 'body' : 'none';
}

// 「調べる」を押せるか。開き方を選び、via を読み終えている（null でない）ときだけ
export function canStartProbe(origin: string, via: Via | null): boolean {
  return canProbe(origin) && via !== null;
}

export interface Visit {
  had: boolean;
  prevAt: string;
  prevCount: number;
  // 今回書く値（JSON の文字列）
  value: string;
}

// 保存の値（前の日時と回数）から、今回書く値と「前の値があったか」を作る。壊れた値は「なかった」と同じ
export function nextVisit(prev: string | null, now: string): Visit {
  let prevAt = '';
  let prevCount = 0;
  let had = false;
  if (typeof prev === 'string' && prev !== '') {
    try {
      const p = JSON.parse(prev) as { at?: unknown; count?: unknown } | null;
      if (p && typeof p === 'object' && typeof p.at === 'string' && typeof p.count === 'number') {
        had = true;
        prevAt = p.at;
        prevCount = p.count;
      }
    } catch {
      // 壊れた値は、なかったことにする
    }
  }
  return { had, prevAt, prevCount, value: JSON.stringify({ at: now, count: prevCount + 1 }) };
}

export type StorageResult<T> = { ok: true; value: T } | { ok: false; error: string };

// localStorage などの例外を握りつぶし、失敗を値で返す
export function withStorage<T>(fn: () => T): StorageResult<T> {
  try {
    return { ok: true, value: fn() };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export interface WindowLike {
  innerWidth: number;
  screen: { width: number };
  devicePixelRatio: number;
  visualViewport?: { width: number } | null;
}

export interface ViewportFacts {
  innerWidth: number;
  screenWidth: number;
  devicePixelRatio: number;
  visualViewportWidth: number | null;
}

export function viewportFacts(win: WindowLike): ViewportFacts {
  return {
    innerWidth: win.innerWidth,
    screenWidth: win.screen.width,
    devicePixelRatio: win.devicePixelRatio,
    visualViewportWidth: win.visualViewport ? win.visualViewport.width : null,
  };
}

export type VisitKind = 'reload' | 'reopen' | 'unknown';

export interface SessionLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

// sessionStorage の印で、再読み込みか開き直しかを見分ける。印があれば再読み込み、なければ開き直し。
// sessionStorage を取り出すだけで例外になる環境があるので、取り出す処理も関数で受け取り、try の中で呼ぶ。
// 使えなければ unknown
export function detectVisitKind(getSession: () => SessionLike): VisitKind {
  const got = withStorage(() => {
    const session = getSession();
    return { session, mark: session.getItem(MARK_KEY) };
  });
  if (!got.ok) return 'unknown';
  const set = withStorage(() => got.value.session.setItem(MARK_KEY, '1'));
  if (!set.ok) return 'unknown';
  return got.value.mark !== null ? 'reload' : 'reopen';
}

const MARK_KEY = 't14-session-mark';

export type Via = 'exec' | 'dev' | 'none';

// URL の引数 via を、google.script.url.getLocation の結果（location.parameter.via）から読む
export function readVia(
  location: { parameter?: Record<string, string | undefined> } | null | undefined,
): Via {
  const v = location && location.parameter ? location.parameter.via : undefined;
  return v === 'exec' || v === 'dev' ? v : 'none';
}

// via がないときに、調べる画面の上に出す文言。付いていれば出さない（空）
export function viaNotice(via: Via): string {
  return via === 'none'
    ? 'URL の末尾に ?via=exec か ?via=dev が付いていません。付けて開き直してください。'
    : '';
}

// 同じ値かどうかを比べるための短い印（FNV-1a 32 ビット）。元の値には戻せない
export function originHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return ('00000000' + h.toString(16)).slice(-8);
}

export function shortUserAgent(ua: unknown): string {
  return typeof ua === 'string' ? ua.slice(0, 200) : '';
}

// ---------------------------------------------------------------- 事実の行

export interface Fact {
  scenario: string;
  fact: string;
  value: string;
  detail: Record<string, string>;
}

// detail の buildFrom に、ビルドの印を読めた場所（meta、body、both、none）を入れる
export function moduleFact(buildFrom: BuildFrom = 'none'): Fact {
  return { scenario: 'W2', fact: 'module', value: '動いた', detail: { buildFrom } };
}

export function embedFact(embedded: unknown): Fact {
  const read = embedded !== null && typeof embedded === 'object';
  const same = read && (embedded as { sample?: unknown }).sample === EMBED_SAMPLE;
  return { scenario: 'W1', fact: 'embed', value: JSON.stringify({ read, same }), detail: {} };
}

// 幅の2つの事実（W3 の viewport と、W3-html の viewport.html）
export function viewportRows(win: WindowLike): Fact[] {
  const v = viewportFacts(win);
  return [
    { scenario: 'W3', fact: 'viewport', value: JSON.stringify(v), detail: {} },
    {
      scenario: 'W3-html',
      fact: 'viewport.html',
      value: JSON.stringify({ innerWidth: v.innerWidth }),
      detail: {},
    },
  ];
}

export function storageFact(
  store: 'local' | 'idb',
  visit: Visit,
  kind: VisitKind,
  wrote: boolean,
  where: { hash: string; via: string },
): Fact {
  return {
    scenario: 'W4',
    fact: 'storage.' + store,
    value: JSON.stringify({
      had: visit.had,
      count: visit.prevCount,
      prevAt: visit.prevAt,
      wrote,
    }),
    detail: { kind, hash: where.hash, via: where.via },
  };
}

export function rttFact(size: number, times: number[]): Fact {
  return { scenario: 'W7', fact: 'rtt', value: JSON.stringify({ size, times }), detail: {} };
}

const NOTE_SCENARIO = { 'user.width': 'W3', 'user.homeicon': 'W5', 'user.account': 'W9' } as const;

export function noteFact(key: keyof typeof NOTE_SCENARIO, answer: string): Fact {
  return { scenario: NOTE_SCENARIO[key], fact: key, value: answer, detail: {} };
}

// 開けなかった開き方（cannot）と、画面は出たが失敗と出た開き方（failed）の控え
export function cannotopenFact(origin: string, state: 'cannot' | 'failed', text: string): Fact {
  return {
    scenario: 'W8',
    fact: 'user.cannotopen',
    value: JSON.stringify({ origin, state, text }),
    detail: {},
  };
}

// recordFact に渡す6つの文字列（シナリオ、開き方、事実、値、詳細、ビルドの印）にする。
// どの行にも、詳細に userAgent の短い形を足す（開き方の選び間違いを後から見分けるため）
export function toRow(
  fact: Fact,
  origin: string,
  build: string,
  ua: string,
): [string, string, string, string, string, string] {
  const detail = JSON.stringify({ ...fact.detail, ua: shortUserAgent(ua) });
  return [fact.scenario, origin, fact.fact, fact.value, detail, build];
}
