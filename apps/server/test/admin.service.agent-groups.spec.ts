import { AdminService } from '../src/modules/admin/admin.service';

function createService() {
  const prisma = {
    agentGroups: {
      findMany: jest.fn(),
    },
    agents: {
      groupBy: jest.fn(),
    },
    queueAgentMembers: {
      findMany: jest.fn(),
    },
  } as any;

  return {
    prisma,
    service: new AdminService(
      prisma,
      {} as any,
      { executeReload: jest.fn() } as any,
      {} as any,
      {} as any,
      { publish: jest.fn() } as any,
    ),
  };
}

describe('AdminService listAgentGroups', () => {
  it('상담원 그룹별 연결된 호 분배룰을 중복 없이 반환한다', async () => {
    const { prisma, service } = createService();
    prisma.agentGroups.findMany.mockResolvedValue([
      {
        agentGroupId: 'group-1',
        groupCode: 'SALES',
        groupName: '영업팀',
        isActive: true,
      },
      {
        agentGroupId: 'group-2',
        groupCode: 'SUPPORT',
        groupName: '지원팀',
        isActive: true,
      },
    ]);
    prisma.agents.groupBy.mockResolvedValue([
      { agentGroupId: 'group-1', _count: { agentId: 2 } },
      { agentGroupId: 'group-2', _count: { agentId: 1 } },
    ]);
    prisma.queueAgentMembers.findMany.mockResolvedValue([
      {
        agent: { agentGroupId: 'group-1' },
        queue: { queueId: 'queue-1', queueName: 'sales', queueDisplayName: '영업 대표' },
      },
      {
        agent: { agentGroupId: 'group-1' },
        queue: { queueId: 'queue-1', queueName: 'sales', queueDisplayName: '영업 대표' },
      },
      {
        agent: { agentGroupId: 'group-2' },
        queue: { queueId: 'queue-2', queueName: 'support', queueDisplayName: null },
      },
    ]);

    const result = await service.listAgentGroups('tenant-1');

    expect(prisma.queueAgentMembers.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        isActive: true,
        agent: { agentGroupId: { in: ['group-1', 'group-2'] }, isActive: true },
        queue: { isActive: true },
      },
      select: {
        agent: { select: { agentGroupId: true } },
        queue: { select: { queueId: true, queueName: true, queueDisplayName: true } },
      },
      orderBy: [{ queue: { queueName: 'asc' } }],
    });
    expect(result.data).toEqual([
      expect.objectContaining({
        agentGroupId: 'group-1',
        memberCount: 2,
        distributionRuleCount: 1,
        distributionRules: [{ queueId: 'queue-1', queueName: 'sales', queueDisplayName: '영업 대표' }],
      }),
      expect.objectContaining({
        agentGroupId: 'group-2',
        memberCount: 1,
        distributionRuleCount: 1,
        distributionRules: [{ queueId: 'queue-2', queueName: 'support', queueDisplayName: null }],
      }),
    ]);
  });
});
