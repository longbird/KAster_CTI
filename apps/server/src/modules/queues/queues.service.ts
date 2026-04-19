import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DEFAULT_DISTRIBUTION_RULE_DISPLAY_NAME,
  DEFAULT_DISTRIBUTION_RULE_QUEUE_NAME,
} from '../../common/call-routing.constants';
import { PrismaService } from '../../common/prisma.service';
import { AsteriskReloadService } from '../asterisk-config/asterisk-reload.service';
import { CreateQueueDto } from './dto/create-queue.dto';

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
          longestWaitSeconds: longestWait?.queuedAt
            ? Math.max(0, Math.floor((Date.now() - longestWait.queuedAt.getTime()) / 1000))
            : 0,
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
        strategy: true,
        maxWaitSeconds: true,
        ringTimeoutSeconds: true,
        wrapupSeconds: true,
        autopause: true,
        isActive: true,
      },
      orderBy: { queueName: 'asc' },
    });
    return {
      success: true,
      data: rows.map((row) => ({
        ...row,
        isDefaultRule: row.queueId === defaultQueue.queueId,
      })),
      error: null,
    };
  }

  async create(tenantId: string, dto: CreateQueueDto) {
    const existing = await this.prisma.queues.findFirst({
      where: {
        tenantId,
        OR: [{ queueName: dto.queueName }, { queueExten: dto.queueExten }],
      },
      select: { queueName: true, queueExten: true },
    });

    if (existing) {
      if (existing.queueName === dto.queueName) {
        throw new ConflictException(`큐명 '${dto.queueName}' 이미 사용 중`);
      }
      if (existing.queueExten === dto.queueExten) {
        throw new ConflictException(`내선번호 '${dto.queueExten}' 이미 사용 중`);
      }
    }

    const queue = await this.prisma.queues.create({
      data: {
        tenantId,
        queueName: dto.queueName,
        queueExten: dto.queueExten,
        queueDisplayName: dto.queueDisplayName,
        strategy: dto.strategy ?? 'leastrecent',
        ringTimeoutSeconds: dto.ringTimeoutSeconds ?? 15,
        wrapupSeconds: dto.wrapupSeconds ?? 30,
        maxWaitSeconds: dto.maxWaitSeconds ?? 45,
        autopause: dto.autopause ?? true,
      },
      select: {
        queueId: true,
        queueName: true,
        queueExten: true,
        queueDisplayName: true,
        strategy: true,
        isActive: true,
      },
    });

    this.reload.scheduleReload(tenantId);
    return { success: true, data: queue, error: null };
  }

  async update(
    tenantId: string,
    queueId: string,
    dto: {
      queueDisplayName?: string;
      strategy?: string;
      maxWaitSeconds?: number;
      ringTimeoutSeconds?: number;
      wrapupSeconds?: number;
      autopause?: boolean;
    },
  ) {
    const queue = await this.prisma.queues.findFirst({ where: { queueId, tenantId } });
    if (!queue) throw new NotFoundException('Queue not found');

    const updated = await this.prisma.queues.update({
      where: { queueId },
      data: {
        ...(dto.queueDisplayName !== undefined && { queueDisplayName: dto.queueDisplayName }),
        ...(dto.strategy !== undefined && { strategy: dto.strategy }),
        ...(dto.maxWaitSeconds !== undefined && { maxWaitSeconds: dto.maxWaitSeconds }),
        ...(dto.ringTimeoutSeconds !== undefined && { ringTimeoutSeconds: dto.ringTimeoutSeconds }),
        ...(dto.wrapupSeconds !== undefined && { wrapupSeconds: dto.wrapupSeconds }),
        ...(dto.autopause !== undefined && { autopause: dto.autopause }),
        updatedAt: new Date(),
      },
      select: {
        queueId: true,
        queueName: true,
        queueExten: true,
        queueDisplayName: true,
        strategy: true,
        maxWaitSeconds: true,
        ringTimeoutSeconds: true,
        wrapupSeconds: true,
        autopause: true,
        isActive: true,
      },
    });

    this.reload.scheduleReload(tenantId);
    return { success: true, data: updated, error: null };
  }

  async deactivate(tenantId: string, queueId: string) {
    const queue = await this.prisma.queues.findFirst({ where: { queueId, tenantId } });
    if (!queue) throw new NotFoundException('Queue not found');

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
    if (uniqueAgentIds.length > 0) {
      const agents = await this.prisma.agents.findMany({
        where: { tenantId, agentId: { in: uniqueAgentIds } },
        select: { agentId: true },
      });
      if (agents.length !== uniqueAgentIds.length) {
        throw new NotFoundException('일부 상담원을 찾을 수 없습니다');
      }
    }

    await this.prisma.$transaction(async (tx) => {
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
          queueExten: await this.allocateDefaultQueueExten(tenantId),
          queueDisplayName: DEFAULT_DISTRIBUTION_RULE_DISPLAY_NAME,
          strategy: 'leastrecent',
          ringTimeoutSeconds: 15,
          wrapupSeconds: 30,
          maxWaitSeconds: 45,
          autopause: true,
          isActive: true,
        },
      });
    }

    await this.syncDefaultRuleMembers(tenantId, queue.queueId);
    return queue;
  }

  private async allocateDefaultQueueExten(tenantId: string) {
    const queues = await this.prisma.queues.findMany({
      where: { tenantId },
      select: { queueExten: true },
    });
    const used = new Set(queues.map((item) => item.queueExten));
    for (let candidate = 9999; candidate < 11000; candidate += 1) {
      const value = String(candidate);
      if (!used.has(value)) return value;
    }
    throw new ConflictException('기본 호 분배룰에 사용할 내선을 자동 배정할 수 없습니다');
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
}
