import { SnapshotRetentionService } from './snapshot-retention.service';

const DAY = 86_400_000;

function rawRow(agoDays: number, values: any = {}) {
  return {
    tenantId: 't1',
    queueId: null,
    capturedAt: new Date(Date.now() - agoDays * DAY),
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
  };
}

function makePrisma(oldRows: any[] = []) {
  return {
    dashboardSnapshots: {
      findMany: jest.fn().mockResolvedValue(oldRows),
      createMany: jest.fn().mockResolvedValue({ count: oldRows.length }),
      deleteMany: jest.fn().mockResolvedValue({ count: oldRows.length }),
    },
  } as any;
}

const leader = (isLeader: boolean) => ({ isLeader: () => isLeader }) as any;

describe('SnapshotRetentionService', () => {
  it('리더가 아니면 아무것도 하지 않는다', async () => {
    const prisma = makePrisma([rawRow(120)]);
    await new SnapshotRetentionService(prisma, leader(false)).sweep();

    expect(prisma.dashboardSnapshots.findMany).not.toHaveBeenCalled();
    expect(prisma.dashboardSnapshots.deleteMany).not.toHaveBeenCalled();
  });

  it('90일 지난 1분 행을 5분으로 접어 쓰고 원본을 지운다', async () => {
    const prisma = makePrisma([
      rawRow(120, { capturedAt: new Date('2026-01-01T09:00:00Z'), waitingCalls: 2 }),
      rawRow(120, { capturedAt: new Date('2026-01-01T09:01:00Z'), waitingCalls: 4 }),
    ]);

    await new SnapshotRetentionService(prisma, leader(true)).sweep();

    const written = prisma.dashboardSnapshots.createMany.mock.calls[0][0];
    expect(written.skipDuplicates).toBe(true);
    expect(written.data).toHaveLength(1);
    expect(written.data[0]).toMatchObject({ resolution: 'PT5M', waitingCalls: 3 });

    // 원본 삭제가 롤업 <b>뒤</b>에 일어나야 한다. 먼저 지우면 접을 것이 없다.
    const deleteOrder = prisma.dashboardSnapshots.deleteMany.mock.invocationCallOrder[0];
    const createOrder = prisma.dashboardSnapshots.createMany.mock.invocationCallOrder[0];
    expect(deleteOrder).toBeGreaterThan(createOrder);
  });

  it('접을 것이 없으면 원본을 지우지 않는다', async () => {
    const prisma = makePrisma([]);

    await new SnapshotRetentionService(prisma, leader(true)).sweep();

    expect(prisma.dashboardSnapshots.createMany).not.toHaveBeenCalled();
    // 1년 초과 PT5M 정리는 여전히 돈다.
    expect(prisma.dashboardSnapshots.deleteMany).toHaveBeenCalledTimes(1);
  });

  it('1년 지난 5분 행을 지운다', async () => {
    const prisma = makePrisma([]);

    await new SnapshotRetentionService(prisma, leader(true)).sweep();

    const where = prisma.dashboardSnapshots.deleteMany.mock.calls[0][0].where;
    expect(where.resolution).toBe('PT5M');
    const cutoff = where.capturedAt.lt as Date;
    const days = (Date.now() - cutoff.getTime()) / DAY;
    expect(days).toBeGreaterThan(360);
    expect(days).toBeLessThan(370);
  });

  it('롤업 조회는 90일 초과 1분 행만 본다', async () => {
    const prisma = makePrisma([]);

    await new SnapshotRetentionService(prisma, leader(true)).sweep();

    const where = prisma.dashboardSnapshots.findMany.mock.calls[0][0].where;
    expect(where.resolution).toBe('PT1M');
    const days = (Date.now() - (where.capturedAt.lt as Date).getTime()) / DAY;
    expect(days).toBeGreaterThan(89);
    expect(days).toBeLessThan(91);
  });
});
