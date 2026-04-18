import { SessionEngineService } from '../src/modules/calls/session-engine.service';
import { PrismaService } from '../src/common/prisma.service';
import { RedisService } from '../src/modules/redis/redis.service';
import { TransferDetectorService } from '../src/modules/calls/transfer-detector.service';

describe('SessionEngineService hold/unhold handling', () => {
  let service: SessionEngineService;

  const tx = {
    callSessions: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    eventOutbox: {
      create: jest.fn(),
    },
  };

  const prisma = {
    rawAmiEvents: {
      create: jest.fn(),
    },
    $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
  };

  const redis = {
    getClient: jest.fn(() => ({
      set: jest.fn().mockResolvedValue('OK'),
    })),
  };

  const transferDetector = {
    handle: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SessionEngineService(
      prisma as unknown as PrismaService,
      redis as unknown as RedisService,
      transferDetector as unknown as TransferDetectorService,
    );
  });

  it('Hold 이벤트는 talking 세션을 HOLD 로 전환하고 call.updated outbox 를 적재한다', async () => {
    const answeredAt = new Date('2026-04-18T10:00:00.000Z');
    const holdAt = new Date('2026-04-18T10:05:00.000Z');
    const updated = {
      callId: 'call-1',
      tenantId: 'tenant-1',
      linkedid: 'L-1',
      sessionStatus: 'HOLD',
      answeredAt,
      updatedAt: holdAt,
      holdSeconds: 0,
    };

    tx.callSessions.findFirst.mockResolvedValue({
      callId: 'call-1',
      tenantId: 'tenant-1',
      linkedid: 'L-1',
      sessionStatus: 'TALKING',
      answeredAt,
      updatedAt: answeredAt,
      holdSeconds: 0,
    });
    tx.callSessions.update.mockResolvedValue(updated);
    prisma.rawAmiEvents.create.mockResolvedValue({});

    await service.processNormalizedEvent({
      eventName: 'Hold',
      tenantId: 'tenant-1',
      linkedid: 'L-1',
      uniqueid: 'U-1',
      eventTime: holdAt.toISOString(),
    });

    expect(tx.callSessions.update).toHaveBeenCalledWith({
      where: { callId: 'call-1' },
      data: {
        sessionStatus: 'HOLD',
        updatedAt: holdAt,
      },
    });
    expect(tx.eventOutbox.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-1',
        eventType: 'call.updated',
      }),
    });
  });

  it('Unhold 이벤트는 HOLD 세션을 TALKING 으로 복귀시키고 holdSeconds 를 누적한다', async () => {
    const holdAt = new Date('2026-04-18T10:05:00.000Z');
    const resumeAt = new Date('2026-04-18T10:05:12.000Z');
    const updated = {
      callId: 'call-1',
      tenantId: 'tenant-1',
      linkedid: 'L-1',
      sessionStatus: 'TALKING',
      answeredAt: new Date('2026-04-18T10:00:00.000Z'),
      updatedAt: resumeAt,
      holdSeconds: 12,
    };

    tx.callSessions.findFirst.mockResolvedValue({
      callId: 'call-1',
      tenantId: 'tenant-1',
      linkedid: 'L-1',
      sessionStatus: 'HOLD',
      answeredAt: new Date('2026-04-18T10:00:00.000Z'),
      updatedAt: holdAt,
      holdSeconds: 0,
    });
    tx.callSessions.update.mockResolvedValue(updated);
    prisma.rawAmiEvents.create.mockResolvedValue({});

    await service.processNormalizedEvent({
      eventName: 'Unhold',
      tenantId: 'tenant-1',
      linkedid: 'L-1',
      uniqueid: 'U-1',
      eventTime: resumeAt.toISOString(),
    });

    expect(tx.callSessions.update).toHaveBeenCalledWith({
      where: { callId: 'call-1' },
      data: {
        sessionStatus: 'TALKING',
        holdSeconds: 12,
        updatedAt: resumeAt,
      },
    });
  });
});
