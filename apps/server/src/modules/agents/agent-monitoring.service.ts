import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

export type AgentHealthSummary = {
  available: number;
  talking: number;
  ringing: number;
  paused: number;
  loggedIn: number;
};

// 현재 상담원 상태 = agentStatusHistory 에서 endedAt IS NULL 인 레코드
@Injectable()
export class AgentMonitoringService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(tenantId?: string): Promise<AgentHealthSummary> {
    const whereBase = tenantId ? { tenantId } : {};

    const pausedStatuses = [
      'BREAK', 'MEAL', 'TRAINING',
      'SYSTEM_PAUSED', 'MANUAL_PAUSED', 'AFTER_CALL_WORK',
    ];

    const [available, talking, ringing, paused, loggedIn] = await Promise.all([
      this.prisma.agentStatusHistory.count({
        where: { ...whereBase, endedAt: null, statusCode: 'AVAILABLE' },
      }),
      this.prisma.agentStatusHistory.count({
        where: { ...whereBase, endedAt: null, statusCode: 'TALKING' },
      }),
      this.prisma.agentStatusHistory.count({
        where: { ...whereBase, endedAt: null, statusCode: 'RINGING' },
      }),
      this.prisma.agentStatusHistory.count({
        where: { ...whereBase, endedAt: null, statusCode: { in: pausedStatuses } },
      }),
      this.prisma.agentStatusHistory.count({
        where: {
          ...whereBase,
          endedAt: null,
          statusCode: { not: 'LOGGED_OUT' },
        },
      }),
    ]);

    return { available, talking, ringing, paused, loggedIn };
  }
}
