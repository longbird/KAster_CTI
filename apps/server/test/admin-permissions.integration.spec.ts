import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../src/common/prisma.service';
import { MenuPermissionService } from '../src/common/menu-permission.service';
import { AsteriskReloadService } from '../src/modules/asterisk-config/asterisk-reload.service';
import { AdminService } from '../src/modules/admin/admin.service';
import { QueuesService } from '../src/modules/queues/queues.service';

describe('Admin/Permission service integration', () => {
  describe('MenuPermissionService', () => {
    let service: MenuPermissionService;
    const prisma = {
      rolePermissions: {
        findUnique: jest.fn(),
      },
    };

    beforeEach(async () => {
      jest.clearAllMocks();
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          MenuPermissionService,
          { provide: PrismaService, useValue: prisma },
        ],
      }).compile();

      service = module.get(MenuPermissionService);
    });

    it('저장된 rolePermissions 값이 기본 권한보다 우선한다', async () => {
      prisma.rolePermissions.findUnique.mockResolvedValue({
        canAccess: false,
        canView: false,
        canCreate: false,
        canUpdate: false,
        canDelete: false,
        canOperate: false,
        canExport: false,
      });

      const allowed = await service.canAccess('tenant-1', 'supervisor', 'dashboard');

      expect(prisma.rolePermissions.findUnique).toHaveBeenCalledWith({
        where: {
          tenantId_roleCode_menuKey: {
            tenantId: 'tenant-1',
            roleCode: 'supervisor',
            menuKey: 'dashboard',
          },
        },
        select: {
          canAccess: true,
          canView: true,
          canCreate: true,
          canUpdate: true,
          canDelete: true,
          canOperate: true,
          canExport: true,
        },
      });
      expect(allowed).toBe(false);
    });

    it('저장값이 없으면 기본 권한으로 fallback 한다', async () => {
      prisma.rolePermissions.findUnique.mockResolvedValue(null);

      await expect(service.assertMenuAccess('tenant-1', 'supervisor', 'reports/logs')).resolves.toBeUndefined();
      await expect(service.assertMenuAccess('tenant-1', 'agent', 'reports/logs')).rejects.toThrow(ForbiddenException);
    });

    it('assertAnyMenuAccess 는 허용된 메뉴가 하나라도 있으면 통과한다', async () => {
      prisma.rolePermissions.findUnique.mockResolvedValue(null);

      await expect(
        service.assertAnyMenuAccess('tenant-1', 'supervisor', ['unknown-menu', 'agents']),
      ).resolves.toBeUndefined();
    });

    it('assertMenuAction 은 저장된 액션 권한을 검사한다', async () => {
      prisma.rolePermissions.findUnique.mockResolvedValue({
        canAccess: true,
        canView: true,
        canCreate: false,
        canUpdate: false,
        canDelete: false,
        canOperate: false,
        canExport: false,
      });

      await expect(
        service.assertMenuAction('tenant-1', 'supervisor', 'announcements', 'create'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('AdminService', () => {
    let service: AdminService;
    const prisma = {
      branchAgents: {
        findMany: jest.fn(),
      },
      branchQueues: {
        findMany: jest.fn(),
      },
      callSessions: {
        count: jest.fn(),
        findMany: jest.fn(),
      },
      agentStatusHistory: {
        findMany: jest.fn(),
      },
      queueAgentMembers: {
        findMany: jest.fn(),
      },
      rawAmiEvents: {
        count: jest.fn(),
        findMany: jest.fn(),
      },
    };
    const queuesService = {
      getSummary: jest.fn(),
    };
    const reloadService = {
      executeReload: jest.fn(),
    };

    beforeEach(async () => {
      jest.clearAllMocks();
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AdminService,
          { provide: PrismaService, useValue: prisma },
          { provide: QueuesService, useValue: queuesService },
          { provide: AsteriskReloadService, useValue: reloadService },
        ],
      }).compile();

      service = module.get(AdminService);
    });

    it('AMI 로그 조회는 지사 linkedid 범위와 검색 linkedid 를 함께 AND 로 묶는다', async () => {
      prisma.branchAgents.findMany.mockResolvedValue([{ agentId: 'agent-1' }]);
      prisma.branchQueues.findMany.mockResolvedValue([{ queueId: 'queue-1' }]);
      prisma.callSessions.findMany.mockResolvedValue([{ linkedid: 'L-100' }, { linkedid: 'L-101' }]);
      prisma.rawAmiEvents.count.mockResolvedValue(2);
      prisma.rawAmiEvents.findMany.mockResolvedValue([
        {
          eventId: 'evt-1',
          eventName: 'QueueCallerJoin',
          eventTime: new Date('2026-04-16T09:00:00.000Z'),
          linkedid: 'L-100',
          uniqueid: 'U-1',
          payload: {},
        },
      ]);

      const result = await service.listAmiLogs('tenant-1', {
        page: 2,
        pageSize: 10,
        from: '2026-04-01T00:00:00.000Z',
        to: '2026-04-16T23:59:59.999Z',
        eventName: 'Queue',
        linkedid: 'L-10',
        branchId: 'branch-1',
      } as any);

      expect(prisma.callSessions.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          tenantId: 'tenant-1',
          startedAt: {
            gte: new Date('2026-04-01T00:00:00.000Z'),
            lte: new Date('2026-04-16T23:59:59.999Z'),
          },
          OR: [
            { primaryAgentId: { in: ['agent-1'] } },
            { queueId: { in: ['queue-1'] } },
          ],
        }),
        select: { linkedid: true },
      });

      expect(prisma.rawAmiEvents.count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          tenantId: 'tenant-1',
          eventTime: {
            gte: new Date('2026-04-01T00:00:00.000Z'),
            lte: new Date('2026-04-16T23:59:59.999Z'),
          },
          eventName: { contains: 'Queue', mode: 'insensitive' },
          AND: [
            { linkedid: { in: ['L-100', 'L-101'] } },
            { linkedid: { contains: 'L-10', mode: 'insensitive' } },
          ],
        }),
      });

      expect(prisma.rawAmiEvents.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          tenantId: 'tenant-1',
          AND: [
            { linkedid: { in: ['L-100', 'L-101'] } },
            { linkedid: { contains: 'L-10', mode: 'insensitive' } },
          ],
        }),
        orderBy: { eventTime: 'desc' },
        skip: 10,
        take: 10,
        select: {
          eventId: true,
          eventName: true,
          eventTime: true,
          linkedid: true,
          uniqueid: true,
          payload: true,
        },
      });

      expect(result).toMatchObject({
        success: true,
        data: {
          page: 2,
          pageSize: 10,
          total: 2,
        },
        error: null,
      });
    });

    it('지사 필터가 없으면 AMI 로그 조회에 branch scope 조회를 추가하지 않는다', async () => {
      prisma.callSessions.count.mockResolvedValue(0);
      prisma.callSessions.findMany.mockResolvedValue([]);
      prisma.rawAmiEvents.count.mockResolvedValue(0);
      prisma.rawAmiEvents.findMany.mockResolvedValue([]);

      await service.listAmiLogs('tenant-1', {
        page: 1,
        pageSize: 20,
      } as any);

      expect(prisma.branchAgents.findMany).not.toHaveBeenCalled();
      expect(prisma.branchQueues.findMany).not.toHaveBeenCalled();
      expect(prisma.rawAmiEvents.count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          tenantId: 'tenant-1',
        }),
      });
    });

    it('호 로그 조회는 통화별 전화번호와 시작-종료 타임라인을 함께 반환한다', async () => {
      prisma.callSessions.count.mockResolvedValue(1);
      prisma.callSessions.findMany.mockResolvedValue([
        {
          callId: 'call-1',
          linkedid: 'L-200',
          ani: '01012345678',
          dnis: '07052346380',
          didNumber: '07052346380',
          queueName: 'default-distribution',
          sessionStatus: 'ENDED',
          direction: 'INBOUND',
          resultCode: 'NORMAL_CLEARING',
          startedAt: new Date('2026-04-25T01:00:00.000Z'),
          queuedAt: new Date('2026-04-25T01:00:05.000Z'),
          ringingAt: new Date('2026-04-25T01:00:10.000Z'),
          answeredAt: new Date('2026-04-25T01:00:15.000Z'),
          endedAt: new Date('2026-04-25T01:02:00.000Z'),
          waitSeconds: 10,
          talkSeconds: 105,
          abandonFlag: false,
          recordingFlag: true,
          primaryAgent: { agentName: '상담원A', extension: '1001' },
          customer: { customerName: '홍길동' },
          queueEvents: [
            { eventType: 'ENTERQUEUE', eventTime: new Date('2026-04-25T01:00:05.000Z'), queueName: 'default-distribution', agentId: null },
            { eventType: 'CONNECT', eventTime: new Date('2026-04-25T01:00:15.000Z'), queueName: 'default-distribution', agentId: 'agent-1' },
          ],
          callLegs: [
            { legType: 'caller', channel: 'PJSIP/trunk-0001', startedAt: new Date('2026-04-25T01:00:00.000Z'), answeredAt: null, endedAt: new Date('2026-04-25T01:02:00.000Z') },
            { legType: 'agent', channel: 'PJSIP/1001-0002', startedAt: new Date('2026-04-25T01:00:10.000Z'), answeredAt: new Date('2026-04-25T01:00:15.000Z'), endedAt: new Date('2026-04-25T01:02:00.000Z') },
          ],
          callTransfers: [
            { transferType: 'blind', transferResult: 'COMPLETED', targetExtension: '1002', requestedAt: new Date('2026-04-25T01:01:00.000Z'), completedAt: new Date('2026-04-25T01:01:05.000Z') },
          ],
          callRecordings: [
            { recordingId: 'rec-1', fileName: 'call-1.wav', recordingStartedAt: new Date('2026-04-25T01:00:15.000Z') },
          ],
          callMemos: [
            { memoText: '상담 완료', resultCode: 'DONE', createdAt: new Date('2026-04-25T01:02:10.000Z') },
          ],
        },
      ]);
      prisma.rawAmiEvents.count.mockResolvedValue(2);
      prisma.rawAmiEvents.findMany
        .mockResolvedValueOnce([
          {
            eventId: 'evt-join',
            eventName: 'QueueCallerJoin',
            eventTime: new Date('2026-04-25T01:00:05.000Z'),
            linkedid: 'L-200',
            uniqueid: 'U-1',
            payload: { CallerIDNum: '01012345678' },
          },
        ])
        .mockResolvedValueOnce([
          {
            eventId: 'evt-smart-prompt',
            eventName: 'UserEvent',
            eventTime: new Date('2026-04-25T01:00:01.000Z'),
            linkedid: 'L-200',
            uniqueid: 'U-1',
            payload: { raw: { UserEvent: 'KasterSmartArs', Stage: 'prompt', Prompt: '/var/lib/asterisk/sounds/custom/smart_ars_guide', Result: 'started' } },
          },
          {
            eventId: 'evt-smart-selection',
            eventName: 'UserEvent',
            eventTime: new Date('2026-04-25T01:00:03.000Z'),
            linkedid: 'L-200',
            uniqueid: 'U-1',
            payload: { raw: { UserEvent: 'KasterSmartArs', Stage: 'selection', Digit: '1', Action: 'OPT_OUT', Result: 'selected' } },
          },
          {
            eventId: 'evt-smart-result',
            eventName: 'UserEvent',
            eventTime: new Date('2026-04-25T01:00:04.000Z'),
            linkedid: 'L-200',
            uniqueid: 'U-1',
            payload: { raw: { UserEvent: 'KasterSmartArs', Stage: 'result', Digit: '1', Action: 'OPT_OUT', Result: 'SUCCESS' } },
          },
        ]);

      const result = await service.listAmiLogs('tenant-1', {
        page: 1,
        pageSize: 20,
        from: '2026-04-25T00:00:00.000Z',
        to: '2026-04-25T23:59:59.999Z',
        phone: '0101234',
      } as any);

      expect(prisma.callSessions.count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { ani: { contains: '0101234', mode: 'insensitive' } },
            { dnis: { contains: '0101234', mode: 'insensitive' } },
            { didNumber: { contains: '0101234', mode: 'insensitive' } },
          ]),
        }),
      });
      const data = result.data as any;
      expect(data.calls[0]).toMatchObject({
        callId: 'call-1',
        callerNumber: '01012345678',
        inboundNumber: '07052346380',
        customerName: '홍길동',
        agentName: '상담원A',
        flowSummary: '010-1234-5678 -> 070-5234-6380 -> default-distribution -> 상담원A -> 종료',
      });
      expect(data.calls[0].timeline.map((item: any) => item.type)).toEqual(
        expect.arrayContaining(['CALL_STARTED', 'SMART_ARS_PROMPT', 'SMART_ARS_SELECTION', 'SMART_ARS_RESULT', 'QUEUE_ENTERED', 'AGENT_RINGING', 'CALL_ANSWERED', 'TRANSFER_COMPLETED', 'RECORDING_STARTED', 'CALL_ENDED', 'MEMO_SAVED']),
      );
      expect(data.calls[0].timeline).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: 'CALL_STARTED', label: '호 시작', detail: '010-1234-5678 -> 070-5234-6380' }),
        expect.objectContaining({ type: 'SMART_ARS_SELECTION', label: '스마트 ARS 사용자 선택', detail: '입력 1 · 수신거부 등록 · 선택됨' }),
        expect.objectContaining({ type: 'SMART_ARS_RESULT', label: '스마트 ARS 액션 결과', detail: '수신거부 등록 · 성공' }),
        expect.objectContaining({ type: 'QUEUE_ENTERQUEUE', label: '대기열 진입', detail: 'default-distribution' }),
        expect.objectContaining({ type: 'QUEUE_CONNECT', label: '상담 연결', detail: 'default-distribution · agent-1' }),
        expect.objectContaining({ type: 'LEG_caller_STARTED', label: '고객 채널 시작', detail: 'PJSIP/trunk-0001' }),
        expect.objectContaining({ type: 'LEG_agent_ANSWERED', label: '상담원 채널 응답', detail: 'PJSIP/1001-0002' }),
        expect.objectContaining({ type: 'TRANSFER_COMPLETED', label: '전환 완료', detail: '1002' }),
        expect.objectContaining({ type: 'CALL_ENDED', label: '호 종료', detail: '정상 종료' }),
        expect.objectContaining({ type: 'MEMO_SAVED', label: '상담 메모', detail: '처리 완료' }),
      ]));
      expect(data.callTotal).toBe(1);
    });

    it('대시보드는 branchId 기준 queue/agent scope 를 집계 쿼리에 일관되게 전달한다', async () => {
      prisma.branchAgents.findMany.mockResolvedValue([{ agentId: 'agent-1' }]);
      prisma.branchQueues.findMany.mockResolvedValue([{ queueId: 'queue-1' }]);
      queuesService.getSummary.mockResolvedValue({
        success: true,
        data: {
          queues: [
            {
              queueId: 'queue-1',
              queueName: '대표',
              queueDisplayName: '대표',
              waiting: 2,
              ringing: 0,
              available: 0,
              longestWaitSeconds: 65,
              recentAnswered: 3,
              recentAbandoned: 1,
            },
          ],
        },
      });
      prisma.callSessions.count
        .mockResolvedValueOnce(4)
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(8)
        .mockResolvedValueOnce(2);
      prisma.agentStatusHistory.findMany.mockResolvedValue([
        { agentId: 'agent-1', statusCode: 'AVAILABLE' },
        { agentId: 'agent-2', statusCode: 'BREAK' },
      ]);
      prisma.callSessions.findMany.mockResolvedValue([
        {
          startedAt: new Date('2026-04-16T09:00:00.000Z'),
          answeredAt: new Date('2026-04-16T09:01:00.000Z'),
          abandonFlag: false,
        },
        {
          startedAt: new Date('2026-04-16T10:00:00.000Z'),
          answeredAt: null,
          abandonFlag: true,
        },
      ]);
      prisma.queueAgentMembers.findMany
        .mockResolvedValueOnce([
          {
            queueId: 'queue-1',
            queue: { queueDisplayName: '대표', queueName: '대표' },
          },
        ])
        .mockResolvedValueOnce([
          {
            queueId: 'queue-1',
            agentId: 'agent-1',
            queue: { queueDisplayName: '대표', queueName: '대표' },
          },
          {
            queueId: 'queue-1',
            agentId: 'agent-2',
            queue: { queueDisplayName: '대표', queueName: '대표' },
          },
        ]);

      const result = await service.getDashboard('tenant-1', 'branch-1');

      expect(queuesService.getSummary).toHaveBeenCalledWith('tenant-1', ['queue-1']);
      expect(prisma.callSessions.count).toHaveBeenNthCalledWith(1, {
        where: {
          tenantId: 'tenant-1',
          sessionStatus: { notIn: ['ENDED'] },
          OR: [
            { primaryAgentId: { in: ['agent-1'] } },
            { queueId: { in: ['queue-1'] } },
          ],
        },
      });
      expect(prisma.agentStatusHistory.findMany).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-1',
          endedAt: null,
          agentId: { in: ['agent-1'] },
        },
        select: { agentId: true, statusCode: true },
      });
      expect(prisma.queueAgentMembers.findMany).toHaveBeenNthCalledWith(1, {
        where: {
          tenantId: 'tenant-1',
          queueId: { in: ['queue-1'] },
        },
        select: {
          queueId: true,
          queue: { select: { queueDisplayName: true, queueName: true } },
        },
      });
      expect(prisma.queueAgentMembers.findMany).toHaveBeenNthCalledWith(2, {
        where: {
          tenantId: 'tenant-1',
          queueId: { in: ['queue-1'] },
        },
        select: {
          queueId: true,
          agentId: true,
          queue: { select: { queueDisplayName: true, queueName: true } },
        },
      });
      expect(result).toMatchObject({
        success: true,
        data: {
          activeCalls: 4,
          today: {
            total: 10,
            answered: 8,
            abandoned: 2,
          },
          agentStatusDistribution: {
            AVAILABLE: 1,
            BREAK: 1,
          },
          teams: [
            {
              teamName: '대표',
              available: 1,
              break: 1,
            },
          ],
        },
        error: null,
      });
      expect(result.data.alerts.length).toBeGreaterThan(0);
    });

    it('branchId 가 없으면 대시보드는 전체 범위로 집계한다', async () => {
      queuesService.getSummary.mockResolvedValue({ success: true, data: { queues: [] } });
      prisma.callSessions.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);
      prisma.agentStatusHistory.findMany.mockResolvedValue([]);
      prisma.callSessions.findMany.mockResolvedValue([]);
      prisma.queueAgentMembers.findMany.mockResolvedValue([]);

      await service.getDashboard('tenant-1');

      expect(prisma.branchAgents.findMany).not.toHaveBeenCalled();
      expect(prisma.branchQueues.findMany).not.toHaveBeenCalled();
      expect(queuesService.getSummary).toHaveBeenCalledWith('tenant-1', undefined);
      expect(prisma.agentStatusHistory.findMany).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-1',
          endedAt: null,
        },
        select: { agentId: true, statusCode: true },
      });
    });
  });
});
