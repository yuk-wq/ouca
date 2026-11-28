// T1-3 の検証コードのテスト用の偽物。GAS の API（SpreadsheetApp など）を、メモリの上で再現する。
// 呼ばれた順を calls に記録する。ダミーのデータだけを使う。
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

/* eslint-disable @typescript-eslint/no-explicit-any */

const GAS_DIR = resolve(__dirname, '../gas');
export const GAS_FILES = ['Images.js', 'Logic.js', 'Common.js', 'Menu.js', 'Triggers.js', 'Web.js'];

export const LOG = 'T1-3 検証ログ';
export const BEANS = 'T1-3 豆の表';
export const LIST = 'T1-3 _リスト';
export const ADMIN = 'T1-3 管理';
export const ITEMS = 'T1-3 項目';

function colToNum(s: string): number {
  let n = 0;
  for (const ch of s) n = n * 26 + ch.charCodeAt(0) - 64;
  return n;
}
function numToCol(n: number): string {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
function parseA1(a1: string): { row: number; col: number; nr: number; nc: number } {
  const m = a1.replace(/\$/g, '').match(/^([A-Z]+)(\d*)(?::([A-Z]+)(\d*))?$/);
  if (!m) throw new Error('A1 表記が読めない: ' + a1);
  const c1 = colToNum(m[1]!);
  const r1 = m[2] ? Number(m[2]) : 1;
  const c2 = m[3] ? colToNum(m[3]) : c1;
  const r2 = m[4] ? Number(m[4]) : m[3] ? (m[2] ? r1 : 1000) : r1;
  return { row: r1, col: c1, nr: r2 - r1 + 1, nc: c2 - c1 + 1 };
}

// 呼ばれたことのないメソッドは、何もせず自分を返す（見た目の設定など）
function lenient<T extends object>(target: T, calls: string[], label: string): T {
  return new Proxy(target, {
    get(t: any, p: string | symbol) {
      if (p in t || typeof p === 'symbol' || p === 'then') return t[p];
      return (..._args: unknown[]) => {
        calls.push(`${label}.${p}`);
        return proxyOf.get(t) ?? t;
      };
    },
  });
}
const proxyOf = new WeakMap<object, object>();
function make<T extends object>(target: T, calls: string[], label: string): T {
  const p = lenient(target, calls, label);
  proxyOf.set(target, p);
  return p;
}

export interface Opts {
  active?: string;
  effective?: string;
  owner?: string;
  multiMethod?: boolean;
  sheetsThrows?: string;
  url?: string;
  promptText?: string;
  // ui.prompt の答えを、呼ばれた順に返す（なければ promptText）
  promptTexts?: string[];
}

export function createWorld(opts: Opts = {}) {
  const o = {
    active: 'owner.dummy@example.com',
    effective: 'owner.dummy@example.com',
    owner: 'owner.dummy@example.com',
    multiMethod: false,
    sheetsThrows: '',
    url: 'https://script.google.com/macros/s/AKfycbDUMMYDEPLOYMENTID1234567890abcdef/exec',
    promptText: '1',
    promptTexts: [] as string[],
    ...opts,
  };
  const calls: string[] = [];
  const toasts: string[] = [];
  const alerts: string[] = [];
  const props = new Map<string, string>();
  const sheets = new Map<string, any>();
  const triggers: any[] = [];
  const menus: { name: string; items: [string, string][] }[] = [];
  const assigned: { fn: string }[] = [];
  const apiWrites: any[] = [];
  let nextSheetId = 100;
  let nextTriggerId = 1;
  let activeNull = false;
  const promptQueue = [...o.promptTexts];

  function makeValidation(apiRule: any, rangeObj: any) {
    return {
      apiRule,
      rangeObj,
      // getDataValidation().copy().build() で、同じ入力規則を作り直せる
      copy: () => {
        calls.push('validation.copy');
        return { build: () => makeValidation(apiRule, rangeObj) };
      },
      getCriteriaType: () => 'VALUE_IN_RANGE',
      getCriteriaValues: () => [rangeObj, true],
    };
  }

  function makeRange(sheet: any, row: number, col: number, nr: number, nc: number): any {
    const key = (r: number, c: number) => `${r},${c}`;
    const r: any = {
      getSheet: () => sheet,
      getRow: () => row,
      getColumn: () => col,
      getNumRows: () => nr,
      getNumColumns: () => nc,
      getA1Notation: () =>
        nr === 1 && nc === 1
          ? `${numToCol(col)}${row}`
          : `${numToCol(col)}${row}:${numToCol(col + nc - 1)}${row + nr - 1}`,
      getValue: () => r.getValues()[0][0],
      getValues: () => {
        const out: any[][] = [];
        for (let i = 0; i < nr; i++) {
          const line: any[] = [];
          for (let j = 0; j < nc; j++) {
            line.push(sheet.valueAt(row + i, col + j));
          }
          out.push(line);
        }
        return out;
      },
      setValue: (v: any) => {
        calls.push(`write:${sheet.name}!${r.getA1Notation()}`);
        for (let i = 0; i < nr; i++)
          for (let j = 0; j < nc; j++) sheet.cells.set(key(row + i, col + j), v);
        return r;
      },
      setValues: (vs: any[][]) => {
        calls.push(`write:${sheet.name}!${r.getA1Notation()}`);
        vs.forEach((line, i) => line.forEach((v, j) => sheet.cells.set(key(row + i, col + j), v)));
        return r;
      },
      setFormula: (f: string) => {
        calls.push(`write:${sheet.name}!${r.getA1Notation()}`);
        sheet.cells.set(key(row, col), f);
        return r;
      },
      clearContent: () => {
        for (let i = 0; i < nr; i++)
          for (let j = 0; j < nc; j++) sheet.cells.delete(key(row + i, col + j));
        return r;
      },
      clearDataValidations: () => {
        calls.push(`clearValidation:${sheet.name}!${r.getA1Notation()}`);
        for (let i = 0; i < nr; i++)
          for (let j = 0; j < nc; j++) sheet.validations.delete(key(row + i, col + j));
        return r;
      },
      setDataValidation: (rule: any) => {
        calls.push(`setValidation:${sheet.name}!${r.getA1Notation()}`);
        for (let i = 0; i < nr; i++)
          for (let j = 0; j < nc; j++) sheet.validations.set(key(row + i, col + j), rule);
        return r;
      },
      getDataValidation: () => {
        const k = key(row, col);
        if (sheet.throwingValidations.has(k)) throw new Error('getDataValidation が失敗した');
        if (sheet.hiddenValidations.has(k)) return null; // Apps Script からは読めず、REST では読める
        return sheet.validations.get(k) ?? null;
      },
      getDisplayValue: () => String(r.getValue()),
      setNumberFormat: (fmt: string) => {
        calls.push(`format:${sheet.name}!${r.getA1Notation()}:${fmt}`);
        sheet.formats.push({ a1: r.getA1Notation(), fmt });
        return r;
      },
      insertCheckboxes: () => r,
      copyTo: (dest: any, type: string) => {
        calls.push(`copyTo:${sheet.name}!${r.getA1Notation()}->${dest.getA1Notation()}:${type}`);
        if (type === 'PASTE_DATA_VALIDATION') {
          const rule = sheet.validations.get(key(row, col));
          for (let i = 0; i < dest.getNumRows(); i++)
            for (let j = 0; j < dest.getNumColumns(); j++) {
              const ds = dest.getSheet();
              const k = key(dest.getRow() + i, dest.getColumn() + j);
              if (rule) ds.validations.set(k, rule);
              else ds.validations.delete(k);
            }
        }
        return r;
      },
    };
    return make(r, calls, `range(${sheet.name})`);
  }

  function makeSheet(name: string): any {
    const s: any = {
      name,
      id: nextSheetId++,
      cells: new Map<string, any>(),
      validations: new Map<string, any>(),
      hiddenValidations: new Set<string>(),
      throwingValidations: new Set<string>(),
      formats: [] as { a1: string; fmt: string }[],
      images: [] as any[],
      valueAt(row: number, col: number) {
        // _リスト の A 列は、数式 VSTACK の結果（組み込みの候補 + 項目タブの項目名）を再現する
        const f = s.cells.get('1,1');
        if (name === LIST && col === 1 && typeof f === 'string' && f.startsWith('=VSTACK')) {
          const items = sheets.get(ITEMS);
          const names = ['果実', 'ナッツ'];
          if (items) {
            for (let r = 2; r <= 200; r++) {
              const v = items.cells.get(`${r},1`);
              if (v !== undefined && v !== '') names.push(String(v));
            }
          }
          return names[row - 1] ?? '';
        }
        const v = s.cells.get(`${row},${col}`);
        return v === undefined ? '' : v;
      },
      getName: () => name,
      getSheetId: () => s.id,
      getRange: (a: any, c?: number, nr?: number, nc?: number) => {
        if (typeof a === 'string') {
          const p = parseA1(a);
          return makeRange(s, p.row, p.col, p.nr, p.nc);
        }
        return makeRange(s, a, c!, nr ?? 1, nc ?? 1);
      },
      getLastRow: () => {
        let max = 0;
        for (const k of s.cells.keys()) max = Math.max(max, Number(k.split(',')[0]));
        return max;
      },
      appendRow: (values: any[]) => {
        calls.push(`appendRow:${name}`);
        const row = s.getLastRow() + 1;
        values.forEach((v, j) => s.cells.set(`${row},${j + 1}`, v));
      },
      getImages: () => s.images,
      insertImage: (_blob: any, col: number, row: number) => {
        const img: any = {
          col,
          row,
          script: '',
          assignScript: (fn: string) => {
            assigned.push({ fn });
            img.script = fn;
            return img;
          },
          remove: () => {},
        };
        s.images.push(img);
        return img;
      },
    };
    return make(s, calls, `sheet(${name})`);
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
    // Web アプリの中では null になる（activeNull を true にして再現する）
    getActiveSpreadsheet: () => (activeNull ? null : ss),
    getActive: () => (activeNull ? null : ss),
    openById: () => ss,
    flush: () => {
      calls.push('flush');
    },
    DataValidationCriteria: { VALUE_IN_RANGE: 'VALUE_IN_RANGE', VALUE_IN_LIST: 'VALUE_IN_LIST' },
    CopyPasteType: { PASTE_DATA_VALIDATION: 'PASTE_DATA_VALIDATION' },
    newDataValidation: () => {
      let range: any = null;
      let strict = false;
      const called: string[] = [];
      let multi = false;
      const b: any = {
        requireValueInRange(r: any) {
          range = r;
          return b;
        },
        setAllowInvalid(v: boolean) {
          strict = !v;
          return b;
        },
        build() {
          const rule: any = {
            condition: {
              type: 'ONE_OF_RANGE',
              values: [
                { userEnteredValue: `='${range.getSheet().name}'!${range.getA1Notation()}` },
              ],
            },
            strict,
            showCustomUi: true,
          };
          if (multi) rule.multiSelect = true;
          return makeValidation(rule, range);
        },
      };
      if (o.multiMethod) {
        b.setMultiSelect = (flag: boolean) => {
          called.push('setMultiSelect');
          multi = flag;
          return b;
        };
      }
      return b;
    },
    newCellImage: () => {
      const img: any = { url: '' };
      const b: any = {
        setSourceUrl: (u: string) => {
          img.url = u;
          return b;
        },
        setAltTextTitle: () => b,
        setAltTextDescription: () => b,
        build: () => img,
      };
      return b;
    },
    getUi: () => ({
      ButtonSet: { OK_CANCEL: 'OK_CANCEL' },
      Button: { OK: 'OK', CANCEL: 'CANCEL' },
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
      prompt: () => {
        const text = promptQueue.length > 0 ? promptQueue.shift()! : o.promptText;
        return { getSelectedButton: () => 'OK', getResponseText: () => text };
      },
      alert: (msg: string) => {
        alerts.push(String(msg));
      },
    }),
  };

  const Session: any = {
    getActiveUser: () => ({ getEmail: () => o.active }),
    getEffectiveUser: () => ({ getEmail: () => o.effective }),
    getScriptTimeZone: () => 'Asia/Tokyo',
  };

  function makeTrigger(fn: string, source: string, type: string) {
    const t: any = {
      fn,
      id: `trigger-id-${1000 + nextTriggerId++}`,
      getHandlerFunction: () => fn,
      getUniqueId: () => t.id,
      getEventType: () => type,
      getTriggerSource: () => source,
    };
    triggers.push(t);
    return t;
  }
  const ScriptApp: any = {
    getProjectTriggers: () => triggers.slice(),
    deleteTrigger: (t: any) => {
      calls.push(`deleteTrigger:${t.fn}`);
      const i = triggers.indexOf(t);
      if (i >= 0) triggers.splice(i, 1);
    },
    newTrigger: (fn: string) => {
      let source = 'CLOCK';
      let type = 'CLOCK';
      const b: any = {
        forSpreadsheet: () => {
          source = 'SPREADSHEETS';
          return b;
        },
        onEdit: () => {
          type = 'ON_EDIT';
          return b;
        },
        onChange: () => {
          type = 'ON_CHANGE';
          return b;
        },
        timeBased: () => b,
        after: () => b,
        create: () => {
          calls.push(`createTrigger:${fn}`);
          return makeTrigger(fn, source, type);
        },
      };
      return b;
    },
    getService: () => ({ getUrl: () => o.url, isEnabled: () => true }),
    getOAuthToken: () => 'dummy-token',
    // テストの準備用: トリガーを直接足す
    __add: makeTrigger,
  };

  const PropertiesService = {
    getScriptProperties: () => ({
      getProperty: (k: string) => props.get(k) ?? null,
      setProperty: (k: string, v: string) => {
        props.set(k, v);
      },
    }),
  };

  function readApiRule(sheetName: string, a1: string) {
    const sh = sheets.get(sheetName);
    if (!sh) return null;
    const p = parseA1(a1);
    return sh.validations.get(`${p.row},${p.col}`)?.apiRule ?? null;
  }
  const Sheets: any = {
    Spreadsheets: {
      get: (_id: string, params: any) => {
        const spec = String(params.ranges[0]).replace(/'/g, '');
        calls.push('Sheets.get:' + spec);
        if (o.sheetsThrows) throw new Error(o.sheetsThrows);
        const [sheetName, a1] = spec.split('!');
        const rule = readApiRule(sheetName!, a1!);
        if (!rule) return { sheets: [{ data: [{}] }] };
        return { sheets: [{ data: [{ rowData: [{ values: [{ dataValidation: rule }] }] }] }] };
      },
      batchUpdate: (body: any) => {
        calls.push('Sheets.batchUpdate');
        if (o.sheetsThrows) throw new Error(o.sheetsThrows);
        apiWrites.push(body);
        for (const req of body.requests) {
          const sv = req.setDataValidation;
          if (!sv) continue;
          for (const sh of sheets.values()) {
            if (sh.id !== sv.range.sheetId) continue;
            for (let r = sv.range.startRowIndex; r < sv.range.endRowIndex; r++)
              for (let c = sv.range.startColumnIndex; c < sv.range.endColumnIndex; c++) {
                sh.validations.set(`${r + 1},${c + 1}`, makeValidation(sv.rule, null));
              }
          }
        }
        return {};
      },
    },
  };

  const Utilities = {
    formatDate: (_d: Date, _tz: string, fmt: string) =>
      fmt === 'HHmmss' ? '090000' : '2026-01-01 09:00:00',
    base64Encode: (s: string) => Buffer.from(s).toString('base64'),
    base64Decode: (s: string) => Array.from(Buffer.from(s, 'base64')),
    newBlob: (bytes: any, type: string, name: string) => ({ bytes, type, name }),
    computeDigest: () => [1, 2, 3, 4],
    DigestAlgorithm: { SHA_256: 1 },
    Charset: { UTF_8: 1 },
  };

  const html: string[] = [];
  const HtmlService = {
    createTemplateFromFile: (name: string) => {
      const t: any = {
        evaluate: () => {
          html.push(name + ':' + String(t.infoJson ?? ''));
          const out: any = {
            setTitle: () => out,
            addMetaTag: () => out,
          };
          return out;
        },
      };
      return t;
    },
  };

  const injected: Record<string, any> = {
    SpreadsheetApp,
    Session,
    ScriptApp,
    PropertiesService,
    Sheets,
    Utilities,
    HtmlService,
    console,
  };

  function load(): any {
    const ctx = vm.createContext({ ...injected });
    for (const f of GAS_FILES) {
      const p = resolve(GAS_DIR, f);
      if (!existsSync(p)) continue; // Logic.js がまだない間は、読み込まない
      vm.runInContext(readFileSync(p, 'utf8'), ctx, { filename: f });
    }
    return ctx;
  }

  function sheetOf(name: string): any {
    return sheets.get(name);
  }
  // テストの準備: シートがなければ作る
  function ensure(name: string): any {
    return sheets.get(name) ?? ss.insertSheet(name);
  }
  function logRows(): string[][] {
    const sh = sheets.get(LOG);
    if (!sh) return [];
    const out: string[][] = [];
    for (let r = 2; r <= sh.getLastRow(); r++) {
      out.push([1, 2, 3, 4, 5, 6].map((c) => String(sh.valueAt(r, c))));
    }
    return out;
  }

  return {
    opts: o,
    calls,
    toasts,
    alerts,
    props,
    sheets,
    triggers,
    menus,
    assigned,
    apiWrites,
    html,
    ss,
    injected,
    load,
    sheetOf,
    // Apps Script の getDataValidation() が null を返す、または例外を投げるセルにする（REST では読める）
    breakValidationRead: (sheetName: string, a1: string, mode: 'null' | 'throw') => {
      const sh = sheets.get(sheetName);
      const p = parseA1(a1);
      (mode === 'null' ? sh.hiddenValidations : sh.throwingValidations).add(`${p.row},${p.col}`);
    },
    setActiveNull: (b: boolean) => {
      activeNull = b;
    },
    ensure,
    logRows,
    readApiRule,
    makeValidation,
  };
}

// vm の外の値として比べやすくする
export function plain<T>(v: T): T {
  return JSON.parse(JSON.stringify(v ?? null));
}
