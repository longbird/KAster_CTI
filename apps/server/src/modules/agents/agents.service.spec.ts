import { AgentsService } from './agents.service';

describe('AgentsService', () => {
  it('schedules an Asterisk reload when SIP password is cleared through agent settings', async () => {
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
    const service = new AgentsService(prisma, reload, ami);

    await service.update('tenant-1', 'agent-1', { sipPassword: '' });

    expect(prisma.agents.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sipPassword: null }),
      }),
    );
    expect(reload.scheduleReload).toHaveBeenCalledWith('tenant-1');
  });
});
