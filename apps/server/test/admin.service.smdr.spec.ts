import { BadRequestException } from '@nestjs/common';
import { AdminService } from '../src/modules/admin/admin.service';

function createService() {
  const prisma = {
    branches: {
      findFirst: jest.fn().mockResolvedValue({
        branchId: 'branch-1',
        queueMappings: [],
        didMappings: [],
        settingsProfile: null,
      }),
      updateMany: jest.fn(),
    },
    branchDids: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    branchAgents: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    branchQueues: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    tenantSmsTemplate: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    $transaction: jest.fn(async (callback: (tx: any) => Promise<void>) =>
      callback({
        branchAgents: prisma.branchAgents,
        branchQueues: prisma.branchQueues,
        branchDids: { deleteMany: jest.fn(), createMany: jest.fn() },
        branches: {
          updateMany: prisma.branches.updateMany,
        },
      }),
    ),
  } as any;

  const asteriskReloadService = {
    executeReload: jest.fn().mockResolvedValue(undefined),
  };
  const service = new AdminService(
    prisma,
    {} as any,
    asteriskReloadService as any,
    {} as any,
    {} as any,
    {} as any,
  );
  jest.spyOn(service, 'getBranchMappings').mockResolvedValue({ success: true, data: {}, error: null } as any);

  return { prisma, service };
}

describe('AdminService CID(SMDR) settings', () => {
  it('선택하지 않은 프로그램사도 기본값으로 채워 3개를 모두 보존한다', async () => {
    const { prisma, service } = createService();

    await service.updateBranchMappings('tenant-1', 'branch-1', {
      settingsProfile: {
        smdr: {
          enabled: true,
          programs: [
            {
              programKey: 'LOGI',
              enabled: true,
              inboundEnabled: true,
              outboundEnabled: false,
              includeOriginalCallerId: false,
            },
          ],
        },
      },
    });

    expect(prisma.branches.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          settingsProfile: expect.objectContaining({
            smdr: {
              enabled: true,
              programs: [
                {
                  programKey: 'LOGI',
                  inboundEnabled: true,
                  outboundEnabled: false,
                  includeOriginalCallerId: false,
                  enabled: true,
                },
                {
                  programKey: 'CALLMANOR',
                  inboundEnabled: true,
                  outboundEnabled: true,
                  includeOriginalCallerId: true,
                  enabled: false,
                },
                {
                  programKey: 'ICON',
                  inboundEnabled: true,
                  outboundEnabled: true,
                  includeOriginalCallerId: true,
                  enabled: false,
                },
              ],
            },
          }),
        }),
      }),
    );
  });

  it('알 수 없는 programKey 는 버리고 정규 3개 순서를 유지한다', async () => {
    const { prisma, service } = createService();

    await service.updateBranchMappings('tenant-1', 'branch-1', {
      settingsProfile: {
        smdr: {
          enabled: true,
          programs: [
            { programKey: 'UNKNOWN', enabled: true },
            { programKey: 'ICON', enabled: true },
          ],
        },
      },
    });

    const saved = prisma.branches.updateMany.mock.calls[0][0].data.settingsProfile.smdr;
    expect(saved.programs.map((p: any) => p.programKey)).toEqual(['LOGI', 'CALLMANOR', 'ICON']);
    expect(saved.programs.find((p: any) => p.programKey === 'ICON').enabled).toBe(true);
  });

  it('CID 연동을 켰는데 선택한 프로그램사가 없으면 거부한다', async () => {
    const { service } = createService();

    await expect(
      service.updateBranchMappings('tenant-1', 'branch-1', {
        settingsProfile: {
          smdr: { enabled: true, programs: [] },
        },
      }),
    ).rejects.toThrow('CID 연동을 사용하려면 로지/콜마너/아이콘 중 1개 이상 선택해야 합니다.');
  });

  it('선택한 프로그램사가 수신·발신을 모두 끄면 거부한다', async () => {
    const { service } = createService();

    await expect(
      service.updateBranchMappings('tenant-1', 'branch-1', {
        settingsProfile: {
          smdr: {
            enabled: true,
            programs: [
              {
                programKey: 'LOGI',
                enabled: true,
                inboundEnabled: false,
                outboundEnabled: false,
              },
            ],
          },
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('CID 연동이 꺼져 있으면 프로그램사 선택이 없어도 통과한다', async () => {
    const { prisma, service } = createService();

    await service.updateBranchMappings('tenant-1', 'branch-1', {
      settingsProfile: {
        smdr: { enabled: false, programs: [] },
      },
    });

    expect(prisma.branches.updateMany).toHaveBeenCalled();
  });
});
