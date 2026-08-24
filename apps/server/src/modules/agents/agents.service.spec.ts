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
    const service = new AgentsService(prisma, reload, ami, agentStateService);

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
    const service = new AgentsService(prisma, reload, ami, agentStateService);

    await service.update('tenant-1', 'agent-1', { sipPassword: null });

    expect(prisma.agents.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sipPassword: null }),
      }),
    );
    expect(reload.scheduleReload).toHaveBeenCalledWith('tenant-1');
  });
});
