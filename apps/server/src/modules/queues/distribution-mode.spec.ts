import {
  isDistributionMode,
  normalizeUnconditionalTarget,
  resolveQueueStrategy,
} from './distribution-mode';

describe('resolveQueueStrategy', () => {
  it('SEQUENTIAL 은 linear 로 매핑한다', () => {
    expect(resolveQueueStrategy('SEQUENTIAL', 'leastrecent')).toBe('linear');
  });

  it('UNCONDITIONAL 은 linear 로 매핑한다', () => {
    expect(resolveQueueStrategy('UNCONDITIONAL', 'leastrecent')).toBe('linear');
  });

  it('DISTRIBUTE 는 선택한 고급 전략을 유지한다', () => {
    expect(resolveQueueStrategy('DISTRIBUTE', 'rrmemory')).toBe('rrmemory');
  });

  // 동시 호출은 Local 멤버를 한꺼번에 울려 먼저 수락한 상담원이 가져간다.
  it('DISTRIBUTE 는 동시 호출(ringall) 도 그대로 내보낸다', () => {
    expect(resolveQueueStrategy('DISTRIBUTE', 'ringall')).toBe('ringall');
  });

  it('DISTRIBUTE 에 전략이 없으면 leastrecent 를 기본값으로 사용한다', () => {
    expect(resolveQueueStrategy('DISTRIBUTE')).toBe('leastrecent');
  });
});

describe('isDistributionMode', () => {
  it('허용된 외부 착신 방식만 true', () => {
    expect(isDistributionMode('SEQUENTIAL')).toBe(true);
    expect(isDistributionMode('DISTRIBUTE')).toBe(true);
    expect(isDistributionMode('UNCONDITIONAL')).toBe(true);
    expect(isDistributionMode('ROUNDROBIN')).toBe(false);
  });
});

describe('normalizeUnconditionalTarget', () => {
  it('UNCONDITIONAL 이 아니면 대상 정보를 비운다', () => {
    expect(normalizeUnconditionalTarget('DISTRIBUTE', 'AGENT', 'agent-1')).toEqual({
      unconditionalTargetType: null,
      unconditionalTargetValue: null,
    });
  });

  it('UNCONDITIONAL 은 대상 타입과 값을 보관한다', () => {
    expect(normalizeUnconditionalTarget('UNCONDITIONAL', 'EXTERNAL_NUMBER', '010-1234-5678')).toEqual({
      unconditionalTargetType: 'EXTERNAL_NUMBER',
      unconditionalTargetValue: '01012345678',
    });
  });

  it('UNCONDITIONAL 대상이 없으면 에러를 반환한다', () => {
    expect(() => normalizeUnconditionalTarget('UNCONDITIONAL', 'AGENT', '')).toThrow(
      '무조건 착신 대상 값을 지정하세요.',
    );
  });
});
