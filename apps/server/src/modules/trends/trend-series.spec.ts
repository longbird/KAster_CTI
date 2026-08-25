import { buildBucketStarts, countBuckets, mergeTrendPoints } from './trend-series';

const D = (iso: string) => new Date(iso);

describe('buildBucketStarts', () => {
  it('시작을 경계로 내리고 끝 직전까지 만든다', () => {
    const starts = buildBucketStarts(D('2026-08-25T09:07:00Z'), D('2026-08-25T09:25:00Z'), 'PT5M');

    expect(starts.map((at) => at.toISOString())).toEqual([
      '2026-08-25T09:05:00.000Z',
      '2026-08-25T09:10:00.000Z',
      '2026-08-25T09:15:00.000Z',
      '2026-08-25T09:20:00.000Z',
    ]);
  });

  it('끝 경계는 포함하지 않는다 — 아직 끝나지 않은 버킷을 완성된 것처럼 그리지 않는다', () => {
    const starts = buildBucketStarts(D('2026-08-25T09:00:00Z'), D('2026-08-25T09:10:00Z'), 'PT5M');
    expect(starts).toHaveLength(2);
  });

  it('from 이 to 이상이면 빈 배열이다', () => {
    expect(buildBucketStarts(D('2026-08-25T09:00:00Z'), D('2026-08-25T09:00:00Z'), 'PT5M')).toEqual([]);
  });
});

describe('countBuckets', () => {
  it('만들지 않고 개수만 센다 — 과도한 요청을 미리 거절하기 위한 것', () => {
    expect(countBuckets(D('2026-08-25T00:00:00Z'), D('2026-08-26T00:00:00Z'), 'PT1M')).toBe(1440);
    expect(countBuckets(D('2026-08-25T00:00:00Z'), D('2026-08-26T00:00:00Z'), 'PT1H')).toBe(24);
  });
});

describe('mergeTrendPoints', () => {
  const range = { from: D('2026-08-25T09:00:00Z'), to: D('2026-08-25T09:15:00Z') };

  it('구간의 모든 버킷을 만든다 — 데이터가 없는 구간도 x축에 남는다', () => {
    const points = mergeTrendPoints({ ...range, resolution: 'PT5M', calls: [], snapshots: [] });
    expect(points).toHaveLength(3);
    expect(points.map((point) => point.at.toISOString())).toEqual([
      '2026-08-25T09:00:00.000Z',
      '2026-08-25T09:05:00.000Z',
      '2026-08-25T09:10:00.000Z',
    ]);
  });

  it('통화가 없던 버킷은 0 이다 — callSessions 가 진실원이라 없으면 정말 없었다', () => {
    const [point] = mergeTrendPoints({ ...range, resolution: 'PT5M', calls: [], snapshots: [] });

    expect(point.inbound).toBe(0);
    expect(point.answered).toBe(0);
    expect(point.abandoned).toBe(0);
  });

  it('스냅샷이 없던 버킷은 null 이다 — 안 쟀다와 0 이었다는 다른 사실이다', () => {
    const [point] = mergeTrendPoints({ ...range, resolution: 'PT5M', calls: [], snapshots: [] });

    expect(point.waitingCalls).toBeNull();
    expect(point.trunkChannelsInUse).toBeNull();
    expect(point.agentsAvailable).toBeNull();
    expect(point.amiConnected).toBeNull();
  });

  it('두 출처를 같은 버킷에 합친다', () => {
    const [point] = mergeTrendPoints({
      ...range,
      resolution: 'PT5M',
      calls: [{ at: D('2026-08-25T09:00:00Z'), inbound: 12, answered: 10, abandoned: 2, avgWaitSeconds: 8, avgTalkSeconds: 143 }],
      snapshots: [{ at: D('2026-08-25T09:00:00Z'), resolution: 'PT1M', waitingCalls: 3, longestWaitSeconds: 41, talkingCalls: 4, ringingCalls: 0, agentsAvailable: 2, agentsRinging: 0, agentsTalking: 4, agentsAcw: 1, agentsBreak: 0, agentsLoggedIn: 7, trunkChannelsInUse: 6, endpointsTotal: 7, endpointsRegistered: 4, endpointsReachable: 3, amiConnected: true }],
    });

    expect(point).toMatchObject({
      inbound: 12,
      answered: 10,
      abandoned: 2,
      avgWaitSeconds: 8,
      waitingCalls: 3,
      longestWaitSeconds: 41,
      trunkChannelsInUse: 6,
      amiConnected: true,
    });
  });

  it('같은 버킷에 두 해상도가 있으면 세밀한 쪽을 쓴다 — 롤업 도중 원본이 남아 있을 수 있다', () => {
    const [point] = mergeTrendPoints({
      ...range,
      resolution: 'PT5M',
      calls: [],
      snapshots: [
        { at: D('2026-08-25T09:00:00Z'), resolution: 'PT5M', waitingCalls: 99 } as any,
        { at: D('2026-08-25T09:00:00Z'), resolution: 'PT1M', waitingCalls: 3 } as any,
      ],
    });

    expect(point.waitingCalls).toBe(3);
  });

  it('버킷 안의 시각은 버킷 시작으로 정렬한다', () => {
    const points = mergeTrendPoints({
      ...range,
      resolution: 'PT5M',
      calls: [{ at: D('2026-08-25T09:07:00Z'), inbound: 5, answered: 5, abandoned: 0, avgWaitSeconds: 1, avgTalkSeconds: 2 }],
      snapshots: [],
    });

    expect(points[0].inbound).toBe(0);
    expect(points[1].inbound).toBe(5);
  });

  it('AMI 가 한 번이라도 끊긴 버킷은 끊긴 것으로 표시한다', () => {
    const [point] = mergeTrendPoints({
      ...range,
      resolution: 'PT5M',
      calls: [],
      snapshots: [
        { at: D('2026-08-25T09:00:00Z'), resolution: 'PT1M', amiConnected: true } as any,
        { at: D('2026-08-25T09:01:00Z'), resolution: 'PT1M', amiConnected: false } as any,
      ],
    });

    expect(point.amiConnected).toBe(false);
  });

  it('같은 버킷의 여러 스냅샷을 접는다 — 대기는 평균, 최장 대기는 최대', () => {
    const [point] = mergeTrendPoints({
      ...range,
      resolution: 'PT5M',
      calls: [],
      snapshots: [
        { at: D('2026-08-25T09:00:00Z'), resolution: 'PT1M', waitingCalls: 2, longestWaitSeconds: 10 } as any,
        { at: D('2026-08-25T09:03:00Z'), resolution: 'PT1M', waitingCalls: 6, longestWaitSeconds: 180 } as any,
      ],
    });

    expect(point.waitingCalls).toBe(4);
    expect(point.longestWaitSeconds).toBe(180);
  });
});
