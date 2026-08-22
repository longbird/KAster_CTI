import { AgentQueuePauseService } from './agent-queue-pause.service';

function buildDeps(options?: {
  extension?: string | null;
  statusCode?: string | null;
  appConnected?: boolean;
}) {
  const prisma = {
    agents: {
      findFirst: jest.fn().mockResolvedValue(
        options?.extension === null
          ? { agentId: 'agent-1', tenantId: 'tenant-1', extension: null }
          : { agentId: 'agent-1', tenantId: 'tenant-1', extension: options?.extension ?? '1001' },
      ),
    },
    agentStatusHistory: {
      findFirst: jest.fn().mockResolvedValue(
        options?.statusCode === null ? null : { statusCode: options?.statusCode ?? 'AVAILABLE' },
      ),
    },
  } as any;
  const asteriskManager = { setQueuePaused: jest.fn() } as any;
  const listeners: ((change: any) => void)[] = [];
  const presence = {
    isConnected: jest.fn().mockResolvedValue(options?.appConnected ?? true),
    onChange: jest.fn((listener: (change: any) => void) => {
      listeners.push(listener);
      return () => {
        const index = listeners.indexOf(listener);
        if (index >= 0) listeners.splice(index, 1);
      };
    }),
  } as any;

  return { prisma, asteriskManager, presence, listeners };
}

describe('AgentQueuePauseService', () => {
  it('pauses the queue member when the app is gone even though the status is AVAILABLE', async () => {
    const { prisma, asteriskManager, presence } = buildDeps({ appConnected: false });
    const service = new AgentQueuePauseService(prisma, asteriskManager, presence);

    await service.apply({
      tenantId: 'tenant-1',
      agentId: 'agent-1',
      extension: '1001',
      statusCode: 'AVAILABLE',
    });

    expect(asteriskManager.setQueuePaused).toHaveBeenCalledWith('1001', true, expect.anything());
  });

  it('releases the queue member once the app is back and the agent is available', async () => {
    const { prisma, asteriskManager, presence } = buildDeps({ appConnected: true });
    const service = new AgentQueuePauseService(prisma, asteriskManager, presence);

    await service.apply({
      tenantId: 'tenant-1',
      agentId: 'agent-1',
      extension: '1001',
      statusCode: 'AVAILABLE',
    });

    expect(asteriskManager.setQueuePaused).toHaveBeenCalledWith('1001', false, expect.anything());
  });

  // 이석해 둔 채로 앱을 껐다 켠 경우. 접속만 보고 풀면 이석이 조용히 사라진다.
  it('does not release an agent who parked themselves on a break before reconnecting', async () => {
    const { prisma, asteriskManager, presence } = buildDeps({ appConnected: true });
    const service = new AgentQueuePauseService(prisma, asteriskManager, presence);

    await service.apply({
      tenantId: 'tenant-1',
      agentId: 'agent-1',
      extension: '1001',
      statusCode: 'BREAK',
    });

    expect(asteriskManager.setQueuePaused).toHaveBeenCalledWith('1001', true, expect.anything());
  });

  // 로그아웃 시점에는 소켓이 아직 안 닫혀 있을 수 있다. presence 를 믿으면 큐에 남는다.
  it('trusts an explicit appConnected override instead of asking presence', async () => {
    const { prisma, asteriskManager, presence } = buildDeps({ appConnected: true });
    const service = new AgentQueuePauseService(prisma, asteriskManager, presence);

    await service.apply({
      tenantId: 'tenant-1',
      agentId: 'agent-1',
      extension: '1001',
      statusCode: null,
      appConnected: false,
      reason: 'LOGGED_OUT',
    });

    expect(presence.isConnected).not.toHaveBeenCalled();
    expect(asteriskManager.setQueuePaused).toHaveBeenCalledWith('1001', true, 'LOGGED_OUT');
  });

  it('reads the extension and the current status when reconciling after a presence change', async () => {
    const { prisma, asteriskManager, presence } = buildDeps({
      appConnected: false,
      statusCode: 'AVAILABLE',
    });
    const service = new AgentQueuePauseService(prisma, asteriskManager, presence);

    await service.reconcile('tenant-1', 'agent-1');

    expect(prisma.agents.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 'tenant-1', agentId: 'agent-1' }),
      }),
    );
    expect(asteriskManager.setQueuePaused).toHaveBeenCalledWith('1001', true, expect.anything());
  });

  /**
   * 로그아웃해도 access token 은 15분 더 유효하다. 소켓이 안 닫힌 채로 네트워크가
   * 한 번 끊겼다 붙으면 재연결이 reconcile 을 돌리는데, 열린 상태 행이 없다고
   * 정상으로 읽으면 로그아웃한 자리가 큐로 돌아온다.
   */
  it('does not let a logged out seat back into the queue when the app reconnects', async () => {
    const { prisma, asteriskManager, presence } = buildDeps({
      appConnected: true,
      statusCode: null,
    });
    const service = new AgentQueuePauseService(prisma, asteriskManager, presence);

    await service.reconcile('tenant-1', 'agent-1');

    expect(asteriskManager.setQueuePaused).toHaveBeenCalledWith('1001', true, expect.anything());
  });

  it('leaves an agent without an extension alone — Asterisk has no member to pause', async () => {
    const { prisma, asteriskManager, presence } = buildDeps({ extension: null });
    const service = new AgentQueuePauseService(prisma, asteriskManager, presence);

    await service.reconcile('tenant-1', 'agent-1');

    expect(asteriskManager.setQueuePaused).not.toHaveBeenCalled();
  });

  it('reconciles the member whenever presence changes', async () => {
    const { prisma, asteriskManager, presence, listeners } = buildDeps({ appConnected: false });
    const service = new AgentQueuePauseService(prisma, asteriskManager, presence);

    service.onModuleInit();
    expect(listeners).toHaveLength(1);

    await listeners[0]({ tenantId: 'tenant-1', agentId: 'agent-1', connected: false });

    expect(asteriskManager.setQueuePaused).toHaveBeenCalledWith('1001', true, expect.anything());

    service.onModuleDestroy();
    expect(listeners).toHaveLength(0);
  });
});
