import { SessionEngineService } from '../src/modules/calls/session-engine.service';
import { PrismaService } from '../src/common/prisma.service';
import { RedisService } from '../src/modules/redis/redis.service';
import { TransferDetectorService } from '../src/modules/calls/transfer-detector.service';
import { AgentOfferService } from '../src/modules/calls/agent-offer.service';

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

  const offers = {
    notifyCallEnded: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SessionEngineService(
      prisma as unknown as PrismaService,
      redis as unknown as RedisService,
      transferDetector as unknown as TransferDetectorService,
      offers as unknown as AgentOfferService,
    );
  });

  /**
   * 실제로 난 사고(2026-08-22 23:03). 고객이 큐에서 끊었는데 두 자리의 "받으시겠습니까?" 가
   * 8초 더 떠 있었다. AGI 는 `urlopen()` 안에 막혀 있어 롱폴이 안 끊기므로, 호가 끝났다는
   * 사실을 우리가 알려주지 않으면 제안은 대기 시간을 다 채운 뒤에야 닫힌다.
   */
  it('Hangup 으로 세션이 닫히면 그 호의 제안도 닫으라고 알린다', async () => {
    tx.callSessions.findFirst.mockResolvedValue({
      callId: 'call-1',
      tenantId: 'tenant-1',
      linkedid: 'L-1',
      sessionStatus: 'QUEUED',
      answeredAt: null,
      updatedAt: new Date('2026-04-18T10:00:00.000Z'),
      holdSeconds: 0,
      customerId: null,
    });
    tx.callSessions.update.mockResolvedValue({ callId: 'call-1', tenantId: 'tenant-1', linkedid: 'L-1' });
    prisma.rawAmiEvents.create.mockResolvedValue({});

    await service.processNormalizedEvent({
      eventName: 'Hangup',
      tenantId: 'tenant-1',
      linkedid: 'L-1',
      uniqueid: 'U-1',
      raw: { Channel: 'PJSIP/trunk-0000001b' },
    });

    expect(offers.notifyCallEnded).toHaveBeenCalledWith('tenant-1', 'L-1');
  });

  /** 통화 중간 Local 채널이 사라진 것은 종료가 아니다. 여기서 제안을 닫으면 멀쩡한 호를 내린다. */
  it('중간 Local 채널이 끊긴 것으로는 제안을 닫지 않는다', async () => {
    prisma.rawAmiEvents.create.mockResolvedValue({});

    await service.processNormalizedEvent({
      eventName: 'Hangup',
      tenantId: 'tenant-1',
      linkedid: 'L-1',
      uniqueid: 'U-2',
      raw: { Channel: 'Local/1001@agent-offer-00000007;1' },
    });

    expect(offers.notifyCallEnded).not.toHaveBeenCalled();
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
