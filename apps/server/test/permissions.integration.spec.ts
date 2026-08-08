import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MenuPermissionService } from '../src/common/menu-permission.service';
import { AsteriskConfigController } from '../src/modules/asterisk-config/asterisk-config.controller';
import { AsteriskConfigService } from '../src/modules/asterisk-config/asterisk-config.service';
import { AsteriskReloadService } from '../src/modules/asterisk-config/asterisk-reload.service';
import { PromptTtsService } from '../src/modules/asterisk-config/prompt-tts.service';
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
      assertAnyMenuAction: jest.fn(),
      assertMenuAccess: jest.fn(),
      assertMenuAction: jest.fn(),
    };

    beforeEach(async () => {
      jest.clearAllMocks();
      menuPermissionService.assertAnyMenuAccess.mockResolvedValue(undefined);
      menuPermissionService.assertAnyMenuAction.mockResolvedValue(undefined);
      menuPermissionService.assertMenuAccess.mockResolvedValue(undefined);
      menuPermissionService.assertMenuAction.mockResolvedValue(undefined);
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

      expect(menuPermissionService.assertAnyMenuAction).toHaveBeenCalledWith(
        'tenant-1',
        'supervisor',
        ['dashboard', 'live-calls'],
        'view',
        undefined,
      );
      expect(callsService.getActiveCalls).toHaveBeenCalledWith('tenant-1', 'branch-1', undefined);
    });

    it('agent active calls는 추가 메뉴 권한 검사 없이 조회된다', async () => {
      callsService.getActiveCalls.mockResolvedValue({ success: true, data: [] });

      await controller.getActiveCalls(
        { user: { tenantId: 'tenant-1', role: 'agent' } },
        undefined,
      );

      expect(menuPermissionService.assertAnyMenuAccess).not.toHaveBeenCalled();
      expect(callsService.getActiveCalls).toHaveBeenCalledWith('tenant-1', undefined, undefined);
    });

    it('history는 reports/calls 권한이 없으면 차단된다', async () => {
      menuPermissionService.assertMenuAction.mockRejectedValue(
        new ForbiddenException('menu action denied: reports/calls:view'),
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

      expect(menuPermissionService.assertMenuAction).toHaveBeenCalledWith(
        'tenant-1',
        'admin',
        'reports/recordings',
        'view',
        undefined,
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
      assertAnyMenuAction: jest.fn(),
      assertMenuAccess: jest.fn(),
      assertMenuAction: jest.fn(),
    };

    beforeEach(async () => {
      jest.clearAllMocks();
      menuPermissionService.assertAnyMenuAccess.mockResolvedValue(undefined);
      menuPermissionService.assertAnyMenuAction.mockResolvedValue(undefined);
      menuPermissionService.assertMenuAccess.mockResolvedValue(undefined);
      menuPermissionService.assertMenuAction.mockResolvedValue(undefined);
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

      expect(menuPermissionService.assertAnyMenuAction).toHaveBeenCalledWith(
        'tenant-1',
        'supervisor',
        ['settings/agents', 'agents'],
        'view',
        undefined,
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

      expect(menuPermissionService.assertAnyMenuAction).toHaveBeenCalledWith(
        'tenant-1',
        'supervisor',
        ['settings/agents', 'agents'],
        'view',
        'supervisor-1',
      );
    });

    it('agent update는 settings/agents 권한을 강제한다', async () => {
      agentsService.update.mockResolvedValue({ success: true, data: { updated: true } });

      await controller.update(
        { tenantId: 'tenant-1', role: 'admin' },
        'agent-7',
        { agentName: '수정됨' } as any,
      );

      expect(menuPermissionService.assertMenuAction).toHaveBeenCalledWith(
        'tenant-1',
        'admin',
        'settings/agents',
        'update',
        undefined,
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
      assertAnyMenuAction: jest.fn(),
      assertMenuAccess: jest.fn(),
      assertMenuAction: jest.fn(),
    };

    beforeEach(async () => {
      jest.clearAllMocks();
      menuPermissionService.assertAnyMenuAccess.mockResolvedValue(undefined);
      menuPermissionService.assertAnyMenuAction.mockResolvedValue(undefined);
      menuPermissionService.assertMenuAccess.mockResolvedValue(undefined);
      menuPermissionService.assertMenuAction.mockResolvedValue(undefined);
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

      expect(menuPermissionService.assertAnyMenuAction).toHaveBeenCalledWith(
        'tenant-1',
        'supervisor',
        ['dashboard', 'queues'],
        'view',
        undefined,
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

      expect(menuPermissionService.assertMenuAction).toHaveBeenCalledWith(
        'tenant-1',
        'admin',
        'settings/queues',
        'view',
        undefined,
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

      expect(menuPermissionService.assertMenuAction).toHaveBeenCalledWith(
        'tenant-1',
        'admin',
        'settings/queues',
        'update',
        undefined,
      );
      expect(queuesService.update).toHaveBeenCalledWith(
        'tenant-1',
        'queue-1',
        { queueDisplayName: '변경' },
      );
    });
  });

  describe('AsteriskConfigController', () => {
    let controller: AsteriskConfigController;
    const asteriskConfigService = {
      getBlocklistEntries: jest.fn(),
      createBlocklistEntry: jest.fn(),
    };
    const reloadService = {
      executeReload: jest.fn(),
    };
    const promptTtsService = {
      createPromptFromText: jest.fn(),
    };
    const menuPermissionService = {
      assertAnyMenuAccess: jest.fn(),
      assertMenuAccess: jest.fn(),
      assertMenuAction: jest.fn(),
    };

    beforeEach(async () => {
      jest.clearAllMocks();
      menuPermissionService.assertMenuAccess.mockResolvedValue(undefined);
      menuPermissionService.assertMenuAction.mockResolvedValue(undefined);
      const module: TestingModule = await Test.createTestingModule({
        controllers: [AsteriskConfigController],
        providers: [
          { provide: AsteriskConfigService, useValue: asteriskConfigService },
          { provide: AsteriskReloadService, useValue: reloadService },
          { provide: PromptTtsService, useValue: promptTtsService },
          { provide: MenuPermissionService, useValue: menuPermissionService },
        ],
      }).compile();

      controller = module.get(AsteriskConfigController);
    });

    it('blocklist 목록은 blocklist 권한을 강제한다', async () => {
      asteriskConfigService.getBlocklistEntries.mockResolvedValue([]);

      await controller.getBlocklistEntries({ tenantId: 'tenant-1', role: 'admin' });

      expect(menuPermissionService.assertMenuAction).toHaveBeenCalledWith(
        'tenant-1',
        'admin',
        'blocklist',
        'view',
        undefined,
      );
      expect(asteriskConfigService.getBlocklistEntries).toHaveBeenCalledWith('tenant-1');
    });

    it('blocklist 생성은 blocklist 권한을 강제한다', async () => {
      asteriskConfigService.createBlocklistEntry.mockResolvedValue({ id: 'b1' });

      await controller.createBlocklistEntry(
        { tenantId: 'tenant-1', role: 'supervisor' },
        { phoneNumber: '08012345678', isActive: true } as any,
      );

      expect(menuPermissionService.assertMenuAction).toHaveBeenCalledWith(
        'tenant-1',
        'supervisor',
        'blocklist',
        'create',
        undefined,
      );
      expect(asteriskConfigService.createBlocklistEntry).toHaveBeenCalledWith(
        'tenant-1',
        { phoneNumber: '08012345678', isActive: true },
      );
    });
  });
});
