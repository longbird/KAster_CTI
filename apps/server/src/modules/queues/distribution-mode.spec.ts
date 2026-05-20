import { isDistributionMode, resolveQueueStrategy } from './distribution-mode';

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
