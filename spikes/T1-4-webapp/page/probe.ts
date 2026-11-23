// 調べる画面の純粋な関数。DOM や GAS は呼ばない（受け取った値だけで決まる）。DESIGN.md §4。

// W1 の確かめ用の値。gas/Code.js の EMBED_SAMPLE と同じ
export const EMBED_SAMPLE = '$& $1 $$ </script><!--     日本語';

// 「どこから開いたか」の選択肢。DESIGN.md §2 の一覧と同じ（gas/Logic.js の ORIGINS とも同じ）
export const ORIGIN_CHOICES = [
  'PC の Chrome、アカウント A だけでログイン',
  'PC の Chrome、アカウント A と B の両方でログイン（複数のアカウント）',
  'PC の Chrome、アカウント B だけでログイン',
  'PC の Chrome、シークレットウィンドウ（ログインしていない）',
  'iPhone の Safari',
  'iPhone の LINE の中のブラウザ',
  'Android の Chrome',
  'Android の LINE の中のブラウザ',
];

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
// sessionStorage が使えなければ unknown
export function detectVisitKind(session: SessionLike): VisitKind {
  const got = withStorage(() => session.getItem('t14-session-mark'));
  if (!got.ok) return 'unknown';
  const marked = got.value !== null;
  const set = withStorage(() => session.setItem('t14-session-mark', '1'));
  if (!set.ok) return 'unknown';
  return marked ? 'reload' : 'reopen';
}
