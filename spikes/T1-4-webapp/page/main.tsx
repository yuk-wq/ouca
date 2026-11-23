import { render } from 'preact';
import { useState } from 'preact/hooks';
import {
  EMBED_SAMPLE,
  ORIGIN_CHOICES,
  detectVisitKind,
  nextVisit,
  readEmbedded,
  viewportFacts,
  withStorage,
  type VisitKind,
} from './probe';

// google.script.run は GAS の iframe の中でだけ使える
declare const google: any; // eslint-disable-line @typescript-eslint/no-explicit-any

// サーバーの関数を Promise にする（呼ぶ関数ごとに1つ）
function sendFact(
  scenario: string,
  origin: string,
  fact: string,
  value: string,
  detail: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    google.script.run
      .withSuccessHandler((v: string) => resolve(v))
      .withFailureHandler((e: Error) => reject(e))
      .recordFact(scenario, origin, fact, value, detail);
  });
}
function execProbe(origin: string): Promise<string> {
  return new Promise((resolve, reject) => {
    google.script.run
      .withSuccessHandler((v: string) => resolve(v))
      .withFailureHandler((e: Error) => reject(e))
      .probeExec(origin);
  });
}
function fetchPayload(kb: number): Promise<string> {
  return new Promise((resolve, reject) => {
    google.script.run
      .withSuccessHandler((v: string) => resolve(v))
      .withFailureHandler((e: Error) => reject(e))
      .getPayload(kb);
  });
}

// 開いた時点で、画面を読み込んだ印と、埋め込みの確かめを送る（開き方を選ぶ前でも動く）。
// 再読み込みか開き直しかも、ここで見分ける（sessionStorage の印を、この時点で付ける）
const visitKind: VisitKind = detectVisitKind(window.sessionStorage);
const startup: Promise<unknown> = (async () => {
  try {
    await sendFact('W2', '', 'module', '動いた', '');
    const embedded = readEmbedded(document) as { sample?: string } | null;
    const same = !!embedded && embedded.sample === EMBED_SAMPLE;
    await sendFact('W1', '', 'embed', JSON.stringify({ read: embedded !== null, same }), '');
  } catch {
    // 送れなければ、行が来ない
  }
})();

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('t14', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbVisit(now: string) {
  const db = await openDb();
  const prev = await new Promise<string | null>((resolve, reject) => {
    const r = db.transaction('kv').objectStore('kv').get('visit');
    r.onsuccess = () => resolve((r.result as string | undefined) ?? null);
    r.onerror = () => reject(r.error);
  });
  const v = nextVisit(prev, now);
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(v.value, 'visit');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return v;
}

function App() {
  const [origin, setOrigin] = useState(ORIGIN_CHOICES[0]!);
  const [lines, setLines] = useState<string[]>([]);
  const [probed, setProbed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [homeicon, setHomeicon] = useState('');
  const [cannotOrigin, setCannotOrigin] = useState(ORIGIN_CHOICES[0]!);
  const [cannotText, setCannotText] = useState('');
  const say = (s: string) => setLines((l) => [...l, s]);

  async function probe() {
    setBusy(true);
    try {
      await startup;
      const now = new Date().toISOString();
      const vp = viewportFacts(window);
      await sendFact('W3', origin, 'viewport', JSON.stringify(vp), '');
      await sendFact(
        'W3-html',
        origin,
        'viewport.html',
        JSON.stringify({ innerWidth: vp.innerWidth }),
        '',
      );
      say(`幅 ${vp.innerWidth}、端末の幅 ${vp.screenWidth}、倍率 ${vp.devicePixelRatio}`);

      const ls = withStorage(() => window.localStorage.getItem('t14-visit'));
      const lv = nextVisit(ls.ok ? ls.value : null, now);
      const lw = withStorage(() => window.localStorage.setItem('t14-visit', lv.value));
      await sendFact(
        'W4',
        origin,
        'storage.local',
        JSON.stringify({ had: lv.had, count: lv.prevCount, prevAt: lv.prevAt, wrote: lw.ok }),
        visitKind,
      );
      say(`localStorage: 前の値 ${lv.had ? 'あり' : 'なし'}、書けた ${lw.ok}、${visitKind}`);

      try {
        const iv = await idbVisit(now);
        await sendFact(
          'W4',
          origin,
          'storage.idb',
          JSON.stringify({ had: iv.had, count: iv.prevCount, prevAt: iv.prevAt, wrote: true }),
          visitKind,
        );
        say(`IndexedDB: 前の値 ${iv.had ? 'あり' : 'なし'}、${visitKind}`);
      } catch (err) {
        await sendFact(
          'W4',
          origin,
          'storage.idb',
          JSON.stringify({ had: false, count: 0, wrote: false, error: String(err) }),
          visitKind,
        );
        say('IndexedDB: 使えなかった');
      }

      say('exec: ' + (await execProbe(origin)));
      setProbed(true);
    } catch (err) {
      say('失敗: ' + String(err));
    }
    setBusy(false);
  }

  async function rtt() {
    setBusy(true);
    try {
      for (const kb of [5, 50, 200]) {
        const times: number[] = [];
        for (let i = 0; i < 5; i++) {
          const t0 = performance.now();
          await fetchPayload(kb);
          times.push(Math.round(performance.now() - t0));
        }
        await sendFact('W7', origin, 'rtt', JSON.stringify({ size: kb, times }), '');
        say(`往復 ${kb}KB: ${times.join('、')} ミリ秒`);
      }
    } catch (err) {
      say('失敗: ' + String(err));
    }
    setBusy(false);
  }

  async function note(fact: string, value: string) {
    try {
      await sendFact('', origin, fact, value, '');
      say(`控えを送った: ${fact}`);
    } catch (err) {
      say('失敗: ' + String(err));
    }
  }

  return (
    <main style="font:14px sans-serif;padding:8px">
      <h1 style="font-size:18px">T1-4 調べる画面</h1>
      <p>
        <label>
          どこから開いたか
          <select
            value={origin}
            disabled={probed}
            onChange={(e) => setOrigin((e.target as HTMLSelectElement).value)}
          >
            {ORIGIN_CHOICES.map((o) => (
              <option value={o}>{o}</option>
            ))}
          </select>
        </label>
      </p>
      <p>
        <button disabled={busy || probed} onClick={probe}>
          調べる（1回の読み込みにつき1回）
        </button>{' '}
        <button disabled={busy} onClick={rtt}>
          往復の時間を測る
        </button>
      </p>
      <h2 style="font-size:15px">控えを書く</h2>
      <p>
        画面の幅は端末に合って見えたか{' '}
        <button onClick={() => note('user.width', 'はい')}>はい</button>{' '}
        <button onClick={() => note('user.width', 'いいえ')}>いいえ</button>
      </p>
      <p>
        ホーム画面に追加したときのアイコン{' '}
        <input
          value={homeicon}
          onInput={(e) => setHomeicon((e.target as HTMLInputElement).value)}
        />{' '}
        <button onClick={() => note('user.homeicon', homeicon)}>送る</button>
      </p>
      <p>
        開けなかった開き方{' '}
        <select
          value={cannotOrigin}
          onChange={(e) => setCannotOrigin((e.target as HTMLSelectElement).value)}
        >
          {ORIGIN_CHOICES.map((o) => (
            <option value={o}>{o}</option>
          ))}
        </select>{' '}
        その画面の文言{' '}
        <input
          value={cannotText}
          onInput={(e) => setCannotText((e.target as HTMLInputElement).value)}
        />{' '}
        <button
          onClick={() =>
            note('user.cannotopen', JSON.stringify({ origin: cannotOrigin, text: cannotText }))
          }
        >
          送る
        </button>
      </p>
      <pre style="white-space:pre-wrap">{lines.join('\n')}</pre>
    </main>
  );
}

render(<App />, document.getElementById('app')!);
