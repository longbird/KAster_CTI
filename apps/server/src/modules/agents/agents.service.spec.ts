import { AgentsService } from './agents.service';

describe('AgentsService', () => {
  it('schedules a PBX reload when extension display name changes', async () => {
    const prisma = {
      agents: {
        findFirst: jest.fn().mockResolvedValueOnce({
          agentId: 'agent-1',
          tenantId: 'tenant-1',
          loginId: 'agent1001',
          extension: '1001',
          extensionDisplayName: null,
        }),
        update: jest.fn().mockResolvedValue({
          agentId: 'agent-1',
          extensionDisplayName: '본사 1번 데스크',
        }),
      },
    } as any;
    const reload = { scheduleReload: jest.fn() } as any;
    const ami = { sendActionWithResponse: jest.fn().mockResolvedValue([]) } as any;
    const agentStateService = { changeStatus: jest.fn() } as any;
    const presence = { connectedAgentIds: jest.fn().mockResolvedValue(new Set()) } as any;
    const service = new AgentsService(prisma, reload, ami, agentStateService, presence);

    await service.update('tenant-1', 'agent-1', { extensionDisplayName: ' 본사 1번 데스크 ' });

    expect(prisma.agents.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ extensionDisplayName: '본사 1번 데스크' }),
      }),
    );
    expect(reload.scheduleReload).toHaveBeenCalledWith('tenant-1');
  });

  // 삭제 신호는 null 이다. 빈 문자열은 "변경 없음" 으로 바뀌었다 — 상담원 편집 화면이
  // 입력칸 없는 값까지 폼째 보내면서 SIP 비밀번호를 조용히 지우던 것을 막기 위해서다
  // (2026-08-24, 내선 3304 등록 실패). 자세한 계약은 agents.service.sip-password.spec.ts 참조.
  it('schedules an Asterisk reload when SIP password is cleared (null) through agent settings', async () => {
    const prisma = {
      agents: {
        findFirst: jest.fn().mockResolvedValueOnce({
          agentId: 'agent-1',
          tenantId: 'tenant-1',
          loginId: 'agent1001',
          extension: '1001',
        }),
        update: jest.fn().mockResolvedValue({
          agentId: 'agent-1',
          sipPassword: null,
        }),
      },
    } as any;
    const reload = { scheduleReload: jest.fn() } as any;
    const ami = { sendActionWithResponse: jest.fn().mockResolvedValue([]) } as any;
    const agentStateService = { changeStatus: jest.fn() } as any;
    const presence = { connectedAgentIds: jest.fn().mockResolvedValue(new Set()) } as any;
    const service = new AgentsService(prisma, reload, ami, agentStateService, presence);

    await service.update('tenant-1', 'agent-1', { sipPassword: null });

    expect(prisma.agents.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sipPassword: null }),
      }),
    );
    expect(reload.scheduleReload).toHaveBeenCalledWith('tenant-1');
  });
  describe('listForTenant 의 로그인 표시', () => {
    // refresh token 은 14일짜리라, 앱을 그냥 닫은 자리도 2주 동안 살아 있다.
    // 그걸 로그인 신호로 쓰면 라이브 모니터가 없는 사람을 온라인으로 세운다.
    const listPrisma = () => ({
      agents: {
        findMany: jest.fn().mockResolvedValue([
          { agentId: 'agent-1', extension: '1001', isActive: true },
        ]),
      },
      agentStatusHistory: { findMany: jest.fn().mockResolvedValue([]) },
      refreshTokens: {
        findMany: jest.fn().mockResolvedValue([
          {
            agentId: 'agent-1',
            issuedAt: new Date('2026-08-20T00:00:00Z'),
            expiresAt: new Date('2099-01-01T00:00:00Z'),
          },
        ]),
      },
    }) as any;

    const build = (connected: string[]) => {
      const prisma = listPrisma();
      const presence = {
        connectedAgentIds: jest.fn().mockResolvedValue(new Set(connected)),
      } as any;
      const ami = { sendActionWithResponse: jest.fn().mockResolvedValue([]) } as any;
      const service = new AgentsService(
        prisma,
        { scheduleReload: jest.fn() } as any,
        ami,
        { changeStatus: jest.fn() } as any,
        presence,
      );
      return { service, presence };
    };

    it('앱이 끊긴 상담원은 토큰이 남아 있어도 로그아웃으로 본다', async () => {
      const { service } = build([]);

      const result = await service.listForTenant('tenant-1');

      expect(result.data[0].loginStatus).toBe('LOGGED_OUT');
      expect(result.data[0].appConnected).toBe(false);
      expect(result.data[0].canCall).toBe(false);
    });

    it('앱이 붙어 있고 세션도 살아 있으면 로그인으로 본다', async () => {
      const { service, presence } = build(['agent-1']);

      const result = await service.listForTenant('tenant-1');

      expect(result.data[0].loginStatus).toBe('LOGGED_IN');
      expect(presence.connectedAgentIds).toHaveBeenCalledWith('tenant-1', ['agent-1']);
    });
  });
});
