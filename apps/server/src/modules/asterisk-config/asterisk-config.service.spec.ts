import { AsteriskConfigService } from './asterisk-config.service';

describe('AsteriskConfigService blocklist import', () => {
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
