import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { QueuesService } from '../queues/queues.service';

// 슈퍼바이저/admin 전용 실시간 대시보드.
// 큐 요약 + 활성 콜 수 + 오늘 집계 + 에이전트 상태 분포를 한 번에 반환.
@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queuesService: QueuesService,
  ) {}

  async getDashboard(tenantId: string) {
    const queuesSummary = await this.queuesService.getSummary(tenantId);

    const activeCalls = await this.prisma.callSessions.count({
      where: { tenantId, sessionStatus: { notIn: ['ENDED'] } },
    });

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [todayTotal, todayAnswered, todayAbandoned] = await Promise.all([
      this.prisma.callSessions.count({
        where: { tenantId, startedAt: { gte: startOfDay } },
      }),
      this.prisma.callSessions.count({
        where: {
          tenantId,
          startedAt: { gte: startOfDay },
          answeredAt: { not: null },
        },
      }),
      this.prisma.callSessions.count({
        where: {
          tenantId,
          startedAt: { gte: startOfDay },
          abandonFlag: true,
        },
      }),
    ]);

    // 에이전트 상태 분포 (현재 endedAt=null 행 기준)
    const openStatuses = await this.prisma.agentStatusHistory.findMany({
      where: { tenantId, endedAt: null },
      select: { statusCode: true },
    });
    const statusDistribution = openStatuses.reduce<Record<string, number>>(
      (acc, row) => {
        acc[row.statusCode] = (acc[row.statusCode] ?? 0) + 1;
        return acc;
      },
      {},
    );

    return {
      success: true,
      data: {
        queues: queuesSummary.data?.queues ?? [],
        activeCalls,
        today: {
          total: todayTotal,
          answered: todayAnswered,
          abandoned: todayAbandoned,
        },
        agentStatusDistribution: statusDistribution,
        generatedAt: new Date().toISOString(),
      },
      error: null,
    };
  }
}
