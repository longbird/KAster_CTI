import { describe, expect, it } from 'vitest';
import { formatUptime } from './systemVersion';

describe('formatUptime', () => {
  it('일/시/분 단위로 끊어서 표시한다', () => {
    expect(formatUptime(0)).toBe('0분');
    expect(formatUptime(59)).toBe('0분');
    expect(formatUptime(60)).toBe('1분');
    expect(formatUptime(3_723)).toBe('1시간 2분');
    expect(formatUptime(90_061)).toBe('1일 1시간 1분');
  });

  it('값이 없거나 음수면 표시하지 않는다', () => {
    expect(formatUptime(undefined)).toBe('-');
    expect(formatUptime(null)).toBe('-');
    expect(formatUptime(-1)).toBe('-');
    expect(formatUptime(Number.NaN)).toBe('-');
  });
});
