import { AgentStateService } from './agent-state.service';

function buildDeps() {
  const prisma = {
    agentStatusHistory: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn().mockResolvedValue({ statusHistoryId: 'history-1' }),
    },
    agents: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        agentId: 'agent-1',
        tenantId: 'tenant-1',
        extension: '1001',
      }),
    },
  } as any;
  const eventBus = { publish: jest.fn().mockResolvedValue(undefined) } as any;
  const queuesService = {
    getSummary: jest.fn().mockResolvedValue({ data: { queues: [] } }),
  } as any;
  const queuePause = { apply: jest.fn().mockResolvedValue(undefined) } as any;

  return { prisma, eventBus, queuesService, queuePause };
}

describe('AgentStateService', () => {
  it('hands the queue pause decision to the single pause path on a status change', async () => {
    const { prisma, eventBus, queuesService, queuePause } = buildDeps();
    const service = new AgentStateService(prisma, eventBus, queuesService, queuePause);

    await service.changeStatus('agent-1', 'BREAK', 'LUNCH');

    expect(queuePause.apply).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        agentId: 'agent-1',
        extension: '1001',
        statusCode: 'BREAK',
      }),
    );
  });

  // 로그아웃한 자리로 전화를 넘기면 발신자는 빈 내선에서 벨만 듣는다.
  // 소켓이 아직 안 닫혀 있을 수 있으므로 presence 가 아니라 명시적으로 끊긴 것으로 본다.
  it('closes the open status row and pauses the member on logout', async () => {
    const { prisma, eventBus, queuesService, queuePause } = buildDeps();
    const service = new AgentStateService(prisma, eventBus, queuesService, queuePause);

    await service.markLoggedOut('agent-1');

    expect(prisma.agentStatusHistory.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ agentId: 'agent-1', endedAt: null }),
      }),
    );
    expect(prisma.agentStatusHistory.create).not.toHaveBeenCalled();
    expect(queuePause.apply).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        agentId: 'agent-1',
        extension: '1001',
        appConnected: false,
      }),
    );
  });

  it('refreshes the queue summary after a logout so supervisors see the seat empty', async () => {
    const { prisma, eventBus, queuesService, queuePause } = buildDeps();
    const service = new AgentStateService(prisma, eventBus, queuesService, queuePause);

    await service.markLoggedOut('agent-1');

    expect(queuesService.getSummary).toHaveBeenCalledWith('tenant-1');
    expect(eventBus.publish).toHaveBeenCalledWith('queue.summary.updated', expect.anything());
  });
});
