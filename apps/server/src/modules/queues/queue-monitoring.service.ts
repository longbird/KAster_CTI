import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

export type QueueHealthSummary = {
  waiting: number;
  ringing: number;
  talking: number;
  availableAgents: number;
  longestWaitSeconds: number;
};

// health 용 전체 큐 집계 스냅샷.
// 큐별 상세 지표는 /queues/summary 에서 QueuesService 가 담당.
@Injectable()
export class QueueMonitoringService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(tenantId?: string): Promise<QueueHealthSummary> {
    const now = new Date();
    const whereBase = tenantId ? { tenantId } : {};

    const [waiting, ringing, talking, availableAgents, longestQueued] =
      await Promise.all([
        this.prisma.callSessions.count({
          where: { ...whereBase, endedAt: null, sessionStatus: 'QUEUED' },
        }),
        this.prisma.callSessions.count({
          where: { ...whereBase, endedAt: null, sessionStatus: 'RINGING_AGENT' },
        }),
        // 큐를 통해 연결된 통화만 집계 (queueId 있음)
        this.prisma.callSessions.count({
          where: {
            ...whereBase,
            endedAt: null,
            sessionStatus: 'TALKING',
            queueId: { not: null },
          },
        }),
        this.prisma.agentStatusHistory.count({
          where: { ...whereBase, endedAt: null, statusCode: 'AVAILABLE' },
        }),
        this.prisma.callSessions.findFirst({
          where: {
            ...whereBase,
            endedAt: null,
            sessionStatus: 'QUEUED',
            queuedAt: { not: null },
          },
          orderBy: { queuedAt: 'asc' },
          select: { queuedAt: true },
        }),
      ]);

    const longestWaitSeconds = longestQueued?.queuedAt
      ? Math.max(0, Math.floor((now.getTime() - longestQueued.queuedAt.getTime()) / 1000))
      : 0;

    return { waiting, ringing, talking, availableAgents, longestWaitSeconds };
  }
}
