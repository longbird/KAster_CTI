import { AsteriskConfigService } from './asterisk-config.service';

describe('AsteriskConfigService blocklist import', () => {
  it('rejects invalid forwarding schedule times before saving a forwarding rule', async () => {
    const prisma = {
      asteriskDid: {
        findFirst: jest.fn().mockResolvedValue({ id: 'did-1', directQueue: 'sales', ivrMenuId: null }),
      },
      asteriskForwardingRules: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'rule-1',
          tenantId: 'tenant-1',
          didId: 'did-1',
          forwardType: 'QUEUE',
          targetValue: 'night',
          forwardTriggerMode: 'IMMEDIATE',
          queueWaitSeconds: null,
          stickyCallbackWindowMinutes: null,
          conditionType: 'TIME_RANGE',
          timeStart: '25:00',
          timeEnd: '06:00',
          daysOfWeek: 'mon',
          scheduleJson: JSON.stringify([
            { conditionType: 'TIME_RANGE', timeStart: '25:00', timeEnd: '06:00', daysOfWeek: ['mon'] },
          ]),
          description: null,
          enabled: true,
          did: { id: 'did-1', did: '0212345678', description: null },
        }),
      },
      queues: {
        findFirst: jest.fn().mockResolvedValue({ queueId: 'queue-1' }),
      },
    } as any;
    const reload = { scheduleReload: jest.fn() } as any;
    const service = new AsteriskConfigService(prisma, reload, {} as any, {} as any);

    await expect(
      service.createForwardingRule('tenant-1', {
        didId: 'did-1',
        forwardType: 'QUEUE',
        targetValue: 'night',
        forwardTriggerMode: 'IMMEDIATE',
        schedules: [
          {
            conditionType: 'TIME_RANGE',
            timeStart: '25:00',
            timeEnd: '06:00',
            daysOfWeek: ['mon'],
          },
        ],
      }),
    ).rejects.toThrow('timeStart must be in HH:mm format');
    expect(prisma.asteriskForwardingRules.create).not.toHaveBeenCalled();
    expect(reload.scheduleReload).not.toHaveBeenCalled();
  });

  it('stores trunk display number without changing caller ID policy', async () => {
    const prisma = {
      asteriskTrunk: {
        create: jest.fn().mockResolvedValue({
          id: 'trunk-1',
          tenantId: 'tenant-1',
          name: 'KT 15991234',
          host: '203.0.113.10',
          port: 5060,
          username: '',
          password: '',
          fromDomain: '',
          displayNumber: '1234',
          codecs: 'alaw,ulaw',
          enabled: true,
        }),
      },
    } as any;
    const reload = { scheduleReload: jest.fn() } as any;
    const service = new AsteriskConfigService(prisma, reload, {} as any, {} as any);

    const result = await service.createTrunk('tenant-1', {
      name: 'KT 15991234',
      host: '203.0.113.10',
      displayNumber: '1234',
    });

    expect(prisma.asteriskTrunk.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-1',
        displayNumber: '1234',
      }),
    });
    expect(result).toMatchObject({
      displayNumber: '1234',
      computedDisplayNumber: '1234',
    });
    expect(reload.scheduleReload).toHaveBeenCalledWith('tenant-1');
  });

  it('computes a trunk display number from the trunk name when no manual value exists', async () => {
    const prisma = {
      asteriskTrunk: {
        findMany: jest.fn().mockResolvedValue([{
          id: 'trunk-1',
          tenantId: 'tenant-1',
          name: 'KT 15991234',
          host: '203.0.113.10',
          port: 5060,
          username: '',
          password: '',
          fromDomain: '',
          displayNumber: null,
          codecs: 'alaw,ulaw',
          enabled: true,
        }]),
      },
    } as any;
    const service = new AsteriskConfigService(prisma, { scheduleReload: jest.fn() } as any, {} as any, {} as any);

    await expect(service.getTrunks('tenant-1')).resolves.toEqual([
      expect.objectContaining({
        displayNumber: null,
        computedDisplayNumber: '1234',
      }),
    ]);
  });

  it('schedules an Asterisk reload when an agent SIP password is cleared', async () => {
    const prisma = {
      agents: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({ agentId: 'agent-1', tenantId: 'tenant-1' })
          .mockResolvedValueOnce({
            agentId: 'agent-1',
            tenantId: 'tenant-1',
            sipPassword: null,
          }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    } as any;
    const reload = { scheduleReload: jest.fn() } as any;
    const service = new AsteriskConfigService(prisma, reload, {} as any, {} as any);

    await service.updateAgentSipPassword('tenant-1', 'agent-1', '   ');

    expect(prisma.agents.updateMany).toHaveBeenCalledWith({
      where: { agentId: 'agent-1', tenantId: 'tenant-1' },
      data: { sipPassword: null },
    });
    expect(reload.scheduleReload).toHaveBeenCalledWith('tenant-1');
  });

  it('imports phone and description rows with default EXACT active entries', async () => {
    const prisma = {
      asteriskBlocklistEntry: {
        create: jest.fn().mockResolvedValue({
          id: 'block-1',
          tenantId: 'tenant-1',
          matchType: 'EXACT',
          phoneNumber: '01012345678',
          description: '악성 민원',
          isActive: true,
        }),
      },
    } as any;
    const reload = { scheduleReload: jest.fn() } as any;
    const service = new AsteriskConfigService(prisma, reload, {} as any, {} as any);

    const result = await service.importBlocklistEntries('tenant-1', [
      { 전화번호: '010-1234-5678', 사유: '악성 민원' },
    ]);

    expect(prisma.asteriskBlocklistEntry.create).toHaveBeenCalledWith({
      data: {
        tenantId: 'tenant-1',
        matchType: 'EXACT',
        phoneNumber: '01012345678',
        description: '악성 민원',
        isActive: true,
      },
    });
    expect(result.data.summary).toEqual({
      successCount: 1,
      skippedCount: 0,
      failedCount: 0,
    });
    expect(reload.scheduleReload).toHaveBeenCalledWith('tenant-1');
  });

  it('stores the selected branch when creating a manual blocklist entry', async () => {
    const prisma = {
      branches: {
        findFirst: jest.fn().mockResolvedValue({ branchId: '11111111-1111-4111-8111-111111111111' }),
      },
      asteriskBlocklistEntry: {
        create: jest.fn().mockResolvedValue({
          id: 'block-1',
          tenantId: 'tenant-1',
          branchId: '11111111-1111-4111-8111-111111111111',
          matchType: 'EXACT',
          phoneNumber: '01012345678',
          description: '지사 차단',
          isActive: true,
        }),
      },
    } as any;
    const reload = { scheduleReload: jest.fn() } as any;
    const service = new AsteriskConfigService(prisma, reload, {} as any, {} as any);

    await service.createBlocklistEntry('tenant-1', {
      matchType: 'EXACT',
      phoneNumber: '010-1234-5678',
      branchId: '11111111-1111-4111-8111-111111111111',
      description: '지사 차단',
      isActive: true,
    });

    expect(prisma.branches.findFirst).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', branchId: '11111111-1111-4111-8111-111111111111' },
      select: { branchId: true },
    });
    expect(prisma.asteriskBlocklistEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        branchId: '11111111-1111-4111-8111-111111111111',
      }),
    });
  });

  it('reports duplicate blocklist numbers as skipped rows', async () => {
    const prisma = {
      asteriskBlocklistEntry: {
        create: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'block-1',
            tenantId: 'tenant-1',
            matchType: 'EXACT',
            phoneNumber: '01011112222',
            description: null,
            isActive: true,
          })
          .mockRejectedValueOnce({ code: 'P2002' }),
      },
    } as any;
    const reload = { scheduleReload: jest.fn() } as any;
    const service = new AsteriskConfigService(prisma, reload, {} as any, {} as any);

    const result = await service.importBlocklistEntries('tenant-1', [
      { 전화번호: '01011112222', 사유: '' },
      { 전화번호: '01011112222', 사유: '중복' },
    ]);

    expect(result.data.summary).toEqual({
      successCount: 1,
      skippedCount: 1,
      failedCount: 0,
    });
    expect(result.data.failures).toEqual([]);
  });
});
