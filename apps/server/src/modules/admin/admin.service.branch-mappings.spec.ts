import { AdminService } from './admin.service';

describe('AdminService getBranchMappings forwarding rule details', () => {
  it('returns forwarding trigger, retry, and schedule fields for branch option labels', async () => {
    const prisma = {
      branches: {
        findFirst: jest.fn().mockResolvedValue({
          branchId: 'branch-1',
          branchCode: 'BR1',
          branchName: '본점',
          description: null,
          isActive: true,
          settingsProfile: { forwarding: { enabled: true, ids: ['rule-1'] } },
          agentMappings: [],
          queueMappings: [],
          didMappings: [],
        }),
      },
      agents: { findMany: jest.fn().mockResolvedValue([]) },
      queues: { findMany: jest.fn().mockResolvedValue([]) },
      asteriskDid: { findMany: jest.fn().mockResolvedValue([]) },
      asteriskPrompt: { findMany: jest.fn().mockResolvedValue([]) },
      asteriskIvrMenu: { findMany: jest.fn().mockResolvedValue([]) },
      asteriskForwardingRules: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'rule-1',
            forwardType: 'EXTERNAL_NUMBER',
            targetValue: '01012345678',
            forwardTriggerMode: 'AFTER_QUEUE_WAIT',
            queueWaitSeconds: 30,
            stickyCallbackWindowMinutes: 15,
            conditionType: 'TIME_RANGE',
            timeStart: '22:00',
            timeEnd: '06:00',
            daysOfWeek: 'mon,tue',
            scheduleJson: JSON.stringify([
              {
                conditionType: 'TIME_RANGE',
                timeStart: '22:00',
                timeEnd: '06:00',
                daysOfWeek: ['mon', 'tue'],
              },
            ]),
            did: {
              id: 'did-1',
              did: '0212345678',
              description: '대표 DID',
            },
          },
        ]),
      },
      tenantSystemSettings: { findUnique: jest.fn().mockResolvedValue(null) },
      tenantSmsTemplate: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new AdminService(
      prisma as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { listForTenant: jest.fn().mockResolvedValue({}) } as any,
    );

    const result = await service.getBranchMappings('tenant-1', 'branch-1');

    expect(result.data.availableForwardingRules).toEqual([
      expect.objectContaining({
        id: 'rule-1',
        forwardTriggerMode: 'AFTER_QUEUE_WAIT',
        queueWaitSeconds: 30,
        stickyCallbackWindowMinutes: 15,
        timeStart: '22:00',
        timeEnd: '06:00',
        daysOfWeek: ['mon', 'tue'],
        schedules: [
          {
            conditionType: 'TIME_RANGE',
            timeStart: '22:00',
            timeEnd: '06:00',
            daysOfWeek: ['mon', 'tue'],
          },
        ],
      }),
    ]);
  });
});
