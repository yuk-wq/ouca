// DESIGN.md の §2（判定の表と開き方の一覧）を読む。テストの期待値を、DESIGN.md から決めるため。
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const md = readFileSync(resolve(import.meta.dirname, '../DESIGN.md'), 'utf8');
const section = md.split('## 2. 判定の表')[1]!.split('\n## 3.')[0]!;

export interface DesignVerdict {
  scenario: string;
  verdict: string;
  impact: string;
}

export function designVerdicts(): DesignVerdict[] {
  const out: DesignVerdict[] = [];
  let scenario = '';
  for (const line of section.split('\n')) {
    if (!line.startsWith('|')) continue;
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim());
    if (cells.length < 4 || cells[0] === 'シナリオ' || /^-+$/.test(cells[0]!)) continue;
    if (cells[0]) scenario = cells[0].match(/^(W\d+(?:-html)?)/)?.[1] ?? '';
    out.push({ scenario, verdict: cells[1]!, impact: cells[3]! });
  }
  return out;
}

export function designImpact(scenario: string, verdict: string): string {
  const hit = designVerdicts().find((v) => v.scenario === scenario && v.verdict === verdict);
  if (!hit) throw new Error(`DESIGN.md の表に ${scenario} / ${verdict} がない`);
  return hit.impact;
}

// 開き方の一覧（DESIGN.md §2 の表の1列目の文言そのまま。2列目が「お客さん」の印）
const originRows = (() => {
  const table = section.split('開き方の一覧')[1]!.split('\n\n')[1]!;
  return table
    .split('\n')
    .filter((l) => l.startsWith('|'))
    .map((l) =>
      l
        .split('|')
        .slice(1, -1)
        .map((c) => c.trim()),
    )
    .filter((c) => c[0] !== '開き方' && !/^-+$/.test(c[0]!));
})();
export const ORIGIN_LIST: string[] = originRows.map((c) => c[0]!);
export const CUSTOMER_LIST: string[] = originRows
  .filter((c) => c[1] === 'お客さん')
  .map((c) => c[0]!);

export const O = {
  pcA: ORIGIN_LIST[0]!,
  pcB: ORIGIN_LIST[1]!,
  pcBA: ORIGIN_LIST[2]!,
  pcIncog: ORIGIN_LIST[3]!,
  iphoneSafari: ORIGIN_LIST[4]!,
  iphoneLine: ORIGIN_LIST[5]!,
  iphoneHome: ORIGIN_LIST[6]!,
  androidChrome: ORIGIN_LIST[7]!,
  androidLine: ORIGIN_LIST[8]!,
};
