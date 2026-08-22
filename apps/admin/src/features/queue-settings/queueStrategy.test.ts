import { describe, expect, it } from 'vitest';
import {
  QUEUE_STRATEGY_OPTIONS,
  getQueueStrategyLabel,
  getUnconditionalTargetTypeLabel,
} from './queueStrategy';

describe('QUEUE_STRATEGY_OPTIONS', () => {
  it('동시 호출을 고를 수 있다', () => {
    expect(QUEUE_STRATEGY_OPTIONS).toContainEqual({
      value: 'ringall',
      label: '동시 호출(먼저 받는 상담원)',
    });
  });

  it('저장된 동시 호출 전략을 운영자 라벨로 보여준다', () => {
    expect(getQueueStrategyLabel('ringall')).toBe('동시 호출(먼저 받는 상담원)');
  });
});

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
