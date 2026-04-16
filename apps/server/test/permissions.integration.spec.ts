import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MenuPermissionService } from '../src/common/menu-permission.service';
import { AgentsController } from '../src/modules/agents/agents.controller';
import { AgentsService } from '../src/modules/agents/agents.service';
import { CallsController } from '../src/modules/calls/calls.controller';
import { AgentStateService } from '../src/modules/calls/agent-state.service';
import { CallsService } from '../src/modules/calls/calls.service';
import { QueuesController } from '../src/modules/queues/queues.controller';
import { QueuesService } from '../src/modules/queues/queues.service';

describe('Server permission integration', () => {
  describe('CallsController', () => {
    let controller: CallsController;
    const callsService = {
      getActiveCalls: jest.fn(),
      listHistory: jest.fn(),
      listRecordings: jest.fn(),
    };
    const menuPermissionService = {
      assertAnyMenuAccess: jest.fn(),
      assertMenuAccess: jest.fn(),
    };

    beforeEach(async () => {
      jest.clearAllMocks();
      menuPermissionService.assertAnyMenuAccess.mockResolvedValue(undefined);
      menuPermissionService.assertMenuAccess.mockResolvedValue(undefined);
      const module: TestingModule = await Test.createTestingModule({
        controllers: [CallsController],
        providers: [
          { provide: CallsService, useValue: callsService },
          { provide: MenuPermissionService, useValue: menuPermissionService },
        ],
      }).compile();

      controller = module.get(CallsController);
    });

    it('supervisor active calls는 dashboard/live-calls 권한을 검사한다', async () => {
      callsService.getActiveCalls.mockResolvedValue({ success: true, data: [] });

      await controller.getActiveCalls(
        { user: { tenantId: 'tenant-1', role: 'supervisor' } },
        'branch-1',
      );

      expect(menuPermissionService.assertAnyMenuAccess).toHaveBeenCalledWith(
        'tenant-1',
        'supervisor',
        ['dashboard', 'live-calls'],
      );
      expect(callsService.getActiveCalls).toHaveBeenCalledWith('tenant-1', 'branch-1');
    });

    it('agent active calls는 추가 메뉴 권한 검사 없이 조회된다', async () => {
      callsService.getActiveCalls.mockResolvedValue({ success: true, data: [] });

      await controller.getActiveCalls(
        { user: { tenantId: 'tenant-1', role: 'agent' } },
        undefined,
      );

      expect(menuPermissionService.assertAnyMenuAccess).not.toHaveBeenCalled();
      expect(callsService.getActiveCalls).toHaveBeenCalledWith('tenant-1', undefined);
    });

    it('history는 reports/calls 권한이 없으면 차단된다', async () => {
      menuPermissionService.assertMenuAccess.mockRejectedValue(
        new ForbiddenException('menu access denied: reports/calls'),
      );

      await expect(
        controller.listHistory(
          { user: { tenantId: 'tenant-1', role: 'supervisor' } },
          { from: '2026-04-16', to: '2026-04-16' } as any,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('recordings는 reports/recordings 권한을 검사하고 branchId를 전달한다', async () => {
      callsService.listRecordings.mockResolvedValue({ success: true, data: [] });

      await controller.listRecordings(
        { user: { tenantId: 'tenant-1', role: 'admin' } },
        '2026-04-01',
        '2026-04-16',
        'branch-9',
      );

      expect(menuPermissionService.assertMenuAccess).toHaveBeenCalledWith(
        'tenant-1',
        'admin',
        'reports/recordings',
      );
      expect(callsService.listRecordings).toHaveBeenCalledWith('tenant-1', {
        from: '2026-04-01',
        to: '2026-04-16',
        branchId: 'branch-9',
      });
    });
  });

  describe('AgentsController', () => {
    let controller: AgentsController;
    const agentStateService = {
      changeStatus: jest.fn(),
    };
    const agentsService = {
      listForTenant: jest.fn(),
      getDetail: jest.fn(),
      getHistory: jest.fn(),
      update: jest.fn(),
    };
    const menuPermissionService = {
      assertAnyMenuAccess: jest.fn(),
      assertMenuAccess: jest.fn(),
    };

    beforeEach(async () => {
      jest.clearAllMocks();
      menuPermissionService.assertAnyMenuAccess.mockResolvedValue(undefined);
      menuPermissionService.assertMenuAccess.mockResolvedValue(undefined);
      const module: TestingModule = await Test.createTestingModule({
        controllers: [AgentsController],
        providers: [
          { provide: AgentStateService, useValue: agentStateService },
          { provide: AgentsService, useValue: agentsService },
          { provide: MenuPermissionService, useValue: menuPermissionService },
        ],
      }).compile();

      controller = module.get(AgentsController);
    });

    it('supervisor agent 목록 조회는 settings/agents 또는 agents 권한을 검사한다', async () => {
      agentsService.listForTenant.mockResolvedValue({ success: true, data: [] });

      await controller.list({ tenantId: 'tenant-1', role: 'supervisor' });

      expect(menuPermissionService.assertAnyMenuAccess).toHaveBeenCalledWith(
        'tenant-1',
        'supervisor',
        ['settings/agents', 'agents'],
      );
      expect(agentsService.listForTenant).toHaveBeenCalledWith('tenant-1');
    });

    it('상담원 본인 상세 조회는 추가 메뉴 권한 검사 없이 허용된다', async () => {
      agentsService.getDetail.mockResolvedValue({ success: true, data: { agentId: 'agent-1' } });

      await controller.detail(
        { tenantId: 'tenant-1', role: 'agent', sub: 'agent-1' },
        'agent-1',
      );

      expect(menuPermissionService.assertAnyMenuAccess).not.toHaveBeenCalled();
      expect(agentsService.getDetail).toHaveBeenCalledWith('tenant-1', 'agent-1');
    });

    it('supervisor가 다른 상담원 상세를 보면 메뉴 권한을 검사한다', async () => {
      agentsService.getDetail.mockResolvedValue({ success: true, data: { agentId: 'agent-9' } });

      await controller.detail(
        { tenantId: 'tenant-1', role: 'supervisor', sub: 'supervisor-1' },
        'agent-9',
      );

      expect(menuPermissionService.assertAnyMenuAccess).toHaveBeenCalledWith(
        'tenant-1',
        'supervisor',
        ['settings/agents', 'agents'],
      );
    });

    it('agent update는 settings/agents 권한을 강제한다', async () => {
      agentsService.update.mockResolvedValue({ success: true, data: { updated: true } });

      await controller.update(
        { tenantId: 'tenant-1', role: 'admin' },
        'agent-7',
        { agentName: '수정됨' } as any,
      );

      expect(menuPermissionService.assertMenuAccess).toHaveBeenCalledWith(
        'tenant-1',
        'admin',
        'settings/agents',
      );
      expect(agentsService.update).toHaveBeenCalledWith(
        'tenant-1',
        'agent-7',
        { agentName: '수정됨' },
      );
    });
  });

  describe('QueuesController', () => {
    let controller: QueuesController;
    const queuesService = {
      getSummary: jest.fn(),
      listSettings: jest.fn(),
      update: jest.fn(),
    };
    const menuPermissionService = {
      assertAnyMenuAccess: jest.fn(),
      assertMenuAccess: jest.fn(),
    };

    beforeEach(async () => {
      jest.clearAllMocks();
      menuPermissionService.assertAnyMenuAccess.mockResolvedValue(undefined);
      menuPermissionService.assertMenuAccess.mockResolvedValue(undefined);
      const module: TestingModule = await Test.createTestingModule({
        controllers: [QueuesController],
        providers: [
          { provide: QueuesService, useValue: queuesService },
          { provide: MenuPermissionService, useValue: menuPermissionService },
        ],
      }).compile();

      controller = module.get(QueuesController);
    });

    it('supervisor queue summary는 dashboard 또는 queues 권한을 검사한다', async () => {
      queuesService.getSummary.mockResolvedValue({ success: true, data: { queues: [] } });

      await controller.summary({ tenantId: 'tenant-1', role: 'supervisor' });

      expect(menuPermissionService.assertAnyMenuAccess).toHaveBeenCalledWith(
        'tenant-1',
        'supervisor',
        ['dashboard', 'queues'],
      );
      expect(queuesService.getSummary).toHaveBeenCalledWith('tenant-1');
    });

    it('agent queue summary는 추가 메뉴 권한 검사 없이 허용된다', async () => {
      queuesService.getSummary.mockResolvedValue({ success: true, data: { queues: [] } });

      await controller.summary({ tenantId: 'tenant-1', role: 'agent' });

      expect(menuPermissionService.assertAnyMenuAccess).not.toHaveBeenCalled();
      expect(queuesService.getSummary).toHaveBeenCalledWith('tenant-1');
    });

    it('queue settings 목록은 settings/queues 권한을 강제한다', async () => {
      queuesService.listSettings.mockResolvedValue({ success: true, data: [] });

      await controller.list({ tenantId: 'tenant-1', role: 'admin' });

      expect(menuPermissionService.assertMenuAccess).toHaveBeenCalledWith(
        'tenant-1',
        'admin',
        'settings/queues',
      );
      expect(queuesService.listSettings).toHaveBeenCalledWith('tenant-1');
    });

    it('queue 수정은 settings/queues 권한을 강제한다', async () => {
      queuesService.update.mockResolvedValue({ success: true, data: { updated: true } });

      await controller.update(
        { tenantId: 'tenant-1', role: 'admin' },
        'queue-1',
        { queueDisplayName: '변경' } as any,
      );

      expect(menuPermissionService.assertMenuAccess).toHaveBeenCalledWith(
        'tenant-1',
        'admin',
        'settings/queues',
      );
      expect(queuesService.update).toHaveBeenCalledWith(
        'tenant-1',
        'queue-1',
        { queueDisplayName: '변경' },
      );
    });
  });
});
