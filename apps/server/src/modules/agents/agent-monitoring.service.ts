import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { QUEUE_PAUSING_STATUS_CODES } from '../calls/agent-availability.util';

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

    // 목록을 여기 따로 적어 두면 화면의 "일시정지" 와 실제 큐 pause 가 갈린다.
    // 판정은 agent-availability.util 한 곳에서만 나온다.
    const pausedStatuses = [...QUEUE_PAUSING_STATUS_CODES];

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
