import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const dist = resolve(__dirname, '../dist');

describe('dist/', () => {
  it('Code.js、index.html、appsscript.json の3つだけがある', () => {
    expect(readdirSync(dist).sort()).toEqual(['Code.js', 'appsscript.json', 'index.html']);
  });

  it('index.html は外部の JS と CSS を読まない', () => {
    const html = readFileSync(resolve(dist, 'index.html'), 'utf8');
    expect(html).not.toMatch(/<script[^>]*\ssrc=/i);
    expect(html).not.toMatch(/<link[^>]*rel=["']?stylesheet/i);
    expect(html).not.toMatch(/<link[^>]*rel=["']?modulepreload/i);
  });

  it('共通コード（formatVersionLabel）が画面とサーバーの両方に入っている', () => {
    // 関数名は縮小で変わるので、出力する文字列（版の接頭辞）で確かめる。
    const html = readFileSync(resolve(dist, 'index.html'), 'utf8');
    const code = readFileSync(resolve(dist, 'Code.js'), 'utf8');
    expect(html).toMatch(/startsWith\(["'`]v["'`]\)/);
    expect(code).toMatch(/formatVersionLabel/);
  });
});
