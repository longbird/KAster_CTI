import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { RedisService } from '../redis/redis.service';
import { AmiConnectionService } from '../ami/ami-connection.service';
import { AmiLeaderElectionService } from '../redis/ami-leader-election.service';
import { CallsHealthService } from '../calls/calls-health.service';
import { AgentMonitoringService } from '../agents/agent-monitoring.service';
import { QueueMonitoringService } from '../queues/queue-monitoring.service';
import { HealthResponseDto } from './dto/health-response.dto';
import { ResilienceHealthService } from '../resilience/resilience-health.service';
import { OperatingModeService } from '../resilience/operating-mode.service';

@Injectable()
export class HealthSummaryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly ami: AmiConnectionService,
    private readonly leader: AmiLeaderElectionService,
    private readonly callsHealth: CallsHealthService,
    private readonly agentMonitoring: AgentMonitoringService,
    private readonly queueMonitoring: QueueMonitoringService,
    private readonly resilienceHealth: ResilienceHealthService,
    private readonly operatingMode: OperatingModeService,
  ) {}

  async getHealth(tenantId?: string): Promise<HealthResponseDto> {
    const timestamp = new Date().toISOString();
    const instanceId = this.leader.getNodeId();

    let db: 'up' | 'down' = 'up';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      // 헬스 체크는 DB 가용성의 독립적인 관측점이다. AMI 이벤트가 잠잠한 시간대에도
      // 운영 모드가 실제 상태를 따라가려면 이 신호가 필요하다.
      this.operatingMode.recordDbRecovered();
    } catch {
      db = 'down';
      this.operatingMode.recordDbFailure();
    }

    let redis: 'up' | 'down' | 'degraded' = 'up';
    try {
      const pong = await this.redis.ping();
      redis = pong === 'PONG' ? 'up' : 'degraded';
    } catch {
      redis = 'down';
    }

    const ami: 'connected' | 'disconnected' = this.ami.isConnected()
      ? 'connected'
      : 'disconnected';

    const [call, agent, queue, resilienceSummary] = await Promise.all([
      this.callsHealth.getSummary(tenantId),
      this.agentMonitoring.getSummary(tenantId),
      this.queueMonitoring.getSummary(tenantId),
      this.resilienceHealth.getSummary(tenantId),
    ]);

    // 운영 모드가 NORMAL 이 아니면 ok 를 내지 않는다. RECOVERING 중에 ok 를 내면
    // 재처리가 안 끝났는데 모니터링이 복구 완료로 오독한다.
    const status: 'ok' | 'degraded' | 'down' =
      db === 'down'
        ? 'down'
        : redis === 'down'
          || ami === 'disconnected'
          || call.stuck > 0
          || resilienceSummary.operatingMode !== 'NORMAL'
        ? 'degraded'
        : 'ok';

    return {
      status,
      timestamp,
      instanceId,
      leader: this.leader.isLeader(),
      checks: { db, redis, ami },
      call,
      agent,
      queue,
      operatingMode: resilienceSummary.operatingMode,
      dataFreshness: resilienceSummary.dataFreshness,
      restrictions: resilienceSummary.restrictions,
      resilience: resilienceSummary.resilience,
    };
  }
}
