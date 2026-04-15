import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

export type CallHealthSummary = {
  active: number;
  queued: number;
  ringing: number;
  talking: number;
  hold: number;
  transferring: number;
  stuck: number;
  longestWaitingSeconds: number;
};

@Injectable()
export class CallsHealthService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(tenantId?: string): Promise<CallHealthSummary> {
    const now = new Date();
    // 10분 이상 상태 변화 없는 진행 중 콜 = stuck
    const stuckThreshold = new Date(now.getTime() - 10 * 60 * 1000);

    const whereBase = tenantId ? { tenantId } : {};
    const activeStatuses = [
      'NEW', 'IVR', 'QUEUED', 'RINGING_AGENT',
      'TALKING', 'HOLD', 'TRANSFERRING', 'AFTER_CALL_WORK',
    ];

    const [active, queued, ringing, talking, hold, transferring, stuck, longestQueued] =
      await Promise.all([
        this.prisma.callSessions.count({
          where: { ...whereBase, endedAt: null, sessionStatus: { in: activeStatuses } },
        }),
        this.prisma.callSessions.count({
          where: { ...whereBase, endedAt: null, sessionStatus: 'QUEUED' },
        }),
        this.prisma.callSessions.count({
          where: { ...whereBase, endedAt: null, sessionStatus: 'RINGING_AGENT' },
        }),
        this.prisma.callSessions.count({
          where: { ...whereBase, endedAt: null, sessionStatus: 'TALKING' },
        }),
        this.prisma.callSessions.count({
          where: { ...whereBase, endedAt: null, sessionStatus: 'HOLD' },
        }),
        this.prisma.callSessions.count({
          where: { ...whereBase, endedAt: null, sessionStatus: 'TRANSFERRING' },
        }),
        this.prisma.callSessions.count({
          where: {
            ...whereBase,
            endedAt: null,
            updatedAt: { lte: stuckThreshold },
            sessionStatus: {
              in: ['QUEUED', 'RINGING_AGENT', 'TALKING', 'HOLD', 'TRANSFERRING'],
            },
          },
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

    const longestWaitingSeconds = longestQueued?.queuedAt
      ? Math.max(0, Math.floor((now.getTime() - longestQueued.queuedAt.getTime()) / 1000))
      : 0;

    return { active, queued, ringing, talking, hold, transferring, stuck, longestWaitingSeconds };
  }
}
