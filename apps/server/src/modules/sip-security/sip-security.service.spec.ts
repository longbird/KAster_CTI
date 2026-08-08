import { SipSecurityService, extractSipSecuritySignal } from './sip-security.service';

function makeConfig(overrides: Record<string, string> = {}) {
  return {
    get: jest.fn((key: string, fallback?: string) => overrides[key] ?? fallback),
  };
}

function makeRedis() {
  const values = new Map<string, number>();
  const sets = new Map<string, Set<string>>();
  return {
    getClient: () => ({
      incr: jest.fn(async (key: string) => {
        const next = (values.get(key) ?? 0) + 1;
        values.set(key, next);
        return next;
      }),
      expire: jest.fn(async () => 1),
      sadd: jest.fn(async (key: string, value: string) => {
        if (!sets.has(key)) sets.set(key, new Set());
        const before = sets.get(key)!.size;
        sets.get(key)!.add(value);
        return sets.get(key)!.size > before ? 1 : 0;
      }),
      scard: jest.fn(async (key: string) => sets.get(key)?.size ?? 0),
    }),
  };
}

describe('SipSecurityService', () => {
  it('extracts source IP, source number, and target number from SecurityEvent', () => {
    const signal = extractSipSecuritySignal({
      eventName: 'SecurityEvent',
      raw: {
        Event: 'SecurityEvent',
        SecurityEvent: 'InvalidAccountID',
        RemoteAddress: 'IPV4/UDP/217.160.58.58/49373',
        AccountID: '88002',
        RequestURI: 'sip:00390237902850@112.216.252.59:48950',
      },
    });

    expect(signal).toMatchObject({
      sourceIp: '217.160.58.58',
      sourceNumber: '88002',
      targetNumber: '00390237902850',
      securityEvent: 'InvalidAccountID',
    });
  });

  it('registers a temporary number block when the same number repeats in a short window', async () => {
    const prisma = { sipSecurityBlocks: { upsert: jest.fn(async () => ({})) } };
    const service = new SipSecurityService(
      makeConfig({ SIP_SECURITY_NUMBER_THRESHOLD: '2' }) as any,
      prisma as any,
      makeRedis() as any,
    );
    const event = {
      tenantId: 'tenant-1',
      eventName: 'SecurityEvent',
      raw: {
        SecurityEvent: 'InvalidAccountID',
        RemoteAddress: 'IPV4/UDP/217.160.58.58/49373',
        AccountID: '88002',
      },
    };

    await service.processAmiEvent(event);
    await service.processAmiEvent(event);

    expect(prisma.sipSecurityBlocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        blockType: 'NUMBER',
        blockKey: 'NUMBER:88002',
        reason: 'SIP_NUMBER_ABUSE',
      }),
    }));
  });

  it('escalates to an IP block when one IP rotates source numbers', async () => {
    const prisma = { sipSecurityBlocks: { upsert: jest.fn(async () => ({})) } };
    const service = new SipSecurityService(
      makeConfig({
        SIP_SECURITY_NUMBER_THRESHOLD: '99',
        SIP_SECURITY_IP_THRESHOLD: '99',
        SIP_SECURITY_IP_DISTINCT_NUMBER_THRESHOLD: '2',
      }) as any,
      prisma as any,
      makeRedis() as any,
    );

    await service.processAmiEvent({
      tenantId: 'tenant-1',
      eventName: 'SecurityEvent',
      raw: {
        SecurityEvent: 'InvalidAccountID',
        RemoteAddress: 'IPV4/UDP/217.160.58.58/49373',
        AccountID: '88002',
      },
    });
    await service.processAmiEvent({
      tenantId: 'tenant-1',
      eventName: 'SecurityEvent',
      raw: {
        SecurityEvent: 'InvalidAccountID',
        RemoteAddress: 'IPV4/UDP/217.160.58.58/49374',
        AccountID: '179300',
      },
    });

    expect(prisma.sipSecurityBlocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        blockType: 'IP',
        blockKey: 'IP:217.160.58.58',
        reason: 'SIP_IP_NUMBER_ROTATION',
      }),
    }));
  });
});
