import { describe, expect, it } from 'vitest';
import { APP_VERSION, formatVersionLabel } from './version';

describe('formatVersionLabel', () => {
  it('版の番号の前に v を付ける', () => {
    expect(formatVersionLabel('1.2.3')).toBe('v1.2.3');
    expect(formatVersionLabel('0.0.0')).toBe('v0.0.0');
  });

  it('すでに v が付いていればそのままにする', () => {
    expect(formatVersionLabel('v1.2.3')).toBe('v1.2.3');
  });
});

describe('APP_VERSION', () => {
  it('ビルド時に埋め込まれた版の番号が x.y.z の形である', () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});
