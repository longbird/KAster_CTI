/**
 * 죽은 엔드포인트에 통화마다 시간을 잃지 않게 하는 차단기.
 *
 * 통화 중에는 재시도를 하지 않기로 했지만(설계 §5.2), 재시도를 안 해도 엔드포인트가 죽으면
 * **통화마다 타임아웃만큼** 잃는다. 100통이면 200초다. 그래서 연속 실패가 쌓이면
 * 아예 부르지 않고 즉시 실패를 준다.
 *
 * 임계값을 env 로 빼지 않는다 — 튜닝 대상이 아니라 안전선이다 (렌더 가드 임계값과 같은 이유).
 */

const FAILURE_THRESHOLD = 5;
const FAILURE_WINDOW_MS = 60_000;
const OPEN_MS = 60_000;

export type BreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface EndpointState {
  failures: number;
  lastFailureAt: number;
  openedAt: number | null;
  /** 반열림에서 시험 요청 한 건이 이미 나갔는가. 나머지 통화는 기다리지 않는다. */
  probeInFlight: boolean;
}

export interface CircuitBreakerOptions {
  now?: () => number;
}

export class CircuitBreaker {
  private readonly states = new Map<string, EndpointState>();
  private readonly now: () => number;

  constructor(options: CircuitBreakerOptions = {}) {
    this.now = options.now ?? (() => Date.now());
  }

  state(key: string): BreakerState {
    const state = this.states.get(key);
    // 0 을 falsy 로 읽으면 시계가 0 에서 시작하는 순간 열림이 사라진다. null 로만 판정한다.
    if (!state || state.openedAt === null) return 'CLOSED';

    return this.now() - state.openedAt >= OPEN_MS ? 'HALF_OPEN' : 'OPEN';
  }

  canRequest(key: string): boolean {
    const current = this.state(key);
    if (current === 'CLOSED') return true;
    if (current === 'OPEN') return false;

    const state = this.stateFor(key);
    if (state.probeInFlight) return false;
    state.probeInFlight = true;
    return true;
  }

  recordSuccess(key: string): void {
    this.states.delete(key);
  }

  recordFailure(key: string): void {
    const state = this.stateFor(key);
    const now = this.now();

    if (state.openedAt !== null) {
      // 반열림에서 시험 요청이 실패했다. 처음부터 다시 센다.
      state.openedAt = now;
      state.probeInFlight = false;
      return;
    }

    // 실패 사이가 창보다 멀면 연속으로 치지 않는다.
    state.failures = now - state.lastFailureAt > FAILURE_WINDOW_MS ? 1 : state.failures + 1;
    state.lastFailureAt = now;

    if (state.failures >= FAILURE_THRESHOLD) {
      state.openedAt = now;
      state.probeInFlight = false;
    }
  }

  private stateFor(key: string): EndpointState {
    const existing = this.states.get(key);
    if (existing) return existing;

    const created: EndpointState = {
      failures: 0,
      lastFailureAt: Number.NEGATIVE_INFINITY,
      openedAt: null,
      probeInFlight: false,
    };
    this.states.set(key, created);
    return created;
  }
}
