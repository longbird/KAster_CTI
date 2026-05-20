import { QueuesService } from '../src/modules/queues/queues.service';
import { PrismaService } from '../src/common/prisma.service';
import { AsteriskReloadService } from '../src/modules/asterisk-config/asterisk-reload.service';

describe('QueuesService getSummary', () => {
  const prisma = {
    queues: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    callSessions: {
      groupBy: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
    },
    queueEvents: {
      count: jest.fn(),
    },
    queueAgentMembers: {
      findMany: jest.fn(),
    },
    agentStatusHistory: {
      findFirst: jest.fn(),
    },
  };
  const reload = { scheduleReload: jest.fn() };

  let service: QueuesService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new QueuesService(prisma as unknown as PrismaService, reload as unknown as AsteriskReloadService);
    jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-05-20T09:00:00.000Z').getTime());

    prisma.queues.findFirst.mockResolvedValue({
      queueId: 'queue-default',
      queueName: 'default',
      queueExten: '10000',
      queueDisplayName: '기본 호 분배룰',
      maxWaitSeconds: 45,
    });
    prisma.queues.findMany.mockResolvedValue([
      {
        queueId: 'queue-1',
        queueName: 'sales',
        queueDisplayName: '영업',
        queueExten: '10001',
        maxWaitSeconds: 60,
      },
    ]);
    prisma.callSessions.groupBy.mockResolvedValue([
      { sessionStatus: 'QUEUED', _count: { callId: 2 } },
      { sessionStatus: 'TALKING', _count: { callId: 1 } },
    ]);
    prisma.callSessions.findFirst.mockResolvedValue({
      queuedAt: new Date('2026-05-20T08:58:50.000Z'),
    });
    prisma.callSessions.count.mockResolvedValue(1);
    prisma.queueEvents.count.mockResolvedValue(0);
    prisma.queueAgentMembers.findMany.mockResolvedValue([]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('QUEUED 세션을 가상버퍼 상태로 계산한다', async () => {
    const result = await service.getSummary('tenant-1');
    const row = result.data.queues[0];

    expect(prisma.queues.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ maxWaitSeconds: true }),
      }),
    );
    expect(prisma.callSessions.count).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        queueName: 'sales',
        sessionStatus: 'QUEUED',
        queuedAt: { lte: new Date('2026-05-20T08:59:00.000Z') },
      },
    });
    expect(row.longestWaitSeconds).toBe(70);
    expect(row.virtualBuffer).toEqual({
      waitingCalls: 2,
      longestWaitSeconds: 70,
      overThresholdCalls: 1,
      status: 'OVER_THRESHOLD',
    });
  });
});
