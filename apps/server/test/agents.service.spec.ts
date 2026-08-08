import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../src/common/prisma.service';
import { AgentsService } from '../src/modules/agents/agents.service';
import { AmiConnectionService } from '../src/modules/ami/ami-connection.service';
import { AsteriskReloadService } from '../src/modules/asterisk-config/asterisk-reload.service';
import { AgentStateService } from '../src/modules/calls/agent-state.service';

describe('AgentsService listForTenant', () => {
  let service: AgentsService;
  let ami: { sendAction: jest.Mock; sendActionWithResponse: jest.Mock };
  let agentStateService: { changeStatus: jest.Mock };

  const prisma = {
    agents: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    agentStatusHistory: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
    },
    refreshTokens: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AsteriskReloadService, useValue: { scheduleReload: jest.fn() } },
        {
          provide: AmiConnectionService,
          useValue: {
            sendActionCollect: jest.fn().mockResolvedValue([]),
            sendAction: jest.fn().mockResolvedValue(undefined),
            sendActionWithResponse: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: AgentStateService,
          useValue: {
            changeStatus: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(AgentsService);
    ami = module.get(AmiConnectionService);
    agentStateService = module.get(AgentStateService);
  });

  it('상담원 목록 조회는 현재 상태를 일괄 조회해 N+1 쿼리를 피한다', async () => {
    prisma.agents.findMany.mockResolvedValue([
      {
        agentId: 'agent-1',
        loginId: 'agent1001',
        agentCode: 'A1001',
        agentName: 'Agent 1',
        extension: '1001',
        sipPassword: 'sip-1',
        role: 'agent',
        employmentStatus: 'active',
        defaultQueueId: 'queue-1',
        settingsProfile: null,
        lastLoginAt: null,
        isActive: true,
      },
      {
        agentId: 'agent-2',
        loginId: 'agent1002',
        agentCode: 'A1002',
        agentName: 'Agent 2',
        extension: '1002',
        sipPassword: 'sip-2',
        role: 'agent',
        employmentStatus: 'active',
        defaultQueueId: 'queue-1',
        settingsProfile: null,
        lastLoginAt: null,
        isActive: true,
      },
    ]);

    prisma.agentStatusHistory.findMany.mockResolvedValue([
      {
        agentId: 'agent-1',
        statusCode: 'AVAILABLE',
        reasonCode: null,
        startedAt: new Date('2026-04-23T08:00:00.000Z'),
      },
      {
        agentId: 'agent-2',
        statusCode: 'TALKING',
        reasonCode: 'INBOUND',
        startedAt: new Date('2026-04-23T08:01:00.000Z'),
      },
    ]);

    const result = await service.listForTenant('tenant-1');

    expect(prisma.agents.findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1' },
      orderBy: { extension: 'asc' },
      select: {
        agentId: true,
        loginId: true,
        agentCode: true,
        agentName: true,
        extension: true,
        extensionDisplayName: true,
        extensionLockMode: true,
        sipPassword: true,
        role: true,
        employmentStatus: true,
        defaultQueueId: true,
        agentGroupId: true,
        agentGroup: { select: { agentGroupId: true, groupCode: true, groupName: true } },
        settingsProfile: true,
        lastLoginAt: true,
        isActive: true,
      },
    });
    expect(prisma.agentStatusHistory.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        agentId: { in: ['agent-1', 'agent-2'] },
        endedAt: null,
      },
      orderBy: [
        { agentId: 'asc' },
        { startedAt: 'desc' },
      ],
      select: {
        agentId: true,
        statusCode: true,
        reasonCode: true,
        startedAt: true,
      },
    });
    expect(prisma.agentStatusHistory.findFirst).not.toHaveBeenCalled();
    expect(result).toEqual({
      success: true,
      data: [
        expect.objectContaining({
          agentId: 'agent-1',
          currentStatus: {
            statusCode: 'AVAILABLE',
            reasonCode: null,
            startedAt: new Date('2026-04-23T08:00:00.000Z'),
          },
        }),
        expect.objectContaining({
          agentId: 'agent-2',
          currentStatus: {
            statusCode: 'TALKING',
            reasonCode: 'INBOUND',
            startedAt: new Date('2026-04-23T08:01:00.000Z'),
          },
        }),
      ],
      error: null,
    });
  });

  it('DND 설정은 상담원 내선을 모든 큐에서 pause 처리하고 현재 상태를 BREAK 로 기록한다', async () => {
    prisma.agents.findFirst.mockResolvedValue({
      agentId: 'agent-1',
      tenantId: 'tenant-1',
      extension: '1001',
      isActive: true,
    });
    agentStateService.changeStatus.mockResolvedValue({
      agentId: 'agent-1',
      statusCode: 'BREAK',
      reasonCode: 'DND',
    });

    const result = await service.setDndMode('tenant-1', 'agent-1', true);

    expect(ami.sendAction).toHaveBeenCalledWith({
      Action: 'QueuePause',
      Interface: 'PJSIP/1001',
      Paused: 'true',
      Reason: 'DND',
    });
    expect(agentStateService.changeStatus).toHaveBeenCalledWith('agent-1', 'BREAK', 'DND');
    expect(result).toEqual({
      success: true,
      data: {
        agentId: 'agent-1',
        extension: '1001',
        dndEnabled: true,
        status: expect.objectContaining({ statusCode: 'BREAK' }),
      },
      error: null,
    });
  });
});
