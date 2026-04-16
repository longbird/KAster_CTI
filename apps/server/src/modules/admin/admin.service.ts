import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { QueuesService } from '../queues/queues.service';

// 슈퍼바이저/admin 전용 실시간 대시보드.
// 큐 요약 + 활성 콜 수 + 오늘 집계 + 에이전트 상태 분포 + 시간대별 트래픽 + 팀 현황 + 알람
@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queuesService: QueuesService,
  ) {}

  async getDashboard(tenantId: string) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [queuesSummary, activeCalls, todayCounts, openStatuses, hourlyRaw, queueAgents] =
      await Promise.all([
        this.queuesService.getSummary(tenantId),

        this.prisma.callSessions.count({
          where: { tenantId, sessionStatus: { notIn: ['ENDED'] } },
        }),

        Promise.all([
          this.prisma.callSessions.count({
            where: { tenantId, startedAt: { gte: startOfDay } },
          }),
          this.prisma.callSessions.count({
            where: { tenantId, startedAt: { gte: startOfDay }, answeredAt: { not: null } },
          }),
          this.prisma.callSessions.count({
            where: { tenantId, startedAt: { gte: startOfDay }, abandonFlag: true },
          }),
        ]),

        // 현재 오픈된 상담원 상태 (에이전트 상태 분포)
        this.prisma.agentStatusHistory.findMany({
          where: { tenantId, endedAt: null },
          select: { agentId: true, statusCode: true },
        }),

        // 오늘 시간대별 트래픽 (raw SQL — Prisma groupBy 집계 한계 우회)
        this.prisma.$queryRaw<
          Array<{ hour: number; inbound: bigint; answered: bigint; abandoned: bigint }>
        >`
          SELECT
            EXTRACT(HOUR FROM "startedAt")::int AS hour,
            COUNT(*)                            AS inbound,
            COUNT(*) FILTER (WHERE "answeredAt" IS NOT NULL) AS answered,
            COUNT(*) FILTER (WHERE "abandonFlag" = true)     AS abandoned
          FROM "callSessions"
          WHERE "tenantId" = ${tenantId}::uuid
            AND "startedAt" >= ${startOfDay}
          GROUP BY hour
          ORDER BY hour
        `,

        // 큐별 에이전트 현황 (팀 통계 도출용)
        this.prisma.queueAgentMembers.findMany({
          where: { tenantId },
          select: {
            queueId: true,
            queue: { select: { queueDisplayName: true, queueName: true } },
          },
        }),
      ]);

    const [todayTotal, todayAnswered, todayAbandoned] = todayCounts;

    // ── 에이전트 상태 분포 ──────────────────────────────────────────────────
    const statusDistribution = openStatuses.reduce<Record<string, number>>(
      (acc, row) => {
        acc[row.statusCode] = (acc[row.statusCode] ?? 0) + 1;
        return acc;
      },
      {},
    );

    // 현재 열린 상태를 agentId 기준으로 빠르게 조회 (팀 통계에 재활용)
    const agentStatusMap = new Map<string, string>();
    for (const s of openStatuses) agentStatusMap.set(s.agentId, s.statusCode);

    // ── 팀 통계 (큐 = 팀으로 간주) ─────────────────────────────────────────
    // 큐별 멤버 agentId 를 구하려면 agentId 도 select 해야 함.
    // 쿼리를 분리해 agentId 포함 재조회.
    const queueMembersWithAgent = await this.prisma.queueAgentMembers.findMany({
      where: { tenantId },
      select: {
        queueId: true,
        agentId: true,
        queue: { select: { queueDisplayName: true, queueName: true } },
      },
    });

    type TeamRow = {
      teamName: string;
      available: number;
      ringing: number;
      talking: number;
      acw: number;
      break: number;
    };
    const teamMap = new Map<string, TeamRow>();
    for (const m of queueMembersWithAgent) {
      if (!teamMap.has(m.queueId)) {
        teamMap.set(m.queueId, {
          teamName: m.queue.queueDisplayName ?? m.queue.queueName,
          available: 0,
          ringing: 0,
          talking: 0,
          acw: 0,
          break: 0,
        });
      }
      const team = teamMap.get(m.queueId)!;
      const status = agentStatusMap.get(m.agentId) ?? '';
      if (status === 'AVAILABLE') team.available++;
      else if (status === 'RINGING_AGENT') team.ringing++;
      else if (status === 'TALKING') team.talking++;
      else if (status === 'AFTER_CALL_WORK') team.acw++;
      else if (status === 'BREAK') team.break++;
    }
    const teams = [...teamMap.values()];

    // ── 시간대별 트래픽 ────────────────────────────────────────────────────
    const traffic = Array.from({ length: 24 }, (_, h) => {
      const row = hourlyRaw.find((r) => r.hour === h);
      return {
        hour: `${String(h).padStart(2, '0')}시`,
        inbound: row ? Number(row.inbound) : 0,
        answered: row ? Number(row.answered) : 0,
        abandoned: row ? Number(row.abandoned) : 0,
      };
    // 현재 시간대까지만 포함 (이후 시간대는 0이므로 제거)
    }).filter((_, h) => h <= new Date().getHours());

    // ── 알람 (규칙 기반) ───────────────────────────────────────────────────
    type Alert = { id: string; level: 'info' | 'warning' | 'error'; message: string; time: string };
    const alerts: Alert[] = [];
    const queues = queuesSummary.data?.queues ?? [];
    const SLA_SEC = 60;
    const SLA_ABANDON_PCT = 20;

    for (const q of queues) {
      const displayName = q.queueDisplayName ?? q.queueName;
      const total = (q.recentAnswered ?? 0) + (q.recentAbandoned ?? 0);
      const abandonPct = total > 0 ? Math.round(((q.recentAbandoned ?? 0) / total) * 100) : 0;

      if (q.available === 0 && (q.waiting > 0 || q.ringing > 0)) {
        alerts.push({
          id: `no-agent-${q.queueId}`,
          level: 'error',
          message: `[${displayName}] 가용 상담원이 없습니다 (대기 ${q.waiting}건)`,
          time: '방금 전',
        });
      } else if (q.longestWaitSeconds > SLA_SEC) {
        alerts.push({
          id: `sla-${q.queueId}`,
          level: 'warning',
          message: `[${displayName}] 최장 대기시간 ${q.longestWaitSeconds}초가 SLA(${SLA_SEC}초)를 초과했습니다`,
          time: '방금 전',
        });
      }

      if (abandonPct > SLA_ABANDON_PCT) {
        alerts.push({
          id: `abandon-${q.queueId}`,
          level: 'warning',
          message: `[${displayName}] 포기율 ${abandonPct}%가 기준(${SLA_ABANDON_PCT}%)을 초과했습니다`,
          time: '방금 전',
        });
      }
    }

    return {
      success: true,
      data: {
        queues,
        activeCalls,
        today: {
          total: todayTotal,
          answered: todayAnswered,
          abandoned: todayAbandoned,
        },
        agentStatusDistribution: statusDistribution,
        teams,
        traffic,
        alerts,
        generatedAt: new Date().toISOString(),
      },
      error: null,
    };
  }
}
