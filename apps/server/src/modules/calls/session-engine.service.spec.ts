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
