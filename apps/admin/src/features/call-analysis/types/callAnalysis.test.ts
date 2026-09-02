import { describe, expect, it } from 'vitest';
import { formatSegmentTime } from './callAnalysis';

describe('formatSegmentTime', () => {
  it('0ms 는 0:00', () => {
    expect(formatSegmentTime(0)).toBe('0:00');
  });

  it('초를 두 자리로 채운다', () => {
    expect(formatSegmentTime(5000)).toBe('0:05');
  });

  it('분 단위로 넘어간다', () => {
    expect(formatSegmentTime(65000)).toBe('1:05');
    expect(formatSegmentTime(600000)).toBe('10:00');
  });

  it('1초 미만은 버린다', () => {
    expect(formatSegmentTime(999)).toBe('0:00');
  });

  it('음수와 NaN 은 0:00 으로 본다', () => {
    expect(formatSegmentTime(-1)).toBe('0:00');
    expect(formatSegmentTime(Number.NaN)).toBe('0:00');
  });
});
