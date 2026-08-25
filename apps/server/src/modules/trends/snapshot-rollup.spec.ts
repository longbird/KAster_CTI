import { rollUpSnapshots, floorToResolution, RESOLUTION_MS } from './snapshot-rollup';

const at = (iso: string) => new Date(iso);

/** 롤업 입력 한 줄을 만든다. 지정하지 않은 지표는 0 이다. */
function row(capturedAt: string, values: Partial<Record<string, number | boolean | null>> = {}) {
  return {
    tenantId: 't1',
    queueId: null,
    capturedAt: at(capturedAt),
    waitingCalls: 0,
    longestWaitSeconds: 0,
    talkingCalls: 0,
    ringingCalls: 0,
    agentsAvailable: 0,
    agentsRinging: 0,
    agentsTalking: 0,
    agentsAcw: 0,
    agentsBreak: 0,
    agentsLoggedIn: 0,
    trunkChannelsInUse: null,
    endpointsTotal: null,
    endpointsRegistered: null,
    endpointsReachable: null,
    amiConnected: null,
    ...values,
  } as any;
}

describe('floorToResolution', () => {
  it('5분 경계로 내린다', () => {
    expect(floorToResolution(at('2026-08-25T09:07:41.500Z'), 'PT5M').toISOString())
      .toBe('2026-08-25T09:05:00.000Z');
    expect(floorToResolution(at('2026-08-25T09:05:00.000Z'), 'PT5M').toISOString())
      .toBe('2026-08-25T09:05:00.000Z');
  });

  it('1분 경계로 내린다', () => {
    expect(floorToResolution(at('2026-08-25T09:07:41.500Z'), 'PT1M').toISOString())
      .toBe('2026-08-25T09:07:00.000Z');
  });

  it('시간과 일 경계도 내린다 — 조회용 집계가 같은 함수를 쓴다', () => {
    expect(floorToResolution(at('2026-08-25T09:07:41Z'), 'PT1H').toISOString())
      .toBe('2026-08-25T09:00:00.000Z');
    expect(floorToResolution(at('2026-08-25T09:07:41Z'), 'P1D').toISOString())
      .toBe('2026-08-25T00:00:00.000Z');
  });

  it('해상도 상수는 밀리초로 노출한다', () => {
    expect(RESOLUTION_MS.PT1M).toBe(60_000);
    expect(RESOLUTION_MS.PT5M).toBe(300_000);
  });
});

describe('rollUpSnapshots', () => {
  it('같은 버킷의 행을 하나로 접는다', () => {
    const out = rollUpSnapshots(
      [
        row('2026-08-25T09:00:00Z', { waitingCalls: 2 }),
        row('2026-08-25T09:01:00Z', { waitingCalls: 4 }),
        row('2026-08-25T09:05:00Z', { waitingCalls: 9 }),
      ],
      'PT5M',
    );

    expect(out).toHaveLength(2);
    expect(out[0].capturedAt.toISOString()).toBe('2026-08-25T09:00:00.000Z');
    expect(out[1].capturedAt.toISOString()).toBe('2026-08-25T09:05:00.000Z');
    expect(out[0].resolution).toBe('PT5M');
  });

  it('대기 호수는 평균이다', () => {
    const out = rollUpSnapshots(
      [
        row('2026-08-25T09:00:00Z', { waitingCalls: 2 }),
        row('2026-08-25T09:01:00Z', { waitingCalls: 5 }),
      ],
      'PT5M',
    );

    // (2 + 5) / 2 = 3.5 -> 반올림 4
    expect(out[0].waitingCalls).toBe(4);
  });

  it('최장 대기는 평균이 아니라 최대다 — 평균 내면 피크가 사라진다', () => {
    const out = rollUpSnapshots(
      [
        row('2026-08-25T09:00:00Z', { longestWaitSeconds: 3 }),
        row('2026-08-25T09:01:00Z', { longestWaitSeconds: 180 }),
        row('2026-08-25T09:02:00Z', { longestWaitSeconds: 5 }),
      ],
      'PT5M',
    );

    expect(out[0].longestWaitSeconds).toBe(180);
  });

  it('트렁크 점유도 최대다 — 채널이 몇 개까지 찼는지가 용량 판단의 근거다', () => {
    const out = rollUpSnapshots(
      [
        row('2026-08-25T09:00:00Z', { trunkChannelsInUse: 2 }),
        row('2026-08-25T09:01:00Z', { trunkChannelsInUse: 11 }),
      ],
      'PT5M',
    );

    expect(out[0].trunkChannelsInUse).toBe(11);
  });

  it('null 만 있는 지표는 null 로 남는다 — 0 으로 채우면 놀고 있었다는 거짓말이 된다', () => {
    const out = rollUpSnapshots(
      [
        row('2026-08-25T09:00:00Z', { trunkChannelsInUse: null }),
        row('2026-08-25T09:01:00Z', { trunkChannelsInUse: null }),
      ],
      'PT5M',
    );

    expect(out[0].trunkChannelsInUse).toBeNull();
  });

  it('null 이 섞이면 값이 있는 것만으로 접는다', () => {
    const out = rollUpSnapshots(
      [
        row('2026-08-25T09:00:00Z', { endpointsReachable: null }),
        row('2026-08-25T09:01:00Z', { endpointsReachable: 4 }),
        row('2026-08-25T09:02:00Z', { endpointsReachable: 2 }),
      ],
      'PT5M',
    );

    // (4 + 2) / 2 = 3. null 을 0 으로 세어 2 로 만들지 않는다.
    expect(out[0].endpointsReachable).toBe(3);
  });

  it('AMI 는 한 번이라도 끊겼으면 끊긴 것으로 접는다 — 장애 구간을 삼키지 않는다', () => {
    const out = rollUpSnapshots(
      [
        row('2026-08-25T09:00:00Z', { amiConnected: true }),
        row('2026-08-25T09:01:00Z', { amiConnected: false }),
        row('2026-08-25T09:02:00Z', { amiConnected: true }),
      ],
      'PT5M',
    );

    expect(out[0].amiConnected).toBe(false);
  });

  it('테넌트와 큐가 다르면 따로 접는다', () => {
    const out = rollUpSnapshots(
      [
        { ...row('2026-08-25T09:00:00Z', { waitingCalls: 2 }), queueId: 'q1' },
        { ...row('2026-08-25T09:01:00Z', { waitingCalls: 8 }), queueId: 'q2' },
        row('2026-08-25T09:02:00Z', { waitingCalls: 4 }),
      ],
      'PT5M',
    );

    expect(out).toHaveLength(3);
    expect(out.map((item) => item.queueId).sort()).toEqual([null, 'q1', 'q2']);
  });

  it('빈 입력은 빈 결과다', () => {
    expect(rollUpSnapshots([], 'PT5M')).toEqual([]);
  });

  it('결과는 시각 오름차순이다', () => {
    const out = rollUpSnapshots(
      [
        row('2026-08-25T09:10:00Z'),
        row('2026-08-25T09:00:00Z'),
        row('2026-08-25T09:05:00Z'),
      ],
      'PT5M',
    );

    expect(out.map((item) => item.capturedAt.toISOString())).toEqual([
      '2026-08-25T09:00:00.000Z',
      '2026-08-25T09:05:00.000Z',
      '2026-08-25T09:10:00.000Z',
    ]);
  });
});
