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

describe('AdminService SMDR settings', () => {
  it('persists normalized SMDR external alert details in branch settings', async () => {
    const { prisma, service } = createService();

    await service.updateBranchMappings('tenant-1', 'branch-1', {
      settingsProfile: {
        smdr: {
          enabled: true,
          endpointUrl: ' https://ops.example.com/smdr ',
          authToken: ' token-123 ',
          secret: ' secret-456 ',
          timeoutSeconds: 20.8,
          eventTypes: ['CALL_END', 'CALL_START', 'CALL_END', ' '],
        },
      },
    });

    expect(prisma.branches.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          settingsProfile: expect.objectContaining({
            smdr: {
              enabled: true,
              endpointUrl: 'https://ops.example.com/smdr',
              authToken: 'token-123',
              secret: 'secret-456',
              timeoutSeconds: 20,
              eventTypes: ['CALL_END', 'CALL_START'],
            },
          }),
        }),
      }),
    );
  });

  it('rejects enabled SMDR external alerts without an endpoint URL', async () => {
    const { service } = createService();

    await expect(
      service.updateBranchMappings('tenant-1', 'branch-1', {
        settingsProfile: {
          smdr: {
            enabled: true,
            eventTypes: ['CALL_END'],
          },
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
