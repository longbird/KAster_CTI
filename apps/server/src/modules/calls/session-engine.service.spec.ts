import { Prisma } from '@prisma/client';
import { computeFingerprint } from './session-engine.service';
import { SessionEngineService } from './session-engine.service';

describe('computeFingerprint', () => {
  it('distinguishes Smart ARS UserEvent stages emitted in the same second', () => {
    const base = {
      nodeId: 'node-1',
      eventName: 'UserEvent',
      linkedid: '1777273943.1589',
      uniqueid: '1777273943.1589',
      channel: 'PJSIP/loadtest-0001',
      eventTime: '2026-04-27T07:12:25.100Z',
      UserEvent: 'KasterSmartArs',
      Digit: '1',
    };

    const selection = computeFingerprint({ ...base, Stage: 'selection', Action: 'OPT_OUT', Result: 'selected' });
    const action = computeFingerprint({ ...base, Stage: 'action', Action: 'OPT_OUT', Result: 'started' });
    const result = computeFingerprint({ ...base, Stage: 'result', Action: 'OPT_OUT', Result: 'SUCCESS' });

    expect(new Set([selection, action, result]).size).toBe(3);
  });

  it('uses nested AMI raw fields when computing UserEvent fingerprints', () => {
    const base = {
      nodeId: 'node-1',
      eventName: 'UserEvent',
      linkedid: '1777273943.1589',
      uniqueid: '1777273943.1589',
      channel: 'PJSIP/loadtest-0001',
      eventTime: '2026-04-27T07:12:25.100Z',
    };

    const action = computeFingerprint({
      ...base,
      raw: { UserEvent: 'KasterSmartArs', Stage: 'action', Digit: '1', Action: 'OPT_OUT', Result: 'started' },
    });
    const result = computeFingerprint({
      ...base,
      raw: { UserEvent: 'KasterSmartArs', Stage: 'result', Digit: '1', Action: 'OPT_OUT', Result: 'SUCCESS' },
    });

    expect(action).not.toBe(result);
  });
});

describe('SessionEngineService outbound originate tracking', () => {
  it('classifies the first originate agent channel as outbound with the target customer number', async () => {
    const callCreate = jest.fn(async ({ data }) => ({
      callId: 'call-1',
      ...data,
    }));
    const eventOutboxCreate = jest.fn(async () => ({}));
    const customerPhoneFindFirst = jest.fn(async () => ({ customerId: 'customer-1' }));
    const rawAmiCreate = jest.fn(async () => ({}));
    const prisma = {
      rawAmiEvents: { create: rawAmiCreate },
      agents: { findFirst: jest.fn() },
      $transaction: jest.fn(async (handler: any) => handler({
        callSessions: {
          findFirst: jest.fn(async () => null),
          create: callCreate,
        },
        customerPhones: {
          findFirst: customerPhoneFindFirst,
        },
        eventOutbox: {
          create: eventOutboxCreate,
        },
      })),
    };
    const redis = {
      getClient: () => ({
        set: jest.fn(async () => 'OK'),
      }),
    };
    const service = new SessionEngineService(
      prisma as any,
      redis as any,
      { handle: jest.fn() } as any,
    );

    service.registerPendingOriginate({
      tenantId: 'tenant-1',
      agentExtension: '1001',
      phoneNumber: '01034623453',
      callerId: '07052346380',
    });

    await service.processNormalizedEvent({
      eventName: 'Newchannel',
      tenantId: 'tenant-1',
      linkedid: '1778231780.173',
      uniqueid: '1778231780.173',
      ani: '1001',
      dnis: 's',
      eventTime: '2026-05-08T09:16:20.310Z',
      raw: {
        Event: 'Newchannel',
        Channel: 'PJSIP/1001-00000072',
        Context: 'agent-phone-1001',
        Exten: 's',
        CallerIDNum: '1001',
      },
    });

    expect(customerPhoneFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        normalizedPhone: '01034623453',
      }),
    }));
    expect(callCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        direction: 'outbound',
        ani: '01034623453',
        aniNormalized: '01034623453',
        dnis: '07052346380',
        customerId: 'customer-1',
      }),
    }));
  });
});

describe('SessionEngineService dedupe / replay', () => {
  const EVENT = {
    tenantId: '00000000-0000-0000-0000-000000000001',
    eventName: 'QueueCallerJoin',
    linkedid: '1700000000.1',
    uniqueid: '1700000000.1',
    eventTime: '2026-08-08T00:00:00.000Z',
    queueName: 'q1',
  };

  function build(overrides: { create?: jest.Mock; redisSet?: jest.Mock } = {}) {
    const set = overrides.redisSet ?? jest.fn(async () => 'OK');
    const del = jest.fn(async () => 1);
    const client = { set, del };
    const sessionCreate = jest.fn(async ({ data }: any) => ({ callId: 'call-1', ...data }));
    const prisma = {
      rawAmiEvents: { create: overrides.create ?? jest.fn(async () => ({})) },
      agents: { findFirst: jest.fn() },
      $transaction: jest.fn(async (handler: any) => handler({
        callSessions: { findFirst: jest.fn(async () => null), create: sessionCreate },
        customerPhones: { findFirst: jest.fn(async () => null) },
        eventOutbox: { create: jest.fn(async () => ({})) },
      })),
    };
    const redis = { getClient: () => client };
    const service = new SessionEngineService(prisma as any, redis as any, { handle: jest.fn() } as any);
    return { service, set, del, prisma, sessionCreate };
  }

  it('DB insert 가 실패하면 선점한 dedupe 키를 해제한다', async () => {
    const { service, del } = build({ create: jest.fn(async () => { throw new Error('db down'); }) });

    await expect(service.processNormalizedEvent({ ...EVENT })).rejects.toThrow('db down');

    expect(del).toHaveBeenCalledWith(expect.stringMatching(/^dedupe:ami:/));
  });

  it('정상 경로는 dedupe 에 걸리면 상태 전이를 하지 않는다', async () => {
    const { service, prisma } = build({ redisSet: jest.fn(async () => null) });

    await service.processNormalizedEvent({ ...EVENT });

    expect(prisma.rawAmiEvents.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('replay 모드는 Redis dedupe 를 건너뛴다', async () => {
    // 장애 중 선점된 키가 아직 남아 있는 상황을 재현한다
    const { service, set, prisma } = build({ redisSet: jest.fn(async () => null) });

    await service.processNormalizedEvent({ ...EVENT }, { replay: true });

    expect(set).not.toHaveBeenCalled();
    expect(prisma.rawAmiEvents.create).toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('replay 모드는 raw 행이 이미 있어도 상태 전이를 계속한다', async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError('unique', {
      code: 'P2002',
      clientVersion: '5.22.0',
    });
    const { service, prisma } = build({ create: jest.fn(async () => { throw p2002; }) });

    await service.processNormalizedEvent({ ...EVENT }, { replay: true });

    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('정상 경로는 raw 행이 이미 있으면 상태 전이 전에 멈춘다', async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError('unique', {
      code: 'P2002',
      clientVersion: '5.22.0',
    });
    const { service, prisma, del } = build({ create: jest.fn(async () => { throw p2002; }) });

    await service.processNormalizedEvent({ ...EVENT });

    expect(prisma.$transaction).not.toHaveBeenCalled();
    // P2002 는 정상적인 중복이므로 dedupe 선점을 풀면 안 된다
    expect(del).not.toHaveBeenCalled();
  });
});
