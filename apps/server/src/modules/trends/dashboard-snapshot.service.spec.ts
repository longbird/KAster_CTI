import { DashboardSnapshotService } from './dashboard-snapshot.service';

function makePrisma(overrides: any = {}) {
  return {
    tenants: { findMany: jest.fn().mockResolvedValue([{ tenantId: 't1' }]) },
    queues: {
      findMany: jest.fn().mockResolvedValue([
        { queueId: 'q1', queueName: 'sales' },
      ]),
    },
    callSessions: {
      groupBy: jest.fn().mockResolvedValue([
        { queueName: 'sales', sessionStatus: 'QUEUED', _count: { callId: 2 } },
        { queueName: 'sales', sessionStatus: 'TALKING', _count: { callId: 1 } },
      ]),
      findMany: jest.fn().mockResolvedValue([
        { queueName: 'sales', queuedAt: new Date(Date.now() - 40_000) },
      ]),
    },
    agentStatusHistory: {
      findMany: jest.fn().mockResolvedValue([
        { agentId: 'a1', statusCode: 'AVAILABLE' },
      ]),
    },
    queueAgentMembers: {
      findMany: jest.fn().mockResolvedValue([{ agentId: 'a1', queueId: 'q1' }]),
    },
    dashboardSnapshots: { createMany: jest.fn().mockResolvedValue({ count: 2 }) },
    ...overrides,
  } as any;
}

function makeAmi(connected = true) {
  return {
    isConnected: jest.fn().mockReturnValue(connected),
    sendActionWithResponse: jest.fn().mockImplementation(({ Action }: any) => {
      if (Action === 'PJSIPShowContacts') {
        return Promise.resolve([
          { Event: 'ContactList', Endpoint: '3301', Status: 'Reachable' },
          { Event: 'ContactList', Endpoint: '3302', Status: 'Unreachable' },
        ]);
      }
      return Promise.resolve([
        { Event: 'CoreShowChannel', Channel: 'PJSIP/trunk-carrier-main-00000012' },
      ]);
    }),
  } as any;
}

const leader = (isLeader: boolean) => ({ isLeader: () => isLeader }) as any;

describe('DashboardSnapshotService', () => {
  it('리더가 아니면 아무것도 하지 않는다 — 노드 수만큼 중복 적재되는 것을 막는다', async () => {
    const prisma = makePrisma();
    const service = new DashboardSnapshotService(prisma, makeAmi(), leader(false));

    await service.capture();

    expect(prisma.dashboardSnapshots.createMany).not.toHaveBeenCalled();
    expect(prisma.tenants.findMany).not.toHaveBeenCalled();
  });

  it('리더면 큐 행과 합계 행을 적재한다', async () => {
    const prisma = makePrisma();
    const service = new DashboardSnapshotService(prisma, makeAmi(), leader(true));

    await service.capture();

    expect(prisma.dashboardSnapshots.createMany).toHaveBeenCalledTimes(1);
    const { data, skipDuplicates } = prisma.dashboardSnapshots.createMany.mock.calls[0][0];
    expect(skipDuplicates).toBe(true);
    expect(data).toHaveLength(2);

    const queueRow = data.find((row: any) => row.queueId === 'q1');
    expect(queueRow).toMatchObject({ waitingCalls: 2, talkingCalls: 1, agentsAvailable: 1 });
    expect(queueRow.longestWaitSeconds).toBeGreaterThanOrEqual(39);
  });

  it('AMI 지표를 합계 행에 담는다', async () => {
    const prisma = makePrisma();
    const service = new DashboardSnapshotService(prisma, makeAmi(), leader(true));

    await service.capture();

    const total = prisma.dashboardSnapshots.createMany.mock.calls[0][0].data
      .find((row: any) => row.queueId === null);
    expect(total).toMatchObject({
      endpointsRegistered: 2,
      endpointsReachable: 1,
      trunkChannelsInUse: 1,
      amiConnected: true,
    });
  });

  it('AMI 가 끊겨 있으면 조회하지 않고 amiConnected=false 로 적재한다', async () => {
    const prisma = makePrisma();
    const ami = makeAmi(false);
    const service = new DashboardSnapshotService(prisma, ami, leader(true));

    await service.capture();

    expect(ami.sendActionWithResponse).not.toHaveBeenCalled();
    const total = prisma.dashboardSnapshots.createMany.mock.calls[0][0].data
      .find((row: any) => row.queueId === null);
    // 행은 남긴다. 빈 구간과 "AMI 가 죽어 있던 구간"은 다른 사실이다.
    expect(total).toMatchObject({ amiConnected: false, trunkChannelsInUse: null });
  });

  it('AMI 조회가 실패해도 적재는 계속한다', async () => {
    const prisma = makePrisma();
    const ami = makeAmi(true);
    ami.sendActionWithResponse = jest.fn().mockRejectedValue(new Error('timeout'));
    const service = new DashboardSnapshotService(prisma, ami, leader(true));

    await service.capture();

    expect(prisma.dashboardSnapshots.createMany).toHaveBeenCalledTimes(1);
    const total = prisma.dashboardSnapshots.createMany.mock.calls[0][0].data
      .find((row: any) => row.queueId === null);
    expect(total.trunkChannelsInUse).toBeNull();
  });

  it('한 테넌트가 실패해도 다음 테넌트를 적재한다', async () => {
    const prisma = makePrisma({
      tenants: { findMany: jest.fn().mockResolvedValue([{ tenantId: 't1' }, { tenantId: 't2' }]) },
    });
    prisma.queues.findMany = jest.fn()
      .mockRejectedValueOnce(new Error('db hiccup'))
      .mockResolvedValue([{ queueId: 'q1', queueName: 'sales' }]);
    const service = new DashboardSnapshotService(prisma, makeAmi(), leader(true));

    await service.capture();

    expect(prisma.dashboardSnapshots.createMany).toHaveBeenCalledTimes(1);
  });

  it('큐가 없는 테넌트도 합계 행은 적재한다', async () => {
    const prisma = makePrisma({ queues: { findMany: jest.fn().mockResolvedValue([]) } });
    const service = new DashboardSnapshotService(prisma, makeAmi(), leader(true));

    await service.capture();

    const { data } = prisma.dashboardSnapshots.createMany.mock.calls[0][0];
    expect(data).toHaveLength(1);
    expect(data[0].queueId).toBeNull();
  });
});
