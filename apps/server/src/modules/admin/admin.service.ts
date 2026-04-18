import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PermissionFlags } from '../../common/menu-permission.service';
import { parseAllowedCallerIds, serializeAllowedCallerIds } from '../../common/outbound-caller-id.util';
import { PrismaService } from '../../common/prisma.service';
import { AsteriskReloadService } from '../asterisk-config/asterisk-reload.service';
import { QueuesService } from '../queues/queues.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { ListAmiLogsQueryDto } from './dto/list-ami-logs-query.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { UpdateBranchMappingsDto } from './dto/update-branch-mappings.dto';
import { UpdateRolePermissionsDto } from './dto/update-role-permissions.dto';
import { UpdateSystemSettingsDto } from './dto/update-system-settings.dto';

const MENU_KEYS = [
  'dashboard',
  'live-calls',
  'kpi',
  'reports/calls',
  'reports/missed',
  'reports/recordings',
  'reports/logs',
  'announcements',
  'settings/agents',
  'settings/queues',
  'settings/forwarding',
  'settings/prompts',
  'settings/branches',
  'settings/permissions',
  'blocklist',
  'system',
  'queues',
  'agents',
  'monitoring',
  'asterisk',
] as const;

const ROLE_CODES = ['agent', 'supervisor', 'admin'] as const;

const DEFAULT_ROLE_ACCESS: Record<string, Set<string>> = {
  agent: new Set(['dashboard']),
  supervisor: new Set(MENU_KEYS),
  admin: new Set(MENU_KEYS),
};

function defaultPermissionFlags(roleCode: string, menuKey: string): PermissionFlags {
  const canView = DEFAULT_ROLE_ACCESS[roleCode]?.has(menuKey) ?? false;
  if (!canView) {
    return {
      canView: false,
      canCreate: false,
      canUpdate: false,
      canDelete: false,
      canOperate: false,
      canExport: false,
    };
  }

  if (roleCode === 'agent') {
    return {
      canView,
      canCreate: false,
      canUpdate: false,
      canDelete: false,
      canOperate: false,
      canExport: false,
    };
  }

  const mutableMenus = new Set([
    'announcements',
    'settings/agents',
    'settings/queues',
    'settings/forwarding',
    'settings/prompts',
    'settings/branches',
    'settings/permissions',
    'blocklist',
    'system',
    'asterisk',
  ]);
  const operableMenus = new Set([
    'dashboard',
    'live-calls',
    'queues',
    'agents',
    'monitoring',
    'asterisk',
    'settings/branches',
    'settings/queues',
    'settings/agents',
    'settings/permissions',
    'blocklist',
  ]);

  return {
    canView,
    canCreate: mutableMenus.has(menuKey),
    canUpdate: mutableMenus.has(menuKey),
    canDelete: mutableMenus.has(menuKey),
    canOperate: mutableMenus.has(menuKey) || operableMenus.has(menuKey),
    canExport: menuKey.startsWith('reports/'),
  };
}

// 슈퍼바이저/admin 전용 실시간 대시보드.
// 큐 요약 + 활성 콜 수 + 오늘 집계 + 에이전트 상태 분포 + 시간대별 트래픽 + 팀 현황 + 알람
@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queuesService: QueuesService,
    private readonly asteriskReloadService: AsteriskReloadService,
  ) {}

  private async getBranchScope(tenantId: string, branchId?: string) {
    if (!branchId) return null;

    const [agentMappings, queueMappings] = await Promise.all([
      this.prisma.branchAgents.findMany({
        where: { tenantId, branchId },
        select: { agentId: true },
      }),
      this.prisma.branchQueues.findMany({
        where: { tenantId, branchId },
        select: { queueId: true },
      }),
    ]);

    return {
      agentIds: agentMappings.map((item) => item.agentId),
      queueIds: queueMappings.map((item) => item.queueId),
    };
  }

  private buildBranchCallFilter(scope: { agentIds: string[]; queueIds: string[] } | null): Prisma.callSessionsWhereInput | undefined {
    if (!scope) return undefined;
    return {
      OR: [
        { primaryAgentId: { in: scope.agentIds } },
        { queueId: { in: scope.queueIds } },
      ],
    };
  }

  async getDashboard(tenantId: string, branchId?: string) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const branchScope = await this.getBranchScope(tenantId, branchId);
    const branchFilter = this.buildBranchCallFilter(branchScope);

    const [queuesSummary, activeCalls, todayCounts, openStatuses, hourlyRaw, queueAgents] =
      await Promise.all([
        this.queuesService.getSummary(tenantId, branchScope?.queueIds),

        this.prisma.callSessions.count({
          where: { tenantId, sessionStatus: { notIn: ['ENDED'] }, ...(branchFilter ?? {}) },
        }),

        Promise.all([
          this.prisma.callSessions.count({
            where: { tenantId, startedAt: { gte: startOfDay }, ...(branchFilter ?? {}) },
          }),
          this.prisma.callSessions.count({
            where: { tenantId, startedAt: { gte: startOfDay }, answeredAt: { not: null }, ...(branchFilter ?? {}) },
          }),
          this.prisma.callSessions.count({
            where: { tenantId, startedAt: { gte: startOfDay }, abandonFlag: true, ...(branchFilter ?? {}) },
          }),
        ]),

        // 현재 오픈된 상담원 상태 (에이전트 상태 분포)
        this.prisma.agentStatusHistory.findMany({
          where: {
            tenantId,
            endedAt: null,
            ...(branchScope ? { agentId: { in: branchScope.agentIds } } : {}),
          },
          select: { agentId: true, statusCode: true },
        }),

        this.prisma.callSessions.findMany({
          where: {
            tenantId,
            startedAt: { gte: startOfDay },
            ...(branchFilter ?? {}),
          },
          select: {
            startedAt: true,
            answeredAt: true,
            abandonFlag: true,
          },
        }),

        // 큐별 에이전트 현황 (팀 통계 도출용)
        this.prisma.queueAgentMembers.findMany({
          where: {
            tenantId,
            ...(branchScope ? { queueId: { in: branchScope.queueIds } } : {}),
          },
          select: {
            queueId: true,
            queue: { select: { queueDisplayName: true, queueName: true } },
          },
        }),
      ]);

    const [todayTotal, todayAnswered, todayAbandoned] = todayCounts;

    // ── 에이전트 상태 분포 ──────────────────────────────────────────────────
    const statusDistribution = openStatuses.reduce<Record<string, number>>(
      (acc, row) => {
        acc[row.statusCode] = (acc[row.statusCode] ?? 0) + 1;
        return acc;
      },
      {},
    );

    // 현재 열린 상태를 agentId 기준으로 빠르게 조회 (팀 통계에 재활용)
    const agentStatusMap = new Map<string, string>();
    for (const s of openStatuses) agentStatusMap.set(s.agentId, s.statusCode);

    // ── 팀 통계 (큐 = 팀으로 간주) ─────────────────────────────────────────
    // 큐별 멤버 agentId 를 구하려면 agentId 도 select 해야 함.
    // 쿼리를 분리해 agentId 포함 재조회.
    const queueMembersWithAgent = await this.prisma.queueAgentMembers.findMany({
      where: {
        tenantId,
        ...(branchScope ? { queueId: { in: branchScope.queueIds } } : {}),
      },
      select: {
        queueId: true,
        agentId: true,
        queue: { select: { queueDisplayName: true, queueName: true } },
      },
    });

    type TeamRow = {
      teamName: string;
      available: number;
      ringing: number;
      talking: number;
      acw: number;
      break: number;
    };
    const teamMap = new Map<string, TeamRow>();
    for (const m of queueMembersWithAgent) {
      if (!teamMap.has(m.queueId)) {
        teamMap.set(m.queueId, {
          teamName: m.queue.queueDisplayName ?? m.queue.queueName,
          available: 0,
          ringing: 0,
          talking: 0,
          acw: 0,
          break: 0,
        });
      }
      const team = teamMap.get(m.queueId)!;
      const status = agentStatusMap.get(m.agentId) ?? '';
      if (status === 'AVAILABLE') team.available++;
      else if (status === 'RINGING_AGENT') team.ringing++;
      else if (status === 'TALKING') team.talking++;
      else if (status === 'AFTER_CALL_WORK') team.acw++;
      else if (status === 'BREAK') team.break++;
    }
    const teams = [...teamMap.values()];

    // ── 시간대별 트래픽 ────────────────────────────────────────────────────
    const trafficBuckets = hourlyRaw.reduce<Record<number, { inbound: number; answered: number; abandoned: number }>>(
      (acc, row) => {
        const hour = row.startedAt.getHours();
        if (!acc[hour]) acc[hour] = { inbound: 0, answered: 0, abandoned: 0 };
        acc[hour].inbound += 1;
        if (row.answeredAt) acc[hour].answered += 1;
        if (row.abandonFlag) acc[hour].abandoned += 1;
        return acc;
      },
      {},
    );

    const traffic = Array.from({ length: 24 }, (_, h) => {
      const row = trafficBuckets[h];
      return {
        hour: `${String(h).padStart(2, '0')}시`,
        inbound: row ? row.inbound : 0,
        answered: row ? row.answered : 0,
        abandoned: row ? row.abandoned : 0,
      };
    // 현재 시간대까지만 포함 (이후 시간대는 0이므로 제거)
    }).filter((_, h) => h <= new Date().getHours());

    // ── 알람 (규칙 기반) ───────────────────────────────────────────────────
    type Alert = { id: string; level: 'info' | 'warning' | 'error'; message: string; time: string };
    const alerts: Alert[] = [];
    const queues = queuesSummary.data?.queues ?? [];
    const SLA_SEC = 60;
    const SLA_ABANDON_PCT = 20;

    for (const q of queues) {
      const displayName = q.queueDisplayName ?? q.queueName;
      const total = (q.recentAnswered ?? 0) + (q.recentAbandoned ?? 0);
      const abandonPct = total > 0 ? Math.round(((q.recentAbandoned ?? 0) / total) * 100) : 0;

      if (q.available === 0 && (q.waiting > 0 || q.ringing > 0)) {
        alerts.push({
          id: `no-agent-${q.queueId}`,
          level: 'error',
          message: `[${displayName}] 가용 상담원이 없습니다 (대기 ${q.waiting}건)`,
          time: '방금 전',
        });
      } else if (q.longestWaitSeconds > SLA_SEC) {
        alerts.push({
          id: `sla-${q.queueId}`,
          level: 'warning',
          message: `[${displayName}] 최장 대기시간 ${q.longestWaitSeconds}초가 SLA(${SLA_SEC}초)를 초과했습니다`,
          time: '방금 전',
        });
      }

      if (abandonPct > SLA_ABANDON_PCT) {
        alerts.push({
          id: `abandon-${q.queueId}`,
          level: 'warning',
          message: `[${displayName}] 포기율 ${abandonPct}%가 기준(${SLA_ABANDON_PCT}%)을 초과했습니다`,
          time: '방금 전',
        });
      }
    }

    return {
      success: true,
      data: {
        queues,
        activeCalls,
        today: {
          total: todayTotal,
          answered: todayAnswered,
          abandoned: todayAbandoned,
        },
        agentStatusDistribution: statusDistribution,
        teams,
        traffic,
        alerts,
        generatedAt: new Date().toISOString(),
      },
      error: null,
    };
  }

  async listAmiLogs(tenantId: string, q: ListAmiLogsQueryDto) {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 20;
    const from = q.from ? new Date(q.from) : new Date(Date.now() - 24 * 60 * 60 * 1000);
    const to = q.to ? new Date(q.to) : new Date();
    const branchScope = await this.getBranchScope(tenantId, (q as ListAmiLogsQueryDto & { branchId?: string }).branchId);
    let linkedidsForBranch: string[] | null = null;

    if (branchScope) {
      const rows = await this.prisma.callSessions.findMany({
        where: {
          tenantId,
          startedAt: { gte: from, lte: to },
          ...(this.buildBranchCallFilter(branchScope) ?? {}),
        },
        select: { linkedid: true },
      });
      linkedidsForBranch = rows.map((row) => row.linkedid);
    }

    const where: Prisma.rawAmiEventsWhereInput = {
      tenantId,
      eventTime: { gte: from, lte: to },
      ...(q.eventName ? { eventName: { contains: q.eventName, mode: 'insensitive' as const } } : {}),
      ...(linkedidsForBranch || q.linkedid
        ? {
            AND: [
              ...(linkedidsForBranch ? [{ linkedid: { in: linkedidsForBranch } }] : []),
              ...(q.linkedid ? [{ linkedid: { contains: q.linkedid, mode: 'insensitive' as const } }] : []),
            ],
          }
        : {}),
    };

    const [total, rows] = await Promise.all([
      this.prisma.rawAmiEvents.count({ where }),
      this.prisma.rawAmiEvents.findMany({
        where,
        orderBy: { eventTime: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          eventId: true,
          eventName: true,
          eventTime: true,
          linkedid: true,
          uniqueid: true,
          payload: true,
        },
      }),
    ]);

    return {
      success: true,
      data: {
        rows,
        page,
        pageSize,
        total,
      },
      error: null,
    };
  }

  async listAnnouncements(tenantId: string) {
    const rows = await this.prisma.announcements.findMany({
      where: { tenantId },
      orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
    });

    return { success: true, data: rows, error: null };
  }

  async createAnnouncement(
    tenantId: string,
    dto: CreateAnnouncementDto,
    actor?: { agentName?: string },
  ) {
    const row = await this.prisma.announcements.create({
      data: {
        tenantId,
        title: dto.title,
        body: dto.body,
        authorName: dto.authorName || actor?.agentName || '관리자',
        pinned: dto.pinned ?? false,
      },
    });

    return { success: true, data: row, error: null };
  }

  async updateAnnouncement(
    tenantId: string,
    announcementId: string,
    dto: UpdateAnnouncementDto,
    actor?: { agentName?: string },
  ) {
    const row = await this.prisma.announcements.updateMany({
      where: { tenantId, announcementId },
      data: {
        title: dto.title,
        body: dto.body,
        authorName: dto.authorName || actor?.agentName || '관리자',
        pinned: dto.pinned ?? false,
        updatedAt: new Date(),
      },
    });

    return { success: true, data: { updated: row.count > 0, announcementId }, error: null };
  }

  async deleteAnnouncement(tenantId: string, announcementId: string) {
    await this.prisma.announcements.deleteMany({
      where: { announcementId, tenantId },
    });

    return { success: true, data: { deleted: true, announcementId }, error: null };
  }

  async listBranches(tenantId: string) {
    const rows = await this.prisma.branches.findMany({
      where: { tenantId },
      orderBy: [{ isActive: 'desc' }, { branchName: 'asc' }],
      include: {
        agentMappings: true,
        queueMappings: true,
        didMappings: true,
      },
    });

    return {
      success: true,
      data: rows.map((row) => ({
        ...row,
        agentCount: row.agentMappings.length,
        queueCount: row.queueMappings.length,
        didCount: row.didMappings.length,
      })),
      error: null,
    };
  }

  async createBranch(tenantId: string, dto: CreateBranchDto) {
    const row = await this.prisma.branches.create({
      data: {
        tenantId,
        branchCode: dto.branchCode,
        branchName: dto.branchName,
        description: dto.description ?? null,
        isActive: dto.isActive ?? true,
      },
    });
    return { success: true, data: row, error: null };
  }

  async updateBranch(tenantId: string, branchId: string, dto: UpdateBranchDto) {
    const row = await this.prisma.branches.updateMany({
      where: { tenantId, branchId },
      data: {
        ...(dto.branchCode !== undefined ? { branchCode: dto.branchCode } : {}),
        ...(dto.branchName !== undefined ? { branchName: dto.branchName } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        updatedAt: new Date(),
      },
    });
    return { success: true, data: { updated: row.count > 0, branchId }, error: null };
  }

  async deleteBranch(tenantId: string, branchId: string) {
    await this.prisma.branches.deleteMany({
      where: { tenantId, branchId },
    });
    return { success: true, data: { deleted: true, branchId }, error: null };
  }

  async getBranchMappings(tenantId: string, branchId: string) {
    const branch = await this.prisma.branches.findFirst({
      where: { tenantId, branchId },
      include: {
        agentMappings: {
          select: { agentId: true },
        },
        queueMappings: {
          select: { queueId: true },
        },
        didMappings: {
          select: { didId: true },
        },
      },
    });

    const [agents, queues, dids] = await Promise.all([
      this.prisma.agents.findMany({
        where: { tenantId, isActive: true },
        orderBy: [{ extension: 'asc' }],
        select: {
          agentId: true,
          agentName: true,
          extension: true,
          role: true,
        },
      }),
      this.prisma.queues.findMany({
        where: { tenantId, isActive: true },
        orderBy: [{ queueName: 'asc' }],
        select: {
          queueId: true,
          queueName: true,
          queueDisplayName: true,
        },
      }),
      this.prisma.asteriskDid.findMany({
        where: { tenantId, enabled: true },
        orderBy: [{ did: 'asc' }],
        select: {
          id: true,
          did: true,
          description: true,
        },
      }),
    ]);

    return {
      success: true,
      data: {
        branch: branch
          ? {
              branchId: branch.branchId,
              branchCode: branch.branchCode,
              branchName: branch.branchName,
            }
          : null,
        assignedAgentIds: branch?.agentMappings.map((item) => item.agentId) ?? [],
        assignedQueueIds: branch?.queueMappings.map((item) => item.queueId) ?? [],
        assignedDidIds: branch?.didMappings.map((item) => item.didId) ?? [],
        availableAgents: agents,
        availableQueues: queues,
        availableDids: dids,
      },
      error: null,
    };
  }

  async updateBranchMappings(tenantId: string, branchId: string, dto: UpdateBranchMappingsDto) {
    await this.prisma.$transaction(async (tx) => {
      if (dto.agentIds) {
        await tx.branchAgents.deleteMany({
          where: { tenantId, branchId },
        });
        if (dto.agentIds.length > 0) {
          await tx.branchAgents.createMany({
            data: dto.agentIds.map((agentId) => ({
              tenantId,
              branchId,
              agentId,
            })),
            skipDuplicates: true,
          });
        }
      }

      if (dto.queueIds) {
        await tx.branchQueues.deleteMany({
          where: { tenantId, branchId },
        });
        if (dto.queueIds.length > 0) {
          await tx.branchQueues.createMany({
            data: dto.queueIds.map((queueId) => ({
              tenantId,
              branchId,
              queueId,
            })),
            skipDuplicates: true,
          });
        }
      }

      if (dto.didIds) {
        await tx.branchDids.deleteMany({
          where: { tenantId, branchId },
        });
        if (dto.didIds.length > 0) {
          await tx.branchDids.createMany({
            data: dto.didIds.map((didId) => ({
              tenantId,
              branchId,
              didId,
            })),
            skipDuplicates: true,
          });
        }
      }
    });

    return this.getBranchMappings(tenantId, branchId);
  }

  async listRolePermissions(tenantId: string) {
    const rows = await this.prisma.rolePermissions.findMany({
      where: { tenantId },
      orderBy: [{ roleCode: 'asc' }, { menuKey: 'asc' }],
    } as any) as Array<{
      roleCode: string;
      menuKey: string;
      canAccess?: boolean;
      canView?: boolean;
      canCreate?: boolean;
      canUpdate?: boolean;
      canDelete?: boolean;
      canOperate?: boolean;
      canExport?: boolean;
    }>;

    const persisted = new Map(
      rows.map((row) => [`${row.roleCode}:${row.menuKey}`, row]),
    );

    const matrix = ROLE_CODES.map((roleCode) => ({
      roleCode,
      permissions: MENU_KEYS.map((menuKey) => ({
        menuKey,
        ...(persisted.get(`${roleCode}:${menuKey}`)
          ? {
              canView:
                persisted.get(`${roleCode}:${menuKey}`)!.canView ??
                persisted.get(`${roleCode}:${menuKey}`)!.canAccess,
              canCreate: persisted.get(`${roleCode}:${menuKey}`)!.canCreate,
              canUpdate: persisted.get(`${roleCode}:${menuKey}`)!.canUpdate,
              canDelete: persisted.get(`${roleCode}:${menuKey}`)!.canDelete,
              canOperate: persisted.get(`${roleCode}:${menuKey}`)!.canOperate,
              canExport: persisted.get(`${roleCode}:${menuKey}`)!.canExport,
            }
          : defaultPermissionFlags(roleCode, menuKey)),
      })),
    }));

    return {
      success: true,
      data: {
        roles: ROLE_CODES,
        menuKeys: MENU_KEYS,
        matrix,
      },
      error: null,
    };
  }

  async updateRolePermissions(tenantId: string, dto: UpdateRolePermissionsDto) {
    await this.prisma.$transaction(
      dto.items.map((item) =>
        this.prisma.rolePermissions.upsert({
          where: {
            tenantId_roleCode_menuKey: {
              tenantId,
              roleCode: item.roleCode,
              menuKey: item.menuKey,
            },
          },
          create: {
            tenantId,
            roleCode: item.roleCode,
            menuKey: item.menuKey,
            canAccess: item.canView,
            canView: item.canView,
            canCreate: item.canCreate,
            canUpdate: item.canUpdate,
            canDelete: item.canDelete,
            canOperate: item.canOperate,
            canExport: item.canExport,
          } as any,
          update: {
            canAccess: item.canView,
            canView: item.canView,
            canCreate: item.canCreate,
            canUpdate: item.canUpdate,
            canDelete: item.canDelete,
            canOperate: item.canOperate,
            canExport: item.canExport,
            updatedAt: new Date(),
          } as any,
        }),
      ),
    );

    return this.listRolePermissions(tenantId);
  }

  async getSystemSettings(tenantId: string) {
    const tenant = await this.prisma.tenants.findUnique({
      where: { tenantId },
      select: { timezone: true },
    });

    const row = await this.prisma.tenantSystemSettings.findUnique({
      where: { tenantId },
    } as any) as
      | {
          recordingEnabled: boolean;
          defaultMaxWaitSeconds: number;
          allowDirectSipDial?: boolean | null;
          defaultSipPassword?: string | null;
          allowedOutboundCallerIds?: string | null;
          defaultOutboundCallerId?: string | null;
          sipRegisterPort?: number | null;
          timezone: string;
          dateFormat: string;
        }
      | null;

    const defaults = {
      tenantId,
      recordingEnabled: true,
      defaultMaxWaitSeconds: 45,
      allowDirectSipDial: false,
      defaultSipPassword: '',
      allowedOutboundCallerIds: '',
      defaultOutboundCallerId: '',
      sipRegisterPort: 36070,
      timezone: tenant?.timezone ?? 'Asia/Seoul',
      dateFormat: 'YYYY-MM-DD HH:mm:ss',
    };

    return {
      success: true,
      data: row
        ? {
            ...row,
            defaultSipPassword: row.defaultSipPassword ?? '',
            allowedOutboundCallerIds: row.allowedOutboundCallerIds ?? '',
            defaultOutboundCallerId: row.defaultOutboundCallerId ?? '',
          }
        : defaults,
      error: null,
    };
  }

  async updateSystemSettings(tenantId: string, dto: UpdateSystemSettingsDto) {
    const allowedOutboundCallerIds = parseAllowedCallerIds(dto.allowedOutboundCallerIds);
    const defaultOutboundCallerId = dto.defaultOutboundCallerId?.trim()
      ? parseAllowedCallerIds(dto.defaultOutboundCallerId)[0]
      : null;

    if (defaultOutboundCallerId && !allowedOutboundCallerIds.includes(defaultOutboundCallerId)) {
      throw new BadRequestException('기본 발신번호는 허용된 발신번호 목록에 포함되어야 합니다.');
    }

    if (dto.allowDirectSipDial && !defaultOutboundCallerId) {
      throw new BadRequestException('직접 발신을 허용하려면 기본 발신번호를 지정해야 합니다.');
    }

    const row = await this.prisma.tenantSystemSettings.upsert({
      where: { tenantId },
      create: {
        tenantId,
        recordingEnabled: dto.recordingEnabled,
        defaultMaxWaitSeconds: dto.defaultMaxWaitSeconds,
        allowDirectSipDial: dto.allowDirectSipDial,
        defaultSipPassword: dto.defaultSipPassword?.trim() || null,
        allowedOutboundCallerIds: serializeAllowedCallerIds(allowedOutboundCallerIds),
        defaultOutboundCallerId,
        sipRegisterPort: dto.sipRegisterPort,
        timezone: dto.timezone,
        dateFormat: dto.dateFormat,
      } as any,
      update: {
        recordingEnabled: dto.recordingEnabled,
        defaultMaxWaitSeconds: dto.defaultMaxWaitSeconds,
        allowDirectSipDial: dto.allowDirectSipDial,
        defaultSipPassword: dto.defaultSipPassword?.trim() || null,
        allowedOutboundCallerIds: serializeAllowedCallerIds(allowedOutboundCallerIds),
        defaultOutboundCallerId,
        sipRegisterPort: dto.sipRegisterPort,
        timezone: dto.timezone,
        dateFormat: dto.dateFormat,
        updatedAt: new Date(),
      } as any,
    } as any);

    await this.prisma.tenants.update({
      where: { tenantId },
      data: { timezone: dto.timezone, updatedAt: new Date() },
    });

    await this.asteriskReloadService.executeReload(tenantId);

    return { success: true, data: row, error: null };
  }
}
