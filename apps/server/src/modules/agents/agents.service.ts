import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class AgentsService {
  constructor(private readonly prisma: PrismaService) {}

  // 슈퍼바이저/admin 화면용 목록. 현재 상태도 동봉.
  async listForTenant(tenantId: string) {
    const agents = await this.prisma.agents.findMany({
      where: { tenantId, isActive: true },
      orderBy: { extension: 'asc' },
      select: {
        agentId: true,
        loginId: true,
        agentCode: true,
        agentName: true,
        extension: true,
        role: true,
        employmentStatus: true,
        defaultQueueId: true,
        lastLoginAt: true,
      },
    });

    const withStatus = await Promise.all(
      agents.map(async (a) => {
        const current = await this.prisma.agentStatusHistory.findFirst({
          where: { agentId: a.agentId, endedAt: null },
          orderBy: { startedAt: 'desc' },
          select: { statusCode: true, reasonCode: true, startedAt: true },
        });
        return { ...a, currentStatus: current };
      }),
    );

    return { success: true, data: withStatus, error: null };
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

    // 오늘 통계: 자정부터 현재까지의 응답 수, 평균 통화시간
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
    const totalTalk = todaysCalls.reduce((sum, c) => sum + (c.talkSeconds ?? 0), 0);
    const avgTalk = answered > 0 ? Math.round(totalTalk / answered) : 0;

    return {
      success: true,
      data: {
        agent,
        currentStatus,
        todayStats: { answered, totalTalkSeconds: totalTalk, avgTalkSeconds: avgTalk },
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
}
