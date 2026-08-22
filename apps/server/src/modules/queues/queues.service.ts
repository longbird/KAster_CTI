import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  DEFAULT_DISTRIBUTION_RULE_DISPLAY_NAME,
  DEFAULT_DISTRIBUTION_RULE_QUEUE_NAME,
} from '../../common/call-routing.constants';
import { PrismaService } from '../../common/prisma.service';
import { AsteriskReloadService } from '../asterisk-config/asterisk-reload.service';
import { CreateQueueDto } from './dto/create-queue.dto';
import { QueueOverflowRuleDto } from './dto/queue-overflow-rule.dto';
import { UpdateQueueDto } from './dto/update-queue.dto';
import {
  normalizeUnconditionalTarget,
  resolveQueueStrategy,
  type DistributionMode,
} from './distribution-mode';
import { DEFAULT_AGENT_OFFER_TIMEOUT_SECONDS } from '../../common/call-routing.constants';

@Injectable()
export class QueuesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reload: AsteriskReloadService,
  ) {}

  async getSummary(tenantId: string, queueIds?: string[]) {
    await this.ensureDefaultRule(tenantId);
    const queues = await this.prisma.queues.findMany({
      where: {
        tenantId,
        isActive: true,
        ...(queueIds ? { queueId: { in: queueIds } } : {}),
      },
      select: {
        queueId: true,
        queueName: true,
        queueDisplayName: true,
        queueExten: true,
        maxWaitSeconds: true,
      },
    });

    const rows = await Promise.all(
      queues.map(async (q) => {
        const snapshot = await this.prisma.callSessions.groupBy({
          by: ['sessionStatus'],
          where: {
            tenantId,
            queueName: q.queueName,
            sessionStatus: { notIn: ['ENDED'] },
          },
          _count: { callId: true },
        });

        const longestWait = await this.prisma.callSessions.findFirst({
          where: { tenantId, queueName: q.queueName, sessionStatus: 'QUEUED' },
          orderBy: { queuedAt: 'asc' },
          select: { queuedAt: true },
        });
        const longestWaitSeconds = longestWait?.queuedAt
          ? Math.max(0, Math.floor((Date.now() - longestWait.queuedAt.getTime()) / 1000))
          : 0;
        const overThresholdCalls =
          q.maxWaitSeconds && q.maxWaitSeconds > 0
            ? await this.prisma.callSessions.count({
                where: {
                  tenantId,
                  queueName: q.queueName,
                  sessionStatus: 'QUEUED',
                  queuedAt: { lte: new Date(Date.now() - q.maxWaitSeconds * 1000) },
                },
              })
            : 0;

        const thirtyMinAgo = new Date(Date.now() - 30 * 60_000);
        const [answered, abandoned] = await Promise.all([
          this.prisma.queueEvents.count({
            where: {
              tenantId,
              queueId: q.queueId,
              eventType: 'AGENT_CONNECT',
              eventTime: { gte: thirtyMinAgo },
            },
          }),
          this.prisma.queueEvents.count({
            where: {
              tenantId,
              queueId: q.queueId,
              eventType: { in: ['ABANDON', 'TIMEOUT'] },
              eventTime: { gte: thirtyMinAgo },
            },
          }),
        ]);

        const snapshotMap: Record<string, number> = {};
        for (const s of snapshot) {
          snapshotMap[s.sessionStatus] = s._count.callId;
        }

        const waiting = snapshotMap.QUEUED ?? 0;
        const ringing = snapshotMap.RINGING_AGENT ?? 0;
        const talking = snapshotMap.TALKING ?? 0;

        const members = await this.prisma.queueAgentMembers.findMany({
          where: { queueId: q.queueId, isActive: true },
          select: { agentId: true },
        });
        const agentIds = members.map((m) => m.agentId);
        const latestStatuses = await Promise.all(
          agentIds.map((agentId) =>
            this.prisma.agentStatusHistory.findFirst({
              where: { agentId, endedAt: null },
              orderBy: { startedAt: 'desc' },
              select: { statusCode: true },
            }),
          ),
        );

        let available = 0;
        let paused = 0;
        for (const s of latestStatuses) {
          if (!s) continue;
          if (s.statusCode === 'AVAILABLE') available += 1;
          else if (
            s.statusCode === 'BREAK' ||
            s.statusCode === 'MEAL' ||
            s.statusCode === 'MANUAL_PAUSED'
          ) {
            paused += 1;
          }
        }

        return {
          queueId: q.queueId,
          queueName: q.queueName,
          queueDisplayName: q.queueDisplayName,
          queueExten: q.queueExten,
          waiting,
          ringing,
          talking,
          available,
          paused,
          longestWaitSeconds,
          virtualBuffer: {
            waitingCalls: waiting,
            longestWaitSeconds,
            overThresholdCalls,
            status: waiting === 0 ? 'EMPTY' : overThresholdCalls > 0 ? 'OVER_THRESHOLD' : 'WAITING',
          },
          recentAnswered: answered,
          recentAbandoned: abandoned,
        };
      }),
    );

    return { success: true, data: { queues: rows }, error: null };
  }

  async listSettings(tenantId: string) {
    const defaultQueue = await this.ensureDefaultRule(tenantId);
    const rows = await this.prisma.queues.findMany({
      where: { tenantId },
      select: {
        queueId: true,
        queueName: true,
        queueExten: true,
        queueDisplayName: true,
        distributionMode: true,
        unconditionalTargetType: true,
        unconditionalTargetValue: true,
        strategy: true,
        maxWaitSeconds: true,
        ringTimeoutSeconds: true,
        agentOfferTimeoutSeconds: true,
        wrapupSeconds: true,
        autopause: true,
        isActive: true,
        overflowRules: {
          orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
          select: {
            queueOverflowRuleId: true,
            triggerMode: true,
            waitSeconds: true,
            targetType: true,
            targetValue: true,
            resultCode: true,
            priority: true,
            enabled: true,
          },
        },
      },
      orderBy: [{ isActive: 'desc' }, { queueName: 'asc' }],
    });
    const queueUsageMap = await this.getQueueRoutingUsageMap(
      tenantId,
      rows.map((row) => row.queueName),
    );

    return {
      success: true,
      data: rows.map((row) => ({
        ...row,
        isDefaultRule: row.queueId === defaultQueue.queueId,
        ...this.buildQueueProtection(row.queueName, row.queueId === defaultQueue.queueId, queueUsageMap),
      })),
      error: null,
    };
  }

  async create(tenantId: string, dto: CreateQueueDto) {
    const queueName = dto.queueName?.trim() || await this.allocateQueueName(tenantId);
    const queueExten = dto.queueExten?.trim() || await this.allocateQueueExten(
      tenantId,
      10000,
      20000,
      '호 분배룰에 사용할 내부 대표 내선을 자동 배정할 수 없습니다',
    );
    if (dto.members !== undefined) {
      await this.assertMembersExist(tenantId, dto.members);
    }
    const distributionMode = (dto.distributionMode ?? 'DISTRIBUTE') as DistributionMode;
    const unconditionalTarget = this.normalizeQueueUnconditionalTarget(
      distributionMode,
      dto.unconditionalTargetType,
      dto.unconditionalTargetValue,
    );
    await this.assertUnconditionalTargetExists(tenantId, unconditionalTarget);
    const overflowRules = dto.overflowRules !== undefined
      ? await this.normalizeQueueOverflowRules(tenantId, dto.overflowRules)
      : [];

    const existing = await this.prisma.queues.findFirst({
      where: {
        tenantId,
        OR: [{ queueName }, { queueExten }],
      },
      select: { queueName: true, queueExten: true },
    });

    if (existing) {
      if (existing.queueName === queueName) {
        throw new ConflictException(`큐명 '${queueName}' 이미 사용 중`);
      }
      if (existing.queueExten === queueExten) {
        throw new ConflictException(`내선번호 '${queueExten}' 이미 사용 중`);
      }
    }

    const queue = await this.prisma.$transaction(async (tx) => {
      const createdQueue = await tx.queues.create({
        data: {
          tenantId,
          queueName,
          queueExten,
          queueDisplayName: dto.queueDisplayName,
          distributionMode,
          unconditionalTargetType: unconditionalTarget.unconditionalTargetType,
          unconditionalTargetValue: unconditionalTarget.unconditionalTargetValue,
          strategy: resolveQueueStrategy(distributionMode, dto.strategy),
          ringTimeoutSeconds: dto.ringTimeoutSeconds ?? 15,
          agentOfferTimeoutSeconds: dto.agentOfferTimeoutSeconds ?? DEFAULT_AGENT_OFFER_TIMEOUT_SECONDS,
          wrapupSeconds: dto.wrapupSeconds ?? 30,
          maxWaitSeconds: dto.maxWaitSeconds ?? 45,
          autopause: dto.autopause ?? true,
        },
        select: {
          queueId: true,
          queueName: true,
          queueExten: true,
          queueDisplayName: true,
          distributionMode: true,
          unconditionalTargetType: true,
          unconditionalTargetValue: true,
          strategy: true,
          isActive: true,
        },
      });

      if (dto.members !== undefined) {
        await this.replaceMembers(tx, tenantId, createdQueue.queueId, dto.members);
      }

      if (overflowRules.length > 0) {
        await this.replaceOverflowRules(tx, tenantId, createdQueue.queueId, overflowRules);
      }

      return { ...createdQueue, overflowRules };
    });

    this.reload.scheduleReload(tenantId);
    return { success: true, data: queue, error: null };
  }

  async update(
    tenantId: string,
    queueId: string,
    dto: UpdateQueueDto,
  ) {
    const queue = await this.prisma.queues.findFirst({ where: { queueId, tenantId } });
    if (!queue) throw new NotFoundException('Queue not found');

    if (dto.members !== undefined) {
      await this.assertMembersExist(tenantId, dto.members);
    }
    const distributionMode = (dto.distributionMode ?? queue.distributionMode ?? 'DISTRIBUTE') as DistributionMode;
    const unconditionalTarget = this.normalizeQueueUnconditionalTarget(
      distributionMode,
      dto.unconditionalTargetType !== undefined ? dto.unconditionalTargetType : queue.unconditionalTargetType,
      dto.unconditionalTargetValue !== undefined ? dto.unconditionalTargetValue : queue.unconditionalTargetValue,
    );
    await this.assertUnconditionalTargetExists(tenantId, unconditionalTarget, queueId);
    const overflowRules = dto.overflowRules !== undefined
      ? await this.normalizeQueueOverflowRules(tenantId, dto.overflowRules, queueId)
      : undefined;

    const updated = await this.prisma.$transaction(async (tx) => {
      const savedQueue = await tx.queues.update({
        where: { queueId },
        data: {
          ...(dto.queueDisplayName !== undefined && { queueDisplayName: dto.queueDisplayName }),
          ...(dto.distributionMode !== undefined && {
            distributionMode,
            strategy: resolveQueueStrategy(distributionMode, dto.strategy),
          }),
          unconditionalTargetType: unconditionalTarget.unconditionalTargetType,
          unconditionalTargetValue: unconditionalTarget.unconditionalTargetValue,
          ...(dto.distributionMode === undefined &&
            dto.strategy !== undefined && { strategy: dto.strategy }),
          ...(dto.maxWaitSeconds !== undefined && { maxWaitSeconds: dto.maxWaitSeconds }),
          ...(dto.ringTimeoutSeconds !== undefined && { ringTimeoutSeconds: dto.ringTimeoutSeconds }),
          ...(dto.agentOfferTimeoutSeconds !== undefined && { agentOfferTimeoutSeconds: dto.agentOfferTimeoutSeconds }),
          ...(dto.wrapupSeconds !== undefined && { wrapupSeconds: dto.wrapupSeconds }),
          ...(dto.autopause !== undefined && { autopause: dto.autopause }),
          updatedAt: new Date(),
        },
        select: {
          queueId: true,
          queueName: true,
          queueExten: true,
          queueDisplayName: true,
          distributionMode: true,
          unconditionalTargetType: true,
          unconditionalTargetValue: true,
          strategy: true,
          maxWaitSeconds: true,
          ringTimeoutSeconds: true,
          agentOfferTimeoutSeconds: true,
          wrapupSeconds: true,
          autopause: true,
          isActive: true,
        },
      });

      if (dto.members !== undefined) {
        await this.replaceMembers(tx, tenantId, queueId, dto.members);
      }

      if (overflowRules !== undefined) {
        await this.replaceOverflowRules(tx, tenantId, queueId, overflowRules);
      }

      return savedQueue;
    });

    const savedOverflowRules = overflowRules ?? await this.findQueueOverflowRules(tenantId, queueId);
    this.reload.scheduleReload(tenantId);
    return { success: true, data: { ...updated, overflowRules: savedOverflowRules }, error: null };
  }

  async deactivate(tenantId: string, queueId: string) {
    const queue = await this.prisma.queues.findFirst({ where: { queueId, tenantId } });
    if (!queue) throw new NotFoundException('Queue not found');

    const defaultQueue = await this.ensureDefaultRule(tenantId);
    const protection = this.buildQueueProtection(
      queue.queueName,
      queue.queueId === defaultQueue.queueId,
      await this.getQueueRoutingUsageMap(tenantId, [queue.queueName]),
    );

    if (!protection.canDeactivate) {
      throw new ConflictException(protection.deactivateBlockedReason);
    }

    await this.prisma.queues.update({
      where: { queueId },
      data: { isActive: false, updatedAt: new Date() },
    });

    this.reload.scheduleReload(tenantId);
    return { success: true, data: { queueId, isActive: false }, error: null };
  }

  async listMembers(tenantId: string, queueId: string) {
    await this.ensureDefaultRule(tenantId);
    const queue = await this.prisma.queues.findFirst({ where: { queueId, tenantId } });
    if (!queue) throw new NotFoundException('Queue not found');

    const members = await this.prisma.queueAgentMembers.findMany({
      where: { queueId, isActive: true },
      include: {
        agent: {
          select: {
            agentId: true,
            agentName: true,
            extension: true,
            loginId: true,
            defaultQueueId: true,
            agentGroupId: true,
            agentGroup: { select: { agentGroupId: true, groupCode: true, groupName: true } },
            role: true,
            isActive: true,
          },
        },
      },
      orderBy: [{ memberOrder: 'asc' }, { penalty: 'asc' }],
    });

    return { success: true, data: members, error: null };
  }

  async setMembers(
    tenantId: string,
    queueId: string,
    members: Array<{ agentId: string; penalty?: number; memberOrder?: number }>,
  ) {
    await this.ensureDefaultRule(tenantId);
    const queue = await this.prisma.queues.findFirst({ where: { queueId, tenantId } });
    if (!queue) throw new NotFoundException('Queue not found');

    const uniqueAgentIds = [...new Set(members.map((item) => item.agentId))];
    await this.assertMembersExist(tenantId, members);

    await this.prisma.$transaction(async (tx) => {
      await this.replaceMembers(tx, tenantId, queueId, members);
    });

    this.reload.scheduleReload(tenantId);
    return this.listMembers(tenantId, queueId);
  }

  async getDefaultRule(tenantId: string) {
    return this.ensureDefaultRule(tenantId);
  }

  private async ensureDefaultRule(tenantId: string) {
    let queue = await this.prisma.queues.findFirst({
      where: { tenantId, queueName: DEFAULT_DISTRIBUTION_RULE_QUEUE_NAME },
    });

    if (!queue) {
      queue = await this.prisma.queues.create({
        data: {
          tenantId,
          queueName: DEFAULT_DISTRIBUTION_RULE_QUEUE_NAME,
          queueExten: await this.allocateQueueExten(
            tenantId,
            9999,
            11000,
            '기본 호 분배룰에 사용할 내선을 자동 배정할 수 없습니다',
          ),
          queueDisplayName: DEFAULT_DISTRIBUTION_RULE_DISPLAY_NAME,
          strategy: 'leastrecent',
          ringTimeoutSeconds: 15,
          agentOfferTimeoutSeconds: DEFAULT_AGENT_OFFER_TIMEOUT_SECONDS,
          wrapupSeconds: 30,
          maxWaitSeconds: 45,
          autopause: true,
          isActive: true,
        },
      });

      await this.syncDefaultRuleMembers(tenantId, queue.queueId);
    }

    return queue;
  }

  private async allocateQueueExten(
    tenantId: string,
    start: number,
    end: number,
    errorMessage: string,
  ) {
    const queues = await this.prisma.queues.findMany({
      where: { tenantId },
      select: { queueExten: true },
    });
    const used = new Set(queues.map((item) => item.queueExten));
    for (let candidate = start; candidate < end; candidate += 1) {
      const value = String(candidate);
      if (!used.has(value)) return value;
    }
    throw new ConflictException(errorMessage);
  }

  private async allocateQueueName(tenantId: string) {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const candidate = `queue-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const existing = await this.prisma.queues.findFirst({
        where: { tenantId, queueName: candidate },
        select: { queueId: true },
      });
      if (!existing) {
        return candidate;
      }
    }

    throw new ConflictException('호 분배룰 내부 식별자를 자동 생성할 수 없습니다');
  }

  private async syncDefaultRuleMembers(tenantId: string, queueId: string) {
    const activeAgents = await this.prisma.agents.findMany({
      where: { tenantId, isActive: true },
      select: { agentId: true },
      orderBy: [{ agentCode: 'asc' }],
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.queueAgentMembers.deleteMany({ where: { queueId } });

      if (activeAgents.length > 0) {
        await tx.queueAgentMembers.createMany({
          data: activeAgents.map((agent, index) => ({
            tenantId,
            queueId,
            agentId: agent.agentId,
            penalty: 0,
            memberOrder: index,
            isActive: true,
          })),
        });
      }
    });
  }

  private async assertMembersExist(
    tenantId: string,
    members: Array<{ agentId: string; penalty?: number; memberOrder?: number }>,
  ) {
    const uniqueAgentIds = [...new Set(members.map((item) => item.agentId))];
    if (uniqueAgentIds.length === 0) {
      return;
    }

    const agents = await this.prisma.agents.findMany({
      where: { tenantId, agentId: { in: uniqueAgentIds } },
      select: { agentId: true },
    });
    if (agents.length !== uniqueAgentIds.length) {
      throw new NotFoundException('일부 상담원을 찾을 수 없습니다');
    }
  }

  private normalizeQueueUnconditionalTarget(
    mode: DistributionMode,
    targetType?: string | null,
    targetValue?: string | null,
  ) {
    try {
      return normalizeUnconditionalTarget(mode, targetType, targetValue);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : '무조건 착신 대상이 올바르지 않습니다.');
    }
  }

  private async assertUnconditionalTargetExists(
    tenantId: string,
    target: { unconditionalTargetType: string | null; unconditionalTargetValue: string | null },
    currentQueueId?: string,
  ) {
    if (!target.unconditionalTargetType || !target.unconditionalTargetValue) {
      return;
    }

    if (target.unconditionalTargetType === 'EXTERNAL_NUMBER') {
      if (!/^\d{8,16}$/.test(target.unconditionalTargetValue)) {
        throw new BadRequestException('외부번호는 8~16자리 숫자로 지정하세요.');
      }
      return;
    }

    if (target.unconditionalTargetType === 'AGENT') {
      const agent = await this.prisma.agents.findFirst({
        where: { tenantId, agentId: target.unconditionalTargetValue, isActive: true },
        select: { agentId: true },
      });
      if (!agent) {
        throw new BadRequestException('무조건 착신 대상 상담원을 찾을 수 없습니다.');
      }
      return;
    }

    if (target.unconditionalTargetType === 'QUEUE') {
      if (target.unconditionalTargetValue === currentQueueId) {
        throw new BadRequestException('무조건 착신 대상 분배룰은 자기 자신으로 지정할 수 없습니다.');
      }
      const queue = await this.prisma.queues.findFirst({
        where: { tenantId, queueId: target.unconditionalTargetValue, isActive: true },
        select: { queueId: true },
      });
      if (!queue) {
        throw new BadRequestException('무조건 착신 대상 분배룰을 찾을 수 없습니다.');
      }
    }
  }

  private async normalizeQueueOverflowRules(
    tenantId: string,
    rules: QueueOverflowRuleDto[],
    currentQueueId?: string,
  ) {
    const normalizedRules = [];
    for (const [index, rule] of rules.entries()) {
      const targetType = rule.targetType;
      const targetValue = rule.targetValue?.trim();
      if (!targetValue) {
        throw new BadRequestException('오버플로우 대상 값을 입력하세요.');
      }

      let normalizedTargetValue = targetValue;
      if (targetType === 'AI_CENTER' || targetType === 'EXTERNAL_NUMBER') {
        if (!/^\d{8,16}$/.test(targetValue)) {
          throw new BadRequestException('AI센터/외부번호 오버플로우 대상은 8~16자리 숫자로 지정하세요.');
        }
      } else if (targetType === 'EXTENSION') {
        const agent = await this.prisma.agents.findFirst({
          where: { tenantId, extension: targetValue, isActive: true },
          select: { extension: true },
        });
        if (!agent) {
          throw new BadRequestException('오버플로우 대상 내선을 찾을 수 없습니다.');
        }
      } else if (targetType === 'QUEUE') {
        const queue = await this.prisma.queues.findFirst({
          where: {
            tenantId,
            isActive: true,
            OR: [{ queueId: targetValue }, { queueName: targetValue }],
          },
          select: { queueId: true, queueName: true },
        });
        if (!queue) {
          throw new BadRequestException('오버플로우 대상 분배룰을 찾을 수 없습니다.');
        }
        if (currentQueueId && queue.queueId === currentQueueId) {
          throw new BadRequestException('오버플로우 대상 분배룰은 자기 자신으로 지정할 수 없습니다.');
        }
        normalizedTargetValue = queue.queueName;
      } else {
        throw new BadRequestException('지원하지 않는 오버플로우 대상 유형입니다.');
      }

      normalizedRules.push({
        triggerMode: rule.triggerMode ?? 'AFTER_WAIT',
        waitSeconds: rule.waitSeconds ?? 25,
        targetType,
        targetValue: normalizedTargetValue,
        resultCode: rule.resultCode?.trim() || 'AI_OVERFLOW',
        priority: rule.priority ?? (index + 1) * 100,
        enabled: rule.enabled ?? true,
      });
    }

    return normalizedRules;
  }

  private async findQueueOverflowRules(tenantId: string, queueId: string) {
    return (this.prisma as any).queueOverflowRules.findMany({
      where: { tenantId, queueId },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
      select: {
        queueOverflowRuleId: true,
        triggerMode: true,
        waitSeconds: true,
        targetType: true,
        targetValue: true,
        resultCode: true,
        priority: true,
        enabled: true,
      },
    });
  }

  private async replaceMembers(
    tx: Prisma.TransactionClient,
    tenantId: string,
    queueId: string,
    members: Array<{ agentId: string; penalty?: number; memberOrder?: number }>,
  ) {
    await tx.queueAgentMembers.deleteMany({ where: { queueId } });

    if (members.length > 0) {
      await tx.queueAgentMembers.createMany({
        data: members.map((item, index) => ({
          tenantId,
          queueId,
          agentId: item.agentId,
          penalty: item.penalty ?? 0,
          memberOrder: item.memberOrder ?? index,
          isActive: true,
        })),
      });
    }
  }

  private async replaceOverflowRules(
    tx: Prisma.TransactionClient,
    tenantId: string,
    queueId: string,
    rules: Array<{
      triggerMode: string;
      waitSeconds: number;
      targetType: string;
      targetValue: string;
      resultCode: string;
      priority: number;
      enabled: boolean;
    }>,
  ) {
    await (tx as any).queueOverflowRules.deleteMany({ where: { queueId } });

    if (rules.length > 0) {
      await (tx as any).queueOverflowRules.createMany({
        data: rules.map((rule) => ({
          tenantId,
          queueId,
          triggerMode: rule.triggerMode,
          waitSeconds: rule.waitSeconds,
          targetType: rule.targetType,
          targetValue: rule.targetValue,
          resultCode: rule.resultCode,
          priority: rule.priority,
          enabled: rule.enabled,
        })),
      });
    }
  }

  private async getQueueRoutingUsageMap(tenantId: string, queueNames: string[]) {
    const normalizedNames = [...new Set(queueNames.filter(Boolean))];
    if (normalizedNames.length === 0) {
      return new Map<
        string,
        {
          directDidCount: number;
          forwardingRuleCount: number;
          ivrEntryCount: number;
          ivrMenuCount: number;
        }
      >();
    }

    const [directDidRefs, forwardingRefs, ivrEntries] = await Promise.all([
      this.prisma.asteriskDid.findMany({
        where: {
          tenantId,
          directQueue: { in: normalizedNames },
        },
        select: {
          directQueue: true,
        },
      }),
      this.prisma.asteriskForwardingRules.findMany({
        where: {
          tenantId,
          forwardType: 'QUEUE',
          targetValue: { in: normalizedNames },
        },
        select: {
          targetValue: true,
        },
      }),
      this.prisma.asteriskIvrEntry.findMany({
        where: {
          tenantId,
          queueName: { in: normalizedNames },
        },
        select: {
          queueName: true,
          menuId: true,
        },
      }),
    ]);

    const usageMap = new Map<
      string,
      {
        directDidCount: number;
        forwardingRuleCount: number;
        ivrEntryCount: number;
        ivrMenuCount: number;
      }
    >();

    for (const queueName of normalizedNames) {
      usageMap.set(queueName, {
        directDidCount: 0,
        forwardingRuleCount: 0,
        ivrEntryCount: 0,
        ivrMenuCount: 0,
      });
    }

    for (const directDidRef of directDidRefs) {
      if (!directDidRef.directQueue) continue;
      const entry = usageMap.get(directDidRef.directQueue);
      if (!entry) continue;
      entry.directDidCount += 1;
    }

    for (const forwardingRef of forwardingRefs) {
      const entry = usageMap.get(forwardingRef.targetValue);
      if (!entry) continue;
      entry.forwardingRuleCount += 1;
    }

    const ivrMenusByQueue = new Map<string, Set<string>>();
    for (const ivrEntry of ivrEntries) {
      const entry = usageMap.get(ivrEntry.queueName);
      if (!entry) continue;
      entry.ivrEntryCount += 1;

      let menuIds = ivrMenusByQueue.get(ivrEntry.queueName);
      if (!menuIds) {
        menuIds = new Set<string>();
        ivrMenusByQueue.set(ivrEntry.queueName, menuIds);
      }
      menuIds.add(ivrEntry.menuId);
    }

    for (const [queueName, menuIds] of ivrMenusByQueue.entries()) {
      const entry = usageMap.get(queueName);
      if (!entry) continue;
      entry.ivrMenuCount = menuIds.size;
    }

    return usageMap;
  }

  private buildQueueProtection(
    queueName: string,
    isDefaultRule: boolean,
    usageMap: Map<
      string,
      {
        directDidCount: number;
        forwardingRuleCount: number;
        ivrEntryCount: number;
        ivrMenuCount: number;
      }
    >,
  ) {
    const usage = usageMap.get(queueName) ?? {
      directDidCount: 0,
      forwardingRuleCount: 0,
      ivrEntryCount: 0,
      ivrMenuCount: 0,
    };
    const routingReferenceCount =
      usage.directDidCount + usage.forwardingRuleCount + usage.ivrEntryCount;

    if (isDefaultRule) {
      return {
        routingReferences: usage,
        routingReferenceCount,
        canDeactivate: false,
        deactivateBlockedReason: '기본 호 분배룰은 비활성화할 수 없습니다',
      };
    }

    if (routingReferenceCount === 0) {
      return {
        routingReferences: usage,
        routingReferenceCount,
        canDeactivate: true,
        deactivateBlockedReason: null,
      };
    }

    const parts: string[] = [];
    if (usage.directDidCount > 0) parts.push(`DID ${usage.directDidCount}건`);
    if (usage.forwardingRuleCount > 0) parts.push(`착신전환 ${usage.forwardingRuleCount}건`);
    if (usage.ivrEntryCount > 0) parts.push(`IVR 엔트리 ${usage.ivrEntryCount}건`);

    return {
      routingReferences: usage,
      routingReferenceCount,
      canDeactivate: false,
      deactivateBlockedReason: `${parts.join(', ')}에서 사용 중이라 비활성화할 수 없습니다`,
    };
  }
}
