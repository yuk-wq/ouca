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

// 開き方の一覧（DESIGN.md §2 の箇条書きの文言そのまま）
export const ORIGIN_LIST: string[] = (() => {
  const list = section.split('開き方の一覧')[1]!.split('\n\n')[1]!;
  return list
    .split('\n')
    .filter((l) => l.startsWith('- '))
    .map((l) => l.slice(2).trim());
})();

export const O = {
  pcA: ORIGIN_LIST[0]!,
  pcAB: ORIGIN_LIST[1]!,
  pcB: ORIGIN_LIST[2]!,
  pcIncog: ORIGIN_LIST[3]!,
  iphoneSafari: ORIGIN_LIST[4]!,
  iphoneLine: ORIGIN_LIST[5]!,
  androidChrome: ORIGIN_LIST[6]!,
  androidLine: ORIGIN_LIST[7]!,
};
