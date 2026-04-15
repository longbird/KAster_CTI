import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { RedisService } from '../redis/redis.service';
import { AmiConnectionService } from '../ami/ami-connection.service';
import { AmiLeaderElectionService } from '../redis/ami-leader-election.service';
import { CallsHealthService } from '../calls/calls-health.service';
import { AgentMonitoringService } from '../agents/agent-monitoring.service';
import { QueueMonitoringService } from '../queues/queue-monitoring.service';
import { HealthResponseDto } from './dto/health-response.dto';

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
  ) {}

  async getHealth(tenantId?: string): Promise<HealthResponseDto> {
    const timestamp = new Date().toISOString();
    const instanceId = this.leader.getNodeId();

    let db: 'up' | 'down' = 'up';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      db = 'down';
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

    const [call, agent, queue] = await Promise.all([
      this.callsHealth.getSummary(tenantId),
      this.agentMonitoring.getSummary(tenantId),
      this.queueMonitoring.getSummary(tenantId),
    ]);

    const status: 'ok' | 'degraded' | 'down' =
      db === 'down'
        ? 'down'
        : redis === 'down' || ami === 'disconnected' || call.stuck > 0
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
    };
  }
}
