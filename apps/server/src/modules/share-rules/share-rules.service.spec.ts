import { ShareRulesService } from './share-rules.service';

describe('ShareRulesService', () => {
  it('syncs linked branch queues when share rule agents are saved', async () => {
    const tx = {
      shareRules: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({ shareRuleId: 'rule-1' })
          .mockResolvedValueOnce({
            shareRuleId: 'rule-1',
            isActive: true,
            agents: [
              { agentId: 'agent-1', priority: 10, agent: { agentId: 'agent-1', isActive: true } },
            ],
            agentGroups: [
              {
                priority: 20,
                agentGroup: {
                  agents: [
                    { agentId: 'agent-2', agentCode: 'A002' },
                    { agentId: 'agent-1', agentCode: 'A001' },
                  ],
                },
              },
            ],
            branches: [{ branchId: 'branch-1' }],
          }),
      },
      shareRuleAgents: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      shareRuleAgentGroups: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      branchQueues: {
        findMany: jest.fn().mockResolvedValue([{ queueId: 'queue-1' }]),
      },
      queueAgentMembers: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
    };
    const prisma = {
      shareRules: tx.shareRules,
      $transaction: jest.fn(async (callback: (client: any) => unknown) => callback(tx)),
    } as any;
    const reload = { scheduleReload: jest.fn() } as any;
    const service = new ShareRulesService(prisma, reload);

    const result = await service.putAgents('tenant-1', 'rule-1', {
      agents: [{ agentId: 'agent-1', priority: 10 }],
      agentGroups: [{ agentGroupId: 'group-1', priority: 20 }],
    });

    expect(tx.queueAgentMembers.deleteMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', queueId: { in: ['queue-1'] } },
    });
    expect(tx.queueAgentMembers.createMany).toHaveBeenCalledWith({
      data: [
        {
          tenantId: 'tenant-1',
          queueId: 'queue-1',
          agentId: 'agent-1',
          penalty: 0,
          memberOrder: 0,
          isActive: true,
        },
        {
          tenantId: 'tenant-1',
          queueId: 'queue-1',
          agentId: 'agent-2',
          penalty: 0,
          memberOrder: 1,
          isActive: true,
        },
      ],
    });
    expect(result).toEqual({
      ok: true,
      agents: 1,
      agentGroups: 1,
      sync: { queueCount: 1, memberCount: 2 },
    });
    expect(reload.scheduleReload).toHaveBeenCalledWith('tenant-1');
  });
});
