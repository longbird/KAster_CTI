import { describe, expect, it } from 'vitest';
import { getUnconditionalTargetTypeLabel } from './queueStrategy';

describe('getUnconditionalTargetTypeLabel', () => {
  it('무조건 착신 대상 유형을 운영자 라벨로 변환한다', () => {
    expect(getUnconditionalTargetTypeLabel('AGENT')).toBe('상담원');
    expect(getUnconditionalTargetTypeLabel('QUEUE')).toBe('분배룰');
    expect(getUnconditionalTargetTypeLabel('EXTERNAL_NUMBER')).toBe('외부번호');
  });

  it('대상 유형이 비어 있으면 대시로 표시한다', () => {
    expect(getUnconditionalTargetTypeLabel(null)).toBe('-');
  });
});
