import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

// conv 29·35 의 queue summary 집계 모델.
// 현재 활성 상태(스냅샷)는 callSessions.sessionStatus 로,
// 과거 N분간의 answered/abandoned 카운트는 queueEvents 로 조합한다.
@Injectable()
export class QueuesService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(tenantId: string) {
    const queues = await this.prisma.queues.findMany({
      where: { tenantId, isActive: true },
      select: {
        queueId: true,
        queueName: true,
        queueDisplayName: true,
        queueExten: true,
      },
    });

    const rows = await Promise.all(
      queues.map(async (q) => {
        // 스냅샷: 현재 이 큐에 붙어있는 콜의 상태 분포
        const snapshot = await this.prisma.callSessions.groupBy({
          by: ['sessionStatus'],
          where: {
            tenantId,
            queueName: q.queueName,
            sessionStatus: { notIn: ['ENDED'] },
          },
          _count: { callId: true },
        });

        // 최장 대기 시간: QUEUED 상태의 가장 오래된 queuedAt
        const longestWait = await this.prisma.callSessions.findFirst({
          where: { tenantId, queueName: q.queueName, sessionStatus: 'QUEUED' },
          orderBy: { queuedAt: 'asc' },
          select: { queuedAt: true },
        });

        // 최근 30분 집계: 응답/포기 이벤트
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

        const waiting = snapshotMap['QUEUED'] ?? 0;
        const ringing = snapshotMap['RINGING_AGENT'] ?? 0;
        const talking = snapshotMap['TALKING'] ?? 0;

        // 이 큐에 소속된 상담원 현재 available/paused 상태
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
          else if (s.statusCode === 'BREAK' || s.statusCode === 'MEAL' || s.statusCode === 'MANUAL_PAUSED') {
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
}
