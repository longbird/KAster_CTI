import { describe, expect, it } from 'vitest';
import { computeCoverageRate, formatChangeRate } from './insightFormat';

describe('formatChangeRate', () => {
  it('직전 구간에 없던 키워드는 신규로 쓴다', () => {
    expect(formatChangeRate(null)).toBe('신규');
  });

  it('비율을 퍼센트로 반올림한다', () => {
    expect(formatChangeRate(5)).toBe('+500%');
    expect(formatChangeRate(0.333)).toBe('+33%');
  });

  it('0 은 신규가 아니라 +0% 다', () => {
    expect(formatChangeRate(0)).toBe('+0%');
  });
});

describe('computeCoverageRate', () => {
  it('분석 건수를 전체 통화로 나눈다', () => {
    expect(computeCoverageRate(90, 120)).toBe(0.75);
  });

  it('통화가 없으면 비율을 낼 수 없다', () => {
    expect(computeCoverageRate(0, 0)).toBeNull();
  });

  it('1 을 넘지 않는다', () => {
    expect(computeCoverageRate(150, 100)).toBe(1);
  });
});
