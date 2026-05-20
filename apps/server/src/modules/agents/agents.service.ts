import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../common/prisma.service';
import { AmiConnectionService } from '../ami/ami-connection.service';
import type { ParsedAmiFrame } from '../ami/ami.parser';
import { AsteriskReloadService } from '../asterisk-config/asterisk-reload.service';
import {
  CopyAgentPermissionsDto,
  PERMISSION_COPY_CORE_SCOPES,
  PermissionCopyScope,
} from './dto/copy-agent-permissions.dto';
import { CreateAgentDto } from './dto/create-agent.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';

@Injectable()
export class AgentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly asteriskReload: AsteriskReloadService,
    private readonly ami: AmiConnectionService,
  ) {}

  async listForTenant(tenantId: string) {
    const agents = await this.prisma.agents.findMany({
      where: { tenantId },
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

    const agentIds = agents.map((agent) => agent.agentId);
    const currentStatuses = agentIds.length
      ? await this.prisma.agentStatusHistory.findMany({
          where: {
            tenantId,
            agentId: { in: agentIds },
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
        })
      : [];

    const currentStatusByAgentId = new Map<string, Omit<(typeof currentStatuses)[number], 'agentId'>>();
    for (const row of currentStatuses) {
      if (!currentStatusByAgentId.has(row.agentId)) {
        const { agentId, ...current } = row;
        currentStatusByAgentId.set(agentId, current);
      }
    }
    const now = new Date();
    const activeSessions = agentIds.length
      ? await this.prisma.refreshTokens.findMany({
          where: {
            tenantId,
            agentId: { in: agentIds },
            revokedAt: null,
            expiresAt: { gt: now },
          },
          orderBy: { issuedAt: 'desc' },
          select: {
            agentId: true,
            issuedAt: true,
            expiresAt: true,
          },
        })
      : [];
    const activeSessionByAgentId = new Map<string, Omit<(typeof activeSessions)[number], 'agentId'>>();
    for (const row of activeSessions) {
      if (!activeSessionByAgentId.has(row.agentId)) {
        const { agentId, ...session } = row;
        activeSessionByAgentId.set(agentId, session);
      }
    }

    const contactsByExtension = this.indexContactsByExtension(await this.fetchPjsipContacts());

    const withStatus = agents.map((agent) => ({
      ...agent,
      currentStatus: currentStatusByAgentId.get(agent.agentId) ?? null,
      loginStatus: activeSessionByAgentId.has(agent.agentId) ? 'LOGGED_IN' : 'LOGGED_OUT',
      activeSession: activeSessionByAgentId.get(agent.agentId) ?? null,
      sipRegistration: contactsByExtension[agent.extension] ?? {
        registered: false,
        registrationStatus: 'UNREGISTERED',
        contactUri: null,
        userAgent: null,
        roundtripUsec: null,
      },
      canCall: agent.isActive
        && activeSessionByAgentId.has(agent.agentId)
        && Boolean(contactsByExtension[agent.extension]?.registered),
    }));

    return { success: true, data: withStatus, error: null };
  }

  private async fetchPjsipContacts(): Promise<ParsedAmiFrame[]> {
    try {
      return await this.ami.sendActionWithResponse(
        { Action: 'PJSIPShowContacts' },
        { eventList: true, timeoutMs: 5000 },
      );
    } catch {
      return [];
    }
  }

  private indexContactsByExtension(frames: ParsedAmiFrame[]) {
    const indexed: Record<string, {
      registered: boolean;
      registrationStatus: string;
      contactUri: string | null;
      userAgent: string | null;
      roundtripUsec: number | null;
    }> = {};

    for (const frame of frames) {
      if (frame.Event !== 'ContactList') continue;
      const endpointName = frame.Endpoint?.trim();
      const objectName = frame.ObjectName ?? '';
      const extension = endpointName || objectName.split('/')[0]?.trim();
      if (!extension || !/^\d+$/.test(extension)) continue;

      const contactUri = frame.Uri ?? frame.URI ?? frame.Contact ?? null;
      const registrationStatus = frame.Status ?? 'UNKNOWN';
      indexed[extension] = {
        registered: Boolean(contactUri),
        registrationStatus,
        contactUri,
        userAgent: frame.UserAgent ?? null,
        roundtripUsec: frame.RoundtripUsec ? Number(frame.RoundtripUsec) : null,
      };
    }

    return indexed;
  }

  private async assertAgentGroupBelongsToTenant(
    tenantId: string,
    agentGroupId: string,
  ) {
    const group = await (this.prisma as any).agentGroups.findFirst({
      where: { tenantId, agentGroupId },
      select: { agentGroupId: true },
    });
    if (!group) {
      throw new BadRequestException('상담원 그룹을 찾을 수 없습니다.');
    }
  }

  async create(tenantId: string, dto: CreateAgentDto) {
    const existing = await this.prisma.agents.findFirst({
      where: {
        tenantId,
        OR: [
          { loginId: dto.loginId },
          { agentCode: dto.agentCode },
          { extension: dto.extension },
        ],
      },
      select: { loginId: true, agentCode: true, extension: true },
    });

    if (existing) {
      if (existing.loginId === dto.loginId) {
        throw new ConflictException(`loginId '${dto.loginId}' 이미 사용 중`);
      }
      if (existing.agentCode === dto.agentCode) {
        throw new ConflictException(`agentCode '${dto.agentCode}' 이미 사용 중`);
      }
      if (existing.extension === dto.extension) {
        throw new ConflictException(`extension '${dto.extension}' 이미 사용 중`);
      }
    }

    if (dto.agentGroupId) {
      await this.assertAgentGroupBelongsToTenant(tenantId, dto.agentGroupId);
    }

    const hash = await bcrypt.hash(dto.password, 10);

    const agent = await this.prisma.agents.create({
      data: {
        tenantId,
        loginId: dto.loginId,
        agentCode: dto.agentCode,
        agentName: dto.agentName,
        extension: dto.extension,
        extensionDisplayName: dto.extensionDisplayName?.trim() || null,
        extensionLockMode: dto.extensionLockMode ?? 'UNLOCKED',
        loginPasswordHash: hash,
        sipPassword: dto.sipPassword?.trim() || null,
        ...(dto.settingsProfile !== undefined
          ? { settingsProfile: dto.settingsProfile as Prisma.InputJsonValue }
          : {}),
        role: dto.role ?? 'agent',
        defaultQueueId: dto.defaultQueueId ?? null,
        agentGroupId: dto.agentGroupId ?? null,
      },
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
        defaultQueueId: true,
        agentGroupId: true,
        settingsProfile: true,
      },
    });

    return { success: true, data: agent, error: null };
  }

  async getDetail(tenantId: string, agentId: string) {
    const agent = await this.prisma.agents.findFirst({
      where: { agentId, tenantId },
      include: {
        defaultQueue: true,
      },
    });
    if (!agent) {
      throw new NotFoundException('Agent not found');
    }

    const currentStatus = await this.prisma.agentStatusHistory.findFirst({
      where: { agentId, endedAt: null },
      orderBy: { startedAt: 'desc' },
    });

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const todaysCalls = await this.prisma.callSessions.findMany({
      where: {
        tenantId,
        primaryAgentId: agentId,
        startedAt: { gte: startOfDay },
        sessionStatus: 'ENDED',
      },
      select: { talkSeconds: true },
    });

    const answered = todaysCalls.length;
    const missed = await this.prisma.callSessions.count({
      where: {
        tenantId,
        primaryAgentId: agentId,
        startedAt: { gte: startOfDay },
        sessionStatus: 'ENDED',
        answeredAt: null,
      },
    });
    const totalTalk = todaysCalls.reduce((sum, c) => sum + (c.talkSeconds ?? 0), 0);
    const avgTalk = answered > 0 ? Math.round(totalTalk / answered) : 0;

    return {
      success: true,
      data: {
        agent,
        currentStatus,
        todayStats: { answered, missed, totalTalkSeconds: totalTalk, avgTalkSeconds: avgTalk },
      },
      error: null,
    };
  }

  async getHistory(tenantId: string, agentId: string, limit = 50) {
    const rows = await this.prisma.agentStatusHistory.findMany({
      where: { agentId, tenantId },
      orderBy: { startedAt: 'desc' },
      take: limit,
    });
    return { success: true, data: rows, error: null };
  }

  async update(tenantId: string, agentId: string, dto: UpdateAgentDto) {
    const agent = await this.prisma.agents.findFirst({ where: { agentId, tenantId } });
    if (!agent) throw new NotFoundException('Agent not found');

    if (
      (dto.loginId !== undefined && dto.loginId !== agent.loginId) ||
      (dto.extension !== undefined && dto.extension !== agent.extension)
    ) {
      const duplicate = await this.prisma.agents.findFirst({
        where: {
          tenantId,
          agentId: { not: agentId },
          OR: [
            ...(dto.loginId !== undefined ? [{ loginId: dto.loginId }] : []),
            ...(dto.extension !== undefined ? [{ extension: dto.extension }] : []),
          ],
        },
        select: { loginId: true, extension: true },
      });

      if (duplicate) {
        if (dto.loginId !== undefined && duplicate.loginId === dto.loginId) {
          throw new ConflictException(`loginId '${dto.loginId}' 이미 사용 중`);
        }
        if (dto.extension !== undefined && duplicate.extension === dto.extension) {
          throw new ConflictException(`extension '${dto.extension}' 이미 사용 중`);
        }
      }
    }

    if (dto.agentGroupId) {
      await this.assertAgentGroupBelongsToTenant(tenantId, dto.agentGroupId);
    }

    const passwordHash =
      dto.password !== undefined && dto.password.trim()
        ? await bcrypt.hash(dto.password, 10)
        : undefined;

    const updated = await this.prisma.agents.update({
      where: { agentId },
      data: {
        ...(dto.loginId !== undefined && { loginId: dto.loginId }),
        ...(passwordHash !== undefined && { loginPasswordHash: passwordHash }),
        ...(dto.agentName !== undefined && { agentName: dto.agentName }),
        ...(dto.extension !== undefined && { extension: dto.extension }),
        ...(dto.extensionDisplayName !== undefined && {
          extensionDisplayName: dto.extensionDisplayName?.trim() || null,
        }),
        ...(dto.extensionLockMode !== undefined && { extensionLockMode: dto.extensionLockMode }),
        ...(dto.role !== undefined && { role: dto.role }),
        ...(dto.defaultQueueId !== undefined && { defaultQueueId: dto.defaultQueueId }),
        ...(dto.agentGroupId !== undefined && { agentGroupId: dto.agentGroupId }),
        ...(dto.sipPassword !== undefined && { sipPassword: dto.sipPassword?.trim() || null }),
        ...(dto.settingsProfile !== undefined
          ? { settingsProfile: dto.settingsProfile as Prisma.InputJsonValue }
          : {}),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        updatedAt: new Date(),
      },
      select: {
        agentId: true,
        agentName: true,
        extension: true,
        extensionDisplayName: true,
        extensionLockMode: true,
        role: true,
        loginId: true,
        defaultQueueId: true,
        agentGroupId: true,
        sipPassword: true,
        settingsProfile: true,
        isActive: true,
      },
    });
    if (dto.sipPassword !== undefined) {
      this.asteriskReload.scheduleReload(tenantId);
    }
    return { success: true, data: updated, error: null };
  }

  async deactivate(tenantId: string, agentId: string) {
    const agent = await this.prisma.agents.findFirst({ where: { agentId, tenantId } });
    if (!agent) throw new NotFoundException('Agent not found');

    await this.prisma.agents.update({
      where: { agentId },
      data: { isActive: false, updatedAt: new Date() },
    });

    return { success: true, data: { agentId, isActive: false }, error: null };
  }

  async resetPassword(tenantId: string, agentId: string) {
    const agent = await this.prisma.agents.findFirst({ where: { agentId, tenantId } });
    if (!agent) throw new NotFoundException('Agent not found');

    const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
    const tempPassword = Array.from({ length: 12 }, () =>
      chars[Math.floor(Math.random() * chars.length)],
    ).join('');

    const hash = await bcrypt.hash(tempPassword, 10);
    await this.prisma.agents.update({
      where: { agentId },
      data: { loginPasswordHash: hash, updatedAt: new Date() },
    });

    return {
      success: true,
      data: { agentId, tempPassword },
      error: null,
    };
  }

  /**
   * 권한 복사 (BlueSky DlgCallPossibleAuthCopy 등가).
   * source 의 선택된 scope 를 target 으로 복제.
   * - 핵심 scope (queueMembership / branchCidAuth / menuPermissions / agentSettingsProfile) 는 destructive:
   *   target 의 기존 항목을 deleteMany 후 source 항목으로 createMany.
   * - 옵션 scope (outboundCallerIdOverride) 는 향후 상담원 단위 예외 도입 시 활성화.
   */
  async copyPermissions(
    tenantId: string,
    targetAgentId: string,
    dto: CopyAgentPermissionsDto,
  ) {
    if (dto.sourceAgentId === targetAgentId) {
      throw new ConflictException('소스와 타겟 상담원이 같습니다.');
    }

    const [source, target] = await Promise.all([
      this.prisma.agents.findFirst({
        where: { tenantId, agentId: dto.sourceAgentId },
        select: { agentId: true, settingsProfile: true, agentName: true },
      }),
      this.prisma.agents.findFirst({
        where: { tenantId, agentId: targetAgentId },
        select: { agentId: true, agentName: true },
      }),
    ]);
    if (!source) throw new NotFoundException('소스 상담원을 찾을 수 없습니다.');
    if (!target) throw new NotFoundException('타겟 상담원을 찾을 수 없습니다.');

    const scopes = new Set<PermissionCopyScope>(dto.scopes);
    const summary: Record<string, number> = {};

    await this.prisma.$transaction(async (tx) => {
      if (scopes.has('queueMembership')) {
        const sourceMembers = await tx.queueAgentMembers.findMany({
          where: { tenantId, agentId: dto.sourceAgentId },
          select: { queueId: true, penalty: true, memberOrder: true, isActive: true },
        });
        await tx.queueAgentMembers.deleteMany({
          where: { tenantId, agentId: targetAgentId },
        });
        if (sourceMembers.length > 0) {
          await tx.queueAgentMembers.createMany({
            data: sourceMembers.map((m) => ({
              tenantId,
              agentId: targetAgentId,
              queueId: m.queueId,
              penalty: m.penalty,
              memberOrder: m.memberOrder,
              isActive: m.isActive,
            })),
          });
        }
        summary.queueMembership = sourceMembers.length;
      }

      if (scopes.has('branchCidAuth')) {
        const sourceRows = await (tx as any).agentBranchCallerIds.findMany({
          where: { tenantId, agentId: dto.sourceAgentId },
        });
        await (tx as any).agentBranchCallerIds.deleteMany({
          where: { tenantId, agentId: targetAgentId },
        });
        if (sourceRows.length > 0) {
          await (tx as any).agentBranchCallerIds.createMany({
            data: sourceRows.map((r: any) => ({
              tenantId,
              agentId: targetAgentId,
              branchId: r.branchId,
              callerIdNumber: r.callerIdNumber,
              displayName: r.displayName,
              allowedInbound: r.allowedInbound,
              allowedOutbound: r.allowedOutbound,
              allowedTransfer: r.allowedTransfer,
              sortOrder: r.sortOrder,
            })),
          });
        }
        summary.branchCidAuth = sourceRows.length;
      }

      if (scopes.has('menuPermissions')) {
        const sourceRows = await tx.agentMenuPermissions.findMany({
          where: { tenantId, agentId: dto.sourceAgentId },
        });
        await tx.agentMenuPermissions.deleteMany({
          where: { tenantId, agentId: targetAgentId },
        });
        if (sourceRows.length > 0) {
          await tx.agentMenuPermissions.createMany({
            data: sourceRows.map((r) => ({
              tenantId,
              agentId: targetAgentId,
              menuKey: r.menuKey,
              canAccess: r.canAccess,
              canView: r.canView,
              canCreate: r.canCreate,
              canUpdate: r.canUpdate,
              canDelete: r.canDelete,
              canOperate: r.canOperate,
              canExport: r.canExport,
            })),
          });
        }
        summary.menuPermissions = sourceRows.length;
      }

      if (scopes.has('agentSettingsProfile')) {
        await tx.agents.update({
          where: { agentId: targetAgentId },
          data: {
            settingsProfile: source.settingsProfile as Prisma.InputJsonValue,
            updatedAt: new Date(),
          },
        });
        summary.agentSettingsProfile = 1;
      }

      if (scopes.has('outboundCallerIdOverride')) {
        // 현재 상담원 단위 outbound override 모델은 없음 — plan 의 옵션 scope 자리만 표시.
        summary.outboundCallerIdOverride = 0;
      }
    });

    // 권한 변경 후 dialplan 재구성 트리거.
    if (
      scopes.has('branchCidAuth') ||
      scopes.has('agentSettingsProfile') ||
      scopes.has('queueMembership')
    ) {
      this.asteriskReload.scheduleReload(tenantId);
    }

    const coreScopesUsed = (Array.from(scopes) as PermissionCopyScope[]).filter(
      (s) => (PERMISSION_COPY_CORE_SCOPES as readonly string[]).includes(s),
    );

    return {
      success: true,
      data: {
        sourceAgentId: dto.sourceAgentId,
        targetAgentId,
        coreScopesApplied: coreScopesUsed,
        summary,
      },
      error: null,
    };
  }
}
