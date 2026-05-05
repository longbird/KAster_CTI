import { AsteriskConfigService } from './asterisk-config.service';

describe('AsteriskConfigService blocklist import', () => {
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
