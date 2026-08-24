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
      asteriskDid: {
        findFirst: jest.fn().mockResolvedValue(null),
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

  it('uses a DID representative number as the automatic trunk display fallback', async () => {
    const prisma = {
      asteriskTrunk: {
        findMany: jest.fn().mockResolvedValue([{
          id: 'trunk-1',
          tenantId: 'tenant-1',
          name: 'KT primary',
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
      asteriskDid: {
        findFirst: jest.fn().mockResolvedValue({ representativeNumber: '15991234' }),
      },
    } as any;
    const service = new AsteriskConfigService(prisma, { scheduleReload: jest.fn() } as any, {} as any, {} as any);

    await expect(service.getTrunks('tenant-1')).resolves.toEqual([
      expect.objectContaining({
        displayNumber: null,
        computedDisplayNumber: '1234',
      }),
    ]);
    expect(prisma.asteriskDid.findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        representativeNumber: { not: null },
        enabled: true,
      },
      orderBy: { did: 'asc' },
      select: { representativeNumber: true },
    });
  });

  it('rejects a manual trunk display number that contains non-digit characters', async () => {
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
          displayNumber: '12',
          codecs: 'alaw,ulaw',
          enabled: true,
        }),
      },
    } as any;
    const reload = { scheduleReload: jest.fn() } as any;
    const service = new AsteriskConfigService(prisma, reload, {} as any, {} as any);

    await expect(service.createTrunk('tenant-1', {
      name: 'KT 15991234',
      host: '203.0.113.10',
      displayNumber: '12AB',
    })).rejects.toThrow('displayNumber must be 2-16 digits');
    expect(prisma.asteriskTrunk.create).not.toHaveBeenCalled();
    expect(reload.scheduleReload).not.toHaveBeenCalled();
  });

  it('creates a default trunk group and clears the previous default group', async () => {
    const createdGroup = {
      id: 'group-1',
      tenantId: 'tenant-1',
      name: '대표 발신 그룹',
      description: null,
      strategy: 'PRIORITY',
      isDefault: true,
      enabled: true,
      members: [],
    };
    const tx = {
      asteriskTrunkGroup: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue(createdGroup),
      },
    };
    const prisma = {
      asteriskTrunk: {
        findMany: jest.fn().mockResolvedValue([{ id: 'trunk-1' }, { id: 'trunk-2' }]),
      },
      $transaction: jest.fn((callback) => callback(tx)),
    } as any;
    const reload = { scheduleReload: jest.fn() } as any;
    const service = new AsteriskConfigService(prisma, reload, {} as any, {} as any);

    const result = await service.createTrunkGroup('tenant-1', {
      name: ' 대표 발신 그룹 ',
      isDefault: true,
      members: [
        { trunkId: 'trunk-1', priority: 100 },
        { trunkId: 'trunk-2', priority: 200, enabled: false },
      ],
    });

    expect(tx.asteriskTrunkGroup.updateMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', isDefault: true },
      data: { isDefault: false },
    });
    expect(tx.asteriskTrunkGroup.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-1',
        name: '대표 발신 그룹',
        strategy: 'PRIORITY',
        isDefault: true,
        members: {
          create: [
            { tenantId: 'tenant-1', trunkId: 'trunk-1', priority: 100, enabled: true },
            { tenantId: 'tenant-1', trunkId: 'trunk-2', priority: 200, enabled: false },
          ],
        },
      }),
      include: expect.any(Object),
    });
    expect(result).toBe(createdGroup);
    expect(reload.scheduleReload).toHaveBeenCalledWith('tenant-1');
  });

  it('rejects a trunk group with duplicate trunks', async () => {
    const prisma = {
      asteriskTrunk: {
        findMany: jest.fn(),
      },
    } as any;
    const reload = { scheduleReload: jest.fn() } as any;
    const service = new AsteriskConfigService(prisma, reload, {} as any, {} as any);

    await expect(service.createTrunkGroup('tenant-1', {
      name: '대표 발신 그룹',
      members: [
        { trunkId: 'trunk-1', priority: 100 },
        { trunkId: 'trunk-1', priority: 200 },
      ],
    })).rejects.toThrow('trunk group cannot contain duplicate trunks');
    expect(prisma.asteriskTrunk.findMany).not.toHaveBeenCalled();
    expect(reload.scheduleReload).not.toHaveBeenCalled();
  });

  it('stores DID direct extension routing after validating the extension', async () => {
    const prisma = {
      agents: {
        findFirst: jest.fn().mockResolvedValue({ agentId: 'agent-1' }),
      },
      asteriskDid: {
        create: jest.fn().mockResolvedValue({
          id: 'did-1',
          tenantId: 'tenant-1',
          did: '07088887777',
          ivrMenuId: null,
          directQueue: null,
          directExtension: '1001',
          enabled: true,
        }),
      },
    } as any;
    const reload = { scheduleReload: jest.fn() } as any;
    const service = new AsteriskConfigService(prisma, reload, {} as any, {} as any);

    await service.createDid('tenant-1', {
      did: '07088887777',
      directExtension: '1001',
      enabled: true,
    });

    expect(prisma.agents.findFirst).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', extension: '1001', isActive: true },
      select: { agentId: true },
    });
    expect(prisma.asteriskDid.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        directQueue: null,
        directExtension: '1001',
      }),
    });
    expect(reload.scheduleReload).toHaveBeenCalledWith('tenant-1');
  });

  it('rejects DID routing when queue and direct extension are both provided', async () => {
    const service = new AsteriskConfigService({} as any, { scheduleReload: jest.fn() } as any, {} as any, {} as any);

    await expect(service.createDid('tenant-1', {
      did: '07088887777',
      directQueue: 'sales',
      directExtension: '1001',
    })).rejects.toThrow('Exactly one of ivrMenuId, directQueue, directExtension is required');
  });

  it('stores speed dial mappings and rejects conflicting codes', async () => {
    const prisma = {
      // 단축번호 코드 충돌 검사는 실제 내선 목록을 근거로 삼는다 (대역 가정 제거, 2026-08-24).
      agents: {
        findMany: jest.fn().mockResolvedValue([{ extension: '1001' }, { extension: '3301' }]),
      },
      asteriskSpeedDial: {
        create: jest.fn().mockResolvedValue({
          id: 'speed-1',
          tenantId: 'tenant-1',
          code: '*01',
          targetNumber: '01012345678',
          displayName: '긴급 연락처',
          description: null,
          enabled: true,
        }),
      },
    } as any;
    const reload = { scheduleReload: jest.fn() } as any;
    const service = new AsteriskConfigService(prisma, reload, {} as any, {} as any);

    await service.createSpeedDial('tenant-1', {
      code: '*01',
      targetNumber: '010-1234-5678',
      displayName: ' 긴급 연락처 ',
    });

    expect(prisma.asteriskSpeedDial.create).toHaveBeenCalledWith({
      data: {
        tenantId: 'tenant-1',
        code: '*01',
        targetNumber: '01012345678',
        displayName: '긴급 연락처',
        description: null,
        enabled: true,
      },
    });
    expect(reload.scheduleReload).toHaveBeenCalledWith('tenant-1');

    await expect(service.createSpeedDial('tenant-1', {
      code: '0101',
      targetNumber: '01012345678',
    })).rejects.toThrow('speed dial code conflicts with internal or outbound dialing patterns');

    // 내선 3301 이 있으므로 _[13]XXX 가 열린다. 3999 는 내선에 없어도 그 패턴이 먼저 잡아간다.
    await expect(service.createSpeedDial('tenant-1', {
      code: '3999',
      targetNumber: '01012345678',
    })).rejects.toThrow('speed dial code conflicts with internal or outbound dialing patterns');
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
