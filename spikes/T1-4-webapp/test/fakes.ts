// T1-4 の検証コードのテスト用の偽物。GAS の API（SpreadsheetApp、HtmlService など）をメモリの上で再現する。
// ダミーのデータだけを使う。
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

/* eslint-disable @typescript-eslint/no-explicit-any */

export const GAS_DIR = resolve(import.meta.dirname, '../gas');
export const GAS_FILES = ['Logic.js', 'Code.js'];

export const LOG = 'T1-4 検証ログ';
export const SUMMARY = 'T1-4 まとめ';

export interface Opts {
  active?: string;
  effective?: string;
  owner?: string;
  url?: string;
  // createHtmlOutputFromFile('Page').getContent() が返す HTML
  pageHtml?: string;
  // addMetaTag が例外を出す名前（'*' は全部）と、その文言
  metaThrows?: string[];
  metaMessage?: string;
  faviconThrows?: string;
}

function colToNum(s: string): number {
  let n = 0;
  for (const ch of s) n = n * 26 + ch.charCodeAt(0) - 64;
  return n;
}
function parseA1(a1: string): { row: number; col: number; nr: number; nc: number } {
  const whole = a1.match(/^([A-Z]+):([A-Z]+)$/);
  if (whole) {
    const c1 = colToNum(whole[1]!);
    return { row: 1, col: c1, nr: 1000, nc: colToNum(whole[2]!) - c1 + 1 };
  }
  const m = a1.match(/^([A-Z]+)(\d+)$/);
  if (!m) throw new Error('A1 表記が読めない: ' + a1);
  return { row: Number(m[2]), col: colToNum(m[1]!), nr: 1, nc: 1 };
}

// 偽物に書いていないメソッド（見た目の設定など）は、何もせず自分を返す
function lenient<T extends object>(target: T): T {
  const self: any = new Proxy(target, {
    get(t: any, p: string | symbol) {
      if (p in t || typeof p === 'symbol' || p === 'then') return t[p];
      return () => self;
    },
  });
  return self;
}

export function createWorld(opts: Opts = {}) {
  const o = {
    active: 'owner.dummy@example.com',
    effective: 'owner.dummy@example.com',
    owner: 'owner.dummy@example.com',
    url: 'https://script.google.com/macros/s/AKfycbDUMMYDEPLOYMENTID1234567890abcdef/exec',
    pageHtml:
      '<html><body><script type="application/json" id="embed">__PLACEHOLDER__</script></body></html>',
    metaThrows: [] as string[],
    metaMessage: 'The attribute is not allowed',
    faviconThrows: '',
    ...opts,
  };
  const calls: string[] = [];
  const toasts: string[] = [];
  const props = new Map<string, string>();
  const sheets = new Map<string, any>();
  const menus: { name: string; items: [string, string][] }[] = [];
  const outputs: any[] = [];
  // 書式なしテキストにする前に、= で始まる文字列を書いたセル
  const formulaCells: string[] = [];
  let activeNull = false;

  function makeRange(
    sheet: any,
    row: number,
    col: number,
    nr: number,
    nc: number,
    a1: string,
  ): any {
    const key = (r: number, c: number) => `${r},${c}`;
    const write = (r: number, c: number, v: any) => {
      if (typeof v === 'string' && v.startsWith('=') && !sheet.textCols.has(c)) {
        formulaCells.push(`${sheet.name}!${r},${c}`);
      }
      sheet.cells.set(key(r, c), v);
    };
    const r: any = {
      getValues: () => {
        const out: any[][] = [];
        for (let i = 0; i < nr; i++) {
          const line: any[] = [];
          for (let j = 0; j < nc; j++) line.push(sheet.valueAt(row + i, col + j));
          out.push(line);
        }
        return out;
      },
      getValue: () => sheet.valueAt(row, col),
      setValues: (vs: any[][]) => {
        calls.push(`write:${sheet.name}!${a1}`);
        vs.forEach((line, i) => line.forEach((v, j) => write(row + i, col + j, v)));
        return r;
      },
      setValue: (v: any) => {
        calls.push(`write:${sheet.name}!${a1}`);
        write(row, col, v);
        return r;
      },
      setNumberFormat: (fmt: string) => {
        calls.push(`format:${sheet.name}!${a1}:${fmt}`);
        if (fmt === '@') for (let j = 0; j < nc; j++) sheet.textCols.add(col + j);
        return r;
      },
      clearContent: () => {
        for (let i = 0; i < nr; i++)
          for (let j = 0; j < nc; j++) sheet.cells.delete(key(row + i, col + j));
        return r;
      },
    };
    return lenient(r);
  }

  function makeSheet(name: string): any {
    const s: any = {
      name,
      cells: new Map<string, any>(),
      textCols: new Set<number>(),
      valueAt: (row: number, col: number) => s.cells.get(`${row},${col}`) ?? '',
      getName: () => name,
      getRange: (a: any, c?: number, nr?: number, nc?: number) => {
        if (typeof a === 'string') {
          const p = parseA1(a);
          return makeRange(s, p.row, p.col, p.nr, p.nc, a);
        }
        return makeRange(s, a, c!, nr ?? 1, nc ?? 1, `R${a}C${c}`);
      },
      getLastRow: () => {
        let max = 0;
        for (const k of s.cells.keys()) max = Math.max(max, Number(k.split(',')[0]));
        return max;
      },
      appendRow: (values: any[]) => {
        calls.push(`appendRow:${name}`);
        const row = s.getLastRow() + 1;
        values.forEach((v, j) => {
          if (typeof v === 'string' && v.startsWith('=') && !s.textCols.has(j + 1)) {
            formulaCells.push(`${name}!${row},${j + 1}`);
          }
          s.cells.set(`${row},${j + 1}`, v);
        });
      },
      clearContents: () => {
        s.cells.clear();
        return s;
      },
    };
    return lenient(s);
  }

  const ss: any = {
    getId: () => 'DUMMY_SPREADSHEET_ID',
    getSheetByName: (n: string) => sheets.get(n) ?? null,
    insertSheet: (n: string) => {
      const sh = makeSheet(n);
      sheets.set(n, sh);
      return sh;
    },
    getOwner: () => ({ getEmail: () => o.owner }),
    toast: (msg: string) => {
      toasts.push(String(msg));
    },
  };

  const SpreadsheetApp: any = {
    // Web アプリの中では null になる（setActiveNull(true) で再現する）
    getActiveSpreadsheet: () => (activeNull ? null : ss),
    openById: () => ss,
    flush: () => {},
    getUi: () => ({
      createMenu: (name: string) => {
        const m = { name, items: [] as [string, string][] };
        menus.push(m);
        const b: any = {
          addItem: (label: string, fn: string) => {
            m.items.push([label, fn]);
            return b;
          },
          addSeparator: () => b,
          addToUi: () => b,
        };
        return b;
      },
      prompt: () => ({ getSelectedButton: () => 'OK', getResponseText: () => '1' }),
      alert: () => {},
      ButtonSet: { OK_CANCEL: 'OK_CANCEL' },
      Button: { OK: 'OK', CANCEL: 'CANCEL' },
    }),
  };

  const Session: any = {
    getActiveUser: () => ({ getEmail: () => o.active }),
    getEffectiveUser: () => ({ getEmail: () => o.effective }),
    getScriptTimeZone: () => 'Asia/Tokyo',
  };
  const ScriptApp: any = {
    getService: () => ({ getUrl: () => o.url, isEnabled: () => true }),
  };
  const PropertiesService = {
    getScriptProperties: () => ({
      getProperty: (k: string) => props.get(k) ?? null,
      setProperty: (k: string, v: string) => {
        props.set(k, v);
      },
    }),
  };
  const Utilities = {
    formatDate: () => '2026-01-01 09:00:00',
  };
  const HtmlService = {
    createHtmlOutputFromFile: (name: string) => {
      calls.push('readHtml:' + name);
      return { getContent: () => o.pageHtml };
    },
    createHtmlOutput: (html: string) => {
      const out: any = {
        html,
        title: '',
        metas: [] as [string, string][],
        favicon: null as string | null,
        setTitle: (t: string) => {
          out.title = t;
          return out;
        },
        addMetaTag: (n: string, c: string) => {
          out.metas.push([n, c]);
          if (o.metaThrows.includes('*') || o.metaThrows.includes(n))
            throw new Error(o.metaMessage);
          return out;
        },
        setFaviconUrl: (u: string) => {
          out.favicon = u;
          if (o.faviconThrows) throw new Error(o.faviconThrows);
          return out;
        },
        getContent: () => html,
      };
      outputs.push(out);
      return out;
    },
  };

  // 書き込みの順番を確かめるための、ロックの偽物
  const LockService = {
    getScriptLock: () => ({
      waitLock: () => {
        calls.push('lock.wait');
      },
      releaseLock: () => {
        calls.push('lock.release');
      },
    }),
  };

  const injected: Record<string, any> = {
    LockService,
    SpreadsheetApp,
    Session,
    ScriptApp,
    PropertiesService,
    Utilities,
    HtmlService,
    console,
  };

  function load(): any {
    const ctx = vm.createContext({ ...injected });
    for (const f of GAS_FILES) {
      const p = resolve(GAS_DIR, f);
      if (!existsSync(p)) continue; // 実装の前は、読み込めるファイルがない
      vm.runInContext(readFileSync(p, 'utf8'), ctx, { filename: f });
    }
    return ctx;
  }

  // ログのタブの行（見出しを除く）を、7列（日時、シナリオ、開き方、事実、値、詳細、ビルドの印）の文字列の配列にする
  function logRows(): string[][] {
    const sh = sheets.get(LOG);
    if (!sh) return [];
    const out: string[][] = [];
    for (let r = 2; r <= sh.getLastRow(); r++) {
      out.push([1, 2, 3, 4, 5, 6, 7].map((c) => String(sh.valueAt(r, c))));
    }
    return out;
  }

  return {
    opts: o,
    calls,
    toasts,
    props,
    sheets,
    menus,
    outputs,
    formulaCells,
    ss,
    injected,
    load,
    logRows,
    sheetOf: (n: string) => sheets.get(n),
    setActiveNull: (b: boolean) => {
      activeNull = b;
    },
  };
}

// vm の外の値として比べやすくする
export function plain<T>(v: T): T {
  return JSON.parse(JSON.stringify(v ?? null));
}
