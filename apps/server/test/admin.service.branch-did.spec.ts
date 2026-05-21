import { BadRequestException } from '@nestjs/common';
import { AdminService } from '../src/modules/admin/admin.service';

function createService() {
  const prisma = {
    branches: { findFirst: jest.fn() },
    branchDids: { findMany: jest.fn() },
    asteriskForwardingRules: { findMany: jest.fn() },
    $transaction: jest.fn(),
  } as any;
  const asteriskReloadService = { executeReload: jest.fn() } as any;
  return {
    prisma,
    service: new AdminService(
      prisma,
      {} as any,
      asteriskReloadService,
      {} as any,
      {} as any,
      { publish: jest.fn() } as any,
    ),
  };
}

describe('AdminService updateBranchMappings DID conflict', () => {
  it('rejects DIDs already linked to another branch with that branch name', async () => {
    const { prisma, service } = createService();
    prisma.branches.findFirst.mockResolvedValueOnce({
      branchId: 'branch-b',
      queueMappings: [],
      didMappings: [],
      settingsProfile: null,
    });
    prisma.branchDids.findMany.mockResolvedValueOnce([
      { branch: { branchName: '본사' } },
    ]);

    await expect(
      service.updateBranchMappings('tenant-1', 'branch-b', { didIds: ['did-1'] } as any),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.branchDids.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        didId: { in: ['did-1'] },
        branchId: { not: 'branch-b' },
      },
      select: { branch: { select: { branchName: true } } },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('skips the conflict check when didIds is omitted', async () => {
    const { prisma, service } = createService();
    prisma.branches.findFirst.mockResolvedValueOnce({
      branchId: 'branch-b',
      queueMappings: [],
      didMappings: [],
      settingsProfile: null,
    });
    prisma.$transaction.mockResolvedValueOnce(undefined);
    const getSpy = jest
      .spyOn(service, 'getBranchMappings')
      .mockResolvedValue({ success: true, data: null as any, error: null });

    await service.updateBranchMappings('tenant-1', 'branch-b', {} as any);

    expect(prisma.branchDids.findMany).not.toHaveBeenCalled();
    getSpy.mockRestore();
  });

  it('rejects forwarding rules outside the branch DID scope', async () => {
    const { prisma, service } = createService();
    jest
      .spyOn(service, 'getBranchMappings')
      .mockResolvedValue({ success: true, data: null as any, error: null });
    prisma.branches.findFirst.mockResolvedValueOnce({
      branchId: 'branch-b',
      queueMappings: [],
      didMappings: [{ didId: 'did-branch' }],
      settingsProfile: null,
    });
    prisma.asteriskForwardingRules.findMany.mockResolvedValueOnce([
      { id: 'rule-other', didId: 'did-other' },
    ]);

    await expect(
      service.updateBranchMappings('tenant-1', 'branch-b', {
        settingsProfile: {
          routing: { representativeDidId: 'did-branch' },
          forwarding: { enabled: true, ids: ['rule-other'] },
        },
      } as any),
    ).rejects.toThrow('지사에 연결되지 않은 DID의 착신전환 규칙은 선택할 수 없습니다.');

    expect(prisma.asteriskForwardingRules.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        id: { in: ['rule-other'] },
        enabled: true,
      },
      select: { id: true, didId: true },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
