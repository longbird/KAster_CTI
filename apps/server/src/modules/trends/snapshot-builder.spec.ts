import { buildSnapshotRows } from './snapshot-builder';

const AT = new Date('2026-08-25T09:07:41.500Z');

const base = {
  tenantId: 't1',
  capturedAt: AT,
  queues: [],
  agents: [],
  resources: {
    trunkChannelsInUse: null,
    endpointsTotal: null,
    endpointsRegistered: null,
    endpointsReachable: null,
    amiConnected: false,
  },
};

describe('buildSnapshotRows', () => {
  it('큐마다 한 행과 테넌트 합계 한 행을 만든다', () => {
    const rows = buildSnapshotRows({
      ...base,
      queues: [
        { queueId: 'q1', waiting: 2, ringing: 1, talking: 3, longestWaitSeconds: 40 },
        { queueId: 'q2', waiting: 0, ringing: 0, talking: 1, longestWaitSeconds: 0 },
      ],
    });

    expect(rows).toHaveLength(3);
    expect(rows.filter((row) => row.queueId === null)).toHaveLength(1);
    expect(rows.map((row) => row.queueId)).toEqual(['q1', 'q2', null]);
  });

  it('합계 행은 큐 값을 더한다 — 최장 대기만 최대다', () => {
    const [, , total] = buildSnapshotRows({
      ...base,
      queues: [
        { queueId: 'q1', waiting: 2, ringing: 1, talking: 3, longestWaitSeconds: 40 },
        { queueId: 'q2', waiting: 5, ringing: 0, talking: 1, longestWaitSeconds: 180 },
      ],
    });

    expect(total.waitingCalls).toBe(7);
    expect(total.talkingCalls).toBe(4);
    expect(total.ringingCalls).toBe(1);
    // 합치면 안 된다. 두 큐의 최장 대기를 더한 220초는 존재한 적 없는 값이다.
    expect(total.longestWaitSeconds).toBe(180);
  });

  it('시각을 분 경계로 내린다 — 적재 지연이 버킷을 흔들면 안 된다', () => {
    const [row] = buildSnapshotRows({ ...base, queues: [{ queueId: 'q1', waiting: 0, ringing: 0, talking: 0, longestWaitSeconds: 0 }] });
    expect(row.capturedAt.toISOString()).toBe('2026-08-25T09:07:00.000Z');
    expect(row.resolution).toBe('PT1M');
  });

  it('상담원 상태를 큐별로 센다', () => {
    const rows = buildSnapshotRows({
      ...base,
      queues: [{ queueId: 'q1', waiting: 0, ringing: 0, talking: 0, longestWaitSeconds: 0 }],
      agents: [
        { agentId: 'a1', queueIds: ['q1'], statusCode: 'AVAILABLE' },
        { agentId: 'a2', queueIds: ['q1'], statusCode: 'TALKING' },
        { agentId: 'a3', queueIds: ['q1'], statusCode: 'AFTER_CALL_WORK' },
        { agentId: 'a4', queueIds: ['q1'], statusCode: 'BREAK' },
        { agentId: 'a5', queueIds: ['q1'], statusCode: 'RINGING_AGENT' },
      ],
    });

    expect(rows[0]).toMatchObject({
      queueId: 'q1',
      agentsAvailable: 1,
      agentsTalking: 1,
      agentsAcw: 1,
      agentsBreak: 1,
      agentsRinging: 1,
      agentsLoggedIn: 5,
    });
  });

  it('두 큐에 걸친 상담원은 각 큐에 세고 합계에는 한 번만 센다', () => {
    // 큐별로는 "이 큐에 배정된 인원"이 맞고, 합계에서 중복으로 세면
    // 로그인 인원이 실제보다 많아 보여 인력 판단이 틀어진다.
    const rows = buildSnapshotRows({
      ...base,
      queues: [
        { queueId: 'q1', waiting: 0, ringing: 0, talking: 0, longestWaitSeconds: 0 },
        { queueId: 'q2', waiting: 0, ringing: 0, talking: 0, longestWaitSeconds: 0 },
      ],
      agents: [{ agentId: 'a1', queueIds: ['q1', 'q2'], statusCode: 'AVAILABLE' }],
    });

    expect(rows[0].agentsAvailable).toBe(1);
    expect(rows[1].agentsAvailable).toBe(1);
    expect(rows[2].agentsAvailable).toBe(1);
    expect(rows[2].agentsLoggedIn).toBe(1);
  });

  it('어느 큐에도 없는 상담원은 합계에만 잡힌다', () => {
    const rows = buildSnapshotRows({
      ...base,
      queues: [{ queueId: 'q1', waiting: 0, ringing: 0, talking: 0, longestWaitSeconds: 0 }],
      agents: [{ agentId: 'a9', queueIds: [], statusCode: 'AVAILABLE' }],
    });

    expect(rows[0].agentsAvailable).toBe(0);
    expect(rows[1].agentsAvailable).toBe(1);
  });

  it('모르는 상태 코드는 어느 칸에도 넣지 않되 로그인 인원에는 센다', () => {
    const rows = buildSnapshotRows({
      ...base,
      agents: [{ agentId: 'a1', queueIds: [], statusCode: 'WRAP_UP_CUSTOM' }],
    });

    const total = rows[0];
    expect(total.agentsLoggedIn).toBe(1);
    expect(total.agentsAvailable + total.agentsTalking + total.agentsAcw + total.agentsBreak + total.agentsRinging).toBe(0);
  });

  it('리소스 지표는 합계 행에만 채운다 — 큐별로는 의미가 없다', () => {
    const rows = buildSnapshotRows({
      ...base,
      queues: [{ queueId: 'q1', waiting: 0, ringing: 0, talking: 0, longestWaitSeconds: 0 }],
      resources: {
        trunkChannelsInUse: 6,
        endpointsTotal: 7,
        endpointsRegistered: 4,
        endpointsReachable: 3,
        amiConnected: true,
      },
    });

    expect(rows[0]).toMatchObject({
      queueId: 'q1',
      trunkChannelsInUse: null,
      endpointsRegistered: null,
      amiConnected: null,
    });
    expect(rows[1]).toMatchObject({
      queueId: null,
      trunkChannelsInUse: 6,
      endpointsTotal: 7,
      endpointsRegistered: 4,
      endpointsReachable: 3,
      amiConnected: true,
    });
  });

  it('AMI 를 못 읽어도 합계 행을 만든다 — 빈 구간과 장애 구간은 다른 사실이다', () => {
    const rows = buildSnapshotRows({ ...base });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      queueId: null,
      trunkChannelsInUse: null,
      endpointsReachable: null,
      amiConnected: false,
    });
  });
});
