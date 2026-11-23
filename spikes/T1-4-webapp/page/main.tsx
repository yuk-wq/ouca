import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import {
  ACCOUNT_CHOICES,
  INITIAL_ACCOUNT,
  INITIAL_ORIGIN,
  ORIGIN_CHOICES,
  buildOf,
  buildSource,
  canStartProbe,
  canProbe,
  canSendAccount,
  cannotopenFact,
  detectVisitKind,
  embedFact,
  isPhoneOrigin,
  moduleFact,
  nextVisit,
  noteFact,
  originHash,
  readEmbedded,
  readVia,
  rttFact,
  storageFact,
  toRow,
  viaNotice,
  viewportRows,
  withStorage,
  type Fact,
  type Via,
  type VisitKind,
} from './probe';

// google.script.run は GAS の iframe の中でだけ使える
declare const google: any; // eslint-disable-line @typescript-eslint/no-explicit-any

// サーバーの関数を Promise にする（呼ぶ関数ごとに1つ）
function sendFact(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    google.script.run
      .withSuccessHandler((v: string) => resolve(v))
      .withFailureHandler((e: Error) => reject(e))
      .recordFact(...args);
  });
}
function execProbe(origin: string, via: Via, build: string): Promise<string> {
  return new Promise((resolve, reject) => {
    google.script.run
      .withSuccessHandler((v: string) => resolve(v))
      .withFailureHandler((e: Error) => reject(e))
      .probeExec(origin, via, build);
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
// URL の引数 via（/exec?via=exec、/dev?via=dev）を読む。読めなければ none
function loadVia(): Promise<Via> {
  return new Promise((resolve) => {
    try {
      google.script.url.getLocation((loc: unknown) => resolve(readVia(loc as never)));
    } catch {
      resolve('none');
    }
  });
}

// 開いた時点で、最初に module の行を送る（保存や sessionStorage に触る前）。
// 埋め込みの確かめがその次。ビルドの印は、埋め込みの JSON から読んで送り返す
const embedded = readEmbedded(document);
const build = buildOf(document);
const ua = navigator.userAgent;
const sendRow = (fact: Fact, origin: string) => sendFact(toRow(fact, origin, build, ua));

const startup: Promise<VisitKind> = (async () => {
  try {
    await sendRow(moduleFact(buildSource(document)), '');
    await sendRow(embedFact(embedded), '');
  } catch {
    // 送れなければ、行が来ない
  }
  // 再読み込みか開き直しかは、ここで見分ける（sessionStorage の印を、この読み込みで付ける）
  return detectVisitKind(() => window.sessionStorage);
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

function OriginSelect(props: { value: string; disabled?: boolean; onChange: (v: string) => void }) {
  return (
    <select
      value={props.value}
      disabled={props.disabled}
      onChange={(e) => props.onChange((e.target as HTMLSelectElement).value)}
    >
      <option value="">選んでください</option>
      {ORIGIN_CHOICES.map((o) => (
        <option value={o}>{o}</option>
      ))}
    </select>
  );
}

function App() {
  const [origin, setOrigin] = useState(INITIAL_ORIGIN);
  const [via, setVia] = useState<Via | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const [probed, setProbed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [homeicon, setHomeicon] = useState('');
  const [account, setAccount] = useState(INITIAL_ACCOUNT);
  const [cannotOrigin, setCannotOrigin] = useState(INITIAL_ORIGIN);
  const [cannotState, setCannotState] = useState<'cannot' | 'failed'>('cannot');
  const [cannotText, setCannotText] = useState('');
  const say = (s: string) => setLines((l) => [...l, s]);
  useEffect(() => {
    loadVia().then(setVia);
  }, []);
  const notice = via === null ? '' : viaNotice(via);
  const ready = canProbe(origin);

  async function probe() {
    setBusy(true);
    try {
      const kind = await startup;
      const useVia: Via = via ?? 'none';
      const now = new Date().toISOString();
      const rows = viewportRows(window);
      for (const f of rows) await sendRow(f, origin);
      say(`幅 ${window.innerWidth}、端末の幅 ${window.screen.width}`);

      const hash = originHash(window.location.origin);
      const where = { hash, via: useVia };
      const ls = withStorage(() => window.localStorage.getItem('t14-visit'));
      const lv = nextVisit(ls.ok ? ls.value : null, now);
      const lw = withStorage(() => window.localStorage.setItem('t14-visit', lv.value));
      await sendRow(storageFact('local', lv, kind, lw.ok, where), origin);
      say(`localStorage: 前の値 ${lv.had ? 'あり' : 'なし'}、書けた ${lw.ok}、${kind}`);

      try {
        const iv = await idbVisit(now);
        await sendRow(storageFact('idb', iv, kind, true, where), origin);
        say(`IndexedDB: 前の値 ${iv.had ? 'あり' : 'なし'}、${kind}`);
      } catch {
        await sendRow(storageFact('idb', nextVisit(null, now), kind, false, where), origin);
        say('IndexedDB: 使えなかった');
      }

      say('exec: ' + (await execProbe(origin, useVia, build)));
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
        await sendRow(rttFact(kb, times), origin);
        say(`往復 ${kb}KB: ${times.join('、')} ミリ秒`);
      }
    } catch (err) {
      say('失敗: ' + String(err));
    }
    setBusy(false);
  }

  async function note(fact: Fact) {
    try {
      await sendRow(fact, origin);
      say(`控えを送った: ${fact.fact}`);
    } catch (err) {
      say('失敗: ' + String(err));
    }
  }

  return (
    <main style="font:14px sans-serif;padding:8px">
      {notice && <p style="background:#c00;color:#fff;padding:8px;font-weight:bold">{notice}</p>}
      <h1 style="font-size:18px">T1-4 調べる画面</h1>
      <p>
        どこから開いたか <OriginSelect value={origin} disabled={probed} onChange={setOrigin} />
      </p>
      <p>
        <button disabled={busy || probed || !canStartProbe(origin, via)} onClick={probe}>
          調べる（1回の読み込みにつき1回）
        </button>{' '}
        <button disabled={busy || !ready} onClick={rtt}>
          往復の時間を測る
        </button>
      </p>
      <h2 style="font-size:15px">控えを書く</h2>
      <p>
        画面の幅は端末に合って見えたか{' '}
        <button disabled={!ready} onClick={() => note(noteFact('user.width', 'はい'))}>
          はい
        </button>{' '}
        <button disabled={!ready} onClick={() => note(noteFact('user.width', 'いいえ'))}>
          いいえ
        </button>
      </p>
      {isPhoneOrigin(origin) && (
        <p>
          このブラウザでログインしているアカウント{' '}
          <select
            value={account}
            onChange={(e) => setAccount((e.target as HTMLSelectElement).value)}
          >
            <option value="">選んでください</option>
            {ACCOUNT_CHOICES.map((a) => (
              <option value={a}>{a}</option>
            ))}
          </select>{' '}
          <button
            disabled={!canSendAccount(origin, account)}
            onClick={() => note(noteFact('user.account', account))}
          >
            送る
          </button>
        </p>
      )}
      <p>
        ホーム画面に追加したときのアイコン{' '}
        <input
          value={homeicon}
          onInput={(e) => setHomeicon((e.target as HTMLInputElement).value)}
        />{' '}
        <button disabled={!ready} onClick={() => note(noteFact('user.homeicon', homeicon))}>
          送る
        </button>
      </p>
      <p>
        開けなかった開き方 <OriginSelect value={cannotOrigin} onChange={setCannotOrigin} /> 様子{' '}
        <select
          value={cannotState}
          onChange={(e) =>
            setCannotState((e.target as HTMLSelectElement).value as 'cannot' | 'failed')
          }
        >
          <option value="cannot">開けなかった</option>
          <option value="failed">画面は出たが失敗と出た</option>
        </select>{' '}
        その画面の文言{' '}
        <input
          value={cannotText}
          onInput={(e) => setCannotText((e.target as HTMLInputElement).value)}
        />{' '}
        <button
          disabled={!ready || !canProbe(cannotOrigin)}
          onClick={() => note(cannotopenFact(cannotOrigin, cannotState, cannotText))}
        >
          送る
        </button>
      </p>
      <pre style="white-space:pre-wrap">{lines.join('\n')}</pre>
    </main>
  );
}

render(<App />, document.getElementById('app')!);
