import { CircuitBreaker } from './circuit-breaker';

function breakerAt(start = 0) {
  let now = start;
  const breaker = new CircuitBreaker({ now: () => now });
  return { breaker, advance: (ms: number) => { now += ms; } };
}

function fail(breaker: CircuitBreaker, key: string, times: number) {
  for (let i = 0; i < times; i += 1) breaker.recordFailure(key);
}

describe('CircuitBreaker', () => {
  it('처음에는 닫혀 있다', () => {
    const { breaker } = breakerAt();

    expect(breaker.state('crm')).toBe('CLOSED');
    expect(breaker.canRequest('crm')).toBe(true);
  });

  it('연속 5회 실패하면 연다', () => {
    const { breaker } = breakerAt();

    fail(breaker, 'crm', 4);
    expect(breaker.canRequest('crm')).toBe(true);

    breaker.recordFailure('crm');
    expect(breaker.state('crm')).toBe('OPEN');
    expect(breaker.canRequest('crm')).toBe(false);
  });

  it('중간에 성공하면 연속 카운트가 초기화된다', () => {
    const { breaker } = breakerAt();

    fail(breaker, 'crm', 4);
    breaker.recordSuccess('crm');
    fail(breaker, 'crm', 4);

    expect(breaker.canRequest('crm')).toBe(true);
  });

  it('실패 사이가 창보다 멀면 연속으로 치지 않는다', () => {
    const { breaker, advance } = breakerAt();

    fail(breaker, 'crm', 4);
    advance(60_001);
    breaker.recordFailure('crm');

    expect(breaker.state('crm')).toBe('CLOSED');
  });

  it('열린 뒤 60초가 지나면 한 건만 시험 삼아 보낸다', () => {
    const { breaker, advance } = breakerAt();

    fail(breaker, 'crm', 5);
    advance(59_999);
    expect(breaker.canRequest('crm')).toBe(false);

    advance(2);
    expect(breaker.state('crm')).toBe('HALF_OPEN');
    expect(breaker.canRequest('crm')).toBe(true);
    // 시험 요청이 나가는 동안 다른 통화는 기다리지 않는다.
    expect(breaker.canRequest('crm')).toBe(false);
  });

  it('시험 요청이 성공하면 닫는다', () => {
    const { breaker, advance } = breakerAt();

    fail(breaker, 'crm', 5);
    advance(60_001);
    breaker.canRequest('crm');
    breaker.recordSuccess('crm');

    expect(breaker.state('crm')).toBe('CLOSED');
    expect(breaker.canRequest('crm')).toBe(true);
  });

  it('시험 요청이 실패하면 다시 60초 닫는다', () => {
    const { breaker, advance } = breakerAt();

    fail(breaker, 'crm', 5);
    advance(60_001);
    breaker.canRequest('crm');
    breaker.recordFailure('crm');

    expect(breaker.state('crm')).toBe('OPEN');
    advance(59_999);
    expect(breaker.canRequest('crm')).toBe(false);
    advance(2);
    expect(breaker.canRequest('crm')).toBe(true);
  });

  it('엔드포인트마다 따로 센다', () => {
    const { breaker } = breakerAt();

    fail(breaker, 'crm', 5);

    expect(breaker.canRequest('crm')).toBe(false);
    expect(breaker.canRequest('billing')).toBe(true);
  });
});
