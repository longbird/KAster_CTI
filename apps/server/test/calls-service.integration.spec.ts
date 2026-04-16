import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../src/common/prisma.service';
import { CallsService } from '../src/modules/calls/calls.service';
import { EventBusService } from '../src/modules/events/event-bus.service';
import { AsteriskManagerService } from '../src/modules/calls/asterisk-manager.service';

describe('CallsService branch filter integration', () => {
  let service: CallsService;
  const prisma = {
    branchAgents: {
      findMany: jest.fn(),
    },
    branchQueues: {
      findMany: jest.fn(),
    },
    callSessions: {
      findMany: jest.fn(),
    },
    callRecordings: {
      findMany: jest.fn(),
    },
    agents: {
      findMany: jest.fn(),
    },
  };
  const eventBus = {
    publish: jest.fn(),
  };
  const asteriskManager = {
    originate: jest.fn(),
    blindTransfer: jest.fn(),
    attendedTransfer: jest.fn(),
    hangup: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CallsService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventBusService, useValue: eventBus },
        { provide: AsteriskManagerService, useValue: asteriskManager },
      ],
    }).compile();

    service = module.get(CallsService);
  });

  it('getActiveCalls 는 branchId 기준 agent/queue scope 를 OR 필터로 적용한다', async () => {
    prisma.branchAgents.findMany.mockResolvedValue([{ agentId: 'agent-1' }]);
    prisma.branchQueues.findMany.mockResolvedValue([{ queueId: 'queue-1' }]);
    prisma.callSessions.findMany.mockResolvedValue([
      {
        callId: 'call-1',
        primaryAgentId: 'agent-1',
        sessionStatus: 'TALKING',
        startedAt: new Date('2026-04-16T09:00:00.000Z'),
        queuedAt: new Date('2026-04-16T08:59:30.000Z'),
        answeredAt: new Date('2026-04-16T09:00:00.000Z'),
      },
    ]);
    prisma.agents.findMany.mockResolvedValue([{ agentId: 'agent-1', agentName: '상담원1' }]);

    const result = await service.getActiveCalls('tenant-1', 'branch-1');

    expect(prisma.callSessions.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        sessionStatus: { not: 'ENDED' },
        OR: [
          { primaryAgentId: { in: ['agent-1'] } },
          { queueId: { in: ['queue-1'] } },
        ],
      },
      orderBy: { startedAt: 'desc' },
      take: 100,
    });
    expect(prisma.agents.findMany).toHaveBeenCalledWith({
      where: { agentId: { in: ['agent-1'] }, tenantId: 'tenant-1' },
      select: { agentId: true, agentName: true },
    });
    expect(result).toMatchObject({
      success: true,
      data: [
        {
          callId: 'call-1',
          agentName: '상담원1',
        },
      ],
      error: null,
    });
    expect(result.data[0].waitSeconds).toBe(30);
  });

  it('listHistory 는 missed 모드와 branch filter 를 함께 적용한다', async () => {
    prisma.branchAgents.findMany.mockResolvedValue([{ agentId: 'agent-5' }]);
    prisma.branchQueues.findMany.mockResolvedValue([{ queueId: 'queue-5' }]);
    prisma.callSessions.findMany.mockResolvedValue([]);

    await service.listHistory('tenant-1', {
      from: '2026-04-01T00:00:00.000Z',
      to: '2026-04-16T23:59:59.999Z',
      branchId: 'branch-5',
      agentId: 'agent-5',
      mode: 'missed',
    });

    expect(prisma.callSessions.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        startedAt: {
          gte: new Date('2026-04-01T00:00:00.000Z'),
          lte: new Date('2026-04-16T23:59:59.999Z'),
        },
        OR: [
          { primaryAgentId: { in: ['agent-5'] } },
          { queueId: { in: ['queue-5'] } },
        ],
        primaryAgentId: 'agent-5',
        sessionStatus: 'ENDED',
        answeredAt: null,
      },
      orderBy: { startedAt: 'desc' },
      take: 500,
      select: {
        callId: true,
        ani: true,
        dnis: true,
        queueName: true,
        sessionStatus: true,
        direction: true,
        startedAt: true,
        answeredAt: true,
        endedAt: true,
        waitSeconds: true,
        talkSeconds: true,
        abandonFlag: true,
        recordingFlag: true,
        primaryAgent: { select: { agentName: true } },
      },
    });
  });

  it('listRecordings 는 branchId 기준 session OR 필터를 recording 조회에 적용한다', async () => {
    prisma.branchAgents.findMany.mockResolvedValue([{ agentId: 'agent-9' }]);
    prisma.branchQueues.findMany.mockResolvedValue([{ queueId: 'queue-9' }]);
    prisma.callRecordings.findMany.mockResolvedValue([
      {
        recordingId: 'rec-1',
        linkedid: 'L-1',
        fileName: 'rec-1.wav',
        fileFormat: 'wav',
        fileSizeBytes: 1024,
        durationSeconds: 45,
        recordingStartedAt: new Date('2026-04-16T10:00:00.000Z'),
        session: {
          ani: '01012345678',
          queueName: 'Q1',
          primaryAgent: { agentName: '상담원9' },
        },
      },
    ]);

    const result = await service.listRecordings('tenant-1', {
      from: '2026-04-01T00:00:00.000Z',
      to: '2026-04-16T23:59:59.999Z',
      branchId: 'branch-9',
    });

    expect(prisma.callRecordings.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        recordingStartedAt: {
          gte: new Date('2026-04-01T00:00:00.000Z'),
          lte: new Date('2026-04-16T23:59:59.999Z'),
        },
        OR: [
          { session: { primaryAgentId: { in: ['agent-9'] } } },
          { session: { queueId: { in: ['queue-9'] } } },
        ],
      },
      orderBy: { recordingStartedAt: 'desc' },
      take: 200,
      select: {
        recordingId: true,
        linkedid: true,
        fileName: true,
        fileFormat: true,
        fileSizeBytes: true,
        durationSeconds: true,
        recordingStartedAt: true,
        session: {
          select: {
            ani: true,
            queueName: true,
            primaryAgent: { select: { agentName: true } },
          },
        },
      },
    });
    expect(result).toMatchObject({
      success: true,
      data: [
        {
          recordingId: 'rec-1',
          fileName: 'rec-1.wav',
        },
      ],
      error: null,
    });
  });

  it('branchId 가 없으면 branch mapping 조회 없이 기본 범위로 history 를 조회한다', async () => {
    prisma.callSessions.findMany.mockResolvedValue([]);

    await service.listHistory('tenant-1', {
      status: 'TALKING',
    });

    expect(prisma.branchAgents.findMany).not.toHaveBeenCalled();
    expect(prisma.branchQueues.findMany).not.toHaveBeenCalled();
    expect(prisma.callSessions.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-1',
          sessionStatus: 'TALKING',
        }),
      }),
    );
  });
});
