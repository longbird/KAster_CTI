import { Inject, Injectable } from '@nestjs/common';
import { Counter, Gauge, Histogram, Registry } from 'prom-client';
import { HealthSummaryService } from '../health/health-summary.service';
import { METRICS_REGISTRY } from './metrics.registry';

type InfraStatus = 'up' | 'down' | 'degraded' | 'connected' | 'disconnected';

@Injectable()
export class MetricsService {
  private readonly appHealthStatus: Gauge<string>;
  private readonly infraStatus: Gauge<string>;

  private readonly callActive: Gauge<string>;
  private readonly callQueued: Gauge<string>;
  private readonly callRinging: Gauge<string>;
  private readonly callTalking: Gauge<string>;
  private readonly callHold: Gauge<string>;
  private readonly callTransferring: Gauge<string>;
  private readonly callStuck: Gauge<string>;
  private readonly callLongestWait: Gauge<string>;

  private readonly agentAvailable: Gauge<string>;
  private readonly agentTalking: Gauge<string>;
  private readonly agentRinging: Gauge<string>;
  private readonly agentPaused: Gauge<string>;
  private readonly agentLoggedIn: Gauge<string>;

  private readonly queueWaiting: Gauge<string>;
  private readonly queueRinging: Gauge<string>;
  private readonly queueTalking: Gauge<string>;
  private readonly queueAvailableAgents: Gauge<string>;
  private readonly queueLongestWait: Gauge<string>;

  private readonly operatingModeGauge: Gauge<string>;
  private readonly configSnapshotAge: Gauge<string>;
  private readonly configVersionMismatch: Gauge<string>;
  private readonly offlineEventQueueDepth: Gauge<string>;
  private readonly offlineCommandQueueDepth: Gauge<string>;
  private readonly dbReplicationLag: Gauge<string>;
  private readonly walArchiveAge: Gauge<string>;
  private readonly backupLastSuccess: Gauge<string>;

  private readonly refreshDuration: Histogram<string>;
  private readonly refreshFailures: Counter<string>;

  constructor(
    @Inject(METRICS_REGISTRY) private readonly registry: Registry,
    private readonly healthSummary: HealthSummaryService,
  ) {
    this.appHealthStatus = new Gauge({
      name: 'cti_app_health_status',
      help: 'Application health. ok=2, degraded=1, down=0',
      registers: [registry],
      labelNames: ['instance_id'],
    });
    this.infraStatus = new Gauge({
      name: 'cti_infra_status',
      help: 'Infra component status. up/connected=1, degraded=0.5, down/disconnected=0',
      registers: [registry],
      labelNames: ['component', 'instance_id'],
    });

    this.callActive = new Gauge({ name: 'cti_calls_active_total', help: 'Active call sessions', registers: [registry], labelNames: ['instance_id'] });
    this.callQueued = new Gauge({ name: 'cti_calls_queued_total', help: 'Queued call sessions', registers: [registry], labelNames: ['instance_id'] });
    this.callRinging = new Gauge({ name: 'cti_calls_ringing_total', help: 'Ringing call sessions', registers: [registry], labelNames: ['instance_id'] });
    this.callTalking = new Gauge({ name: 'cti_calls_talking_total', help: 'Talking call sessions', registers: [registry], labelNames: ['instance_id'] });
    this.callHold = new Gauge({ name: 'cti_calls_hold_total', help: 'Hold call sessions', registers: [registry], labelNames: ['instance_id'] });
    this.callTransferring = new Gauge({ name: 'cti_calls_transferring_total', help: 'Transferring call sessions', registers: [registry], labelNames: ['instance_id'] });
    this.callStuck = new Gauge({ name: 'cti_calls_stuck_total', help: 'Suspected stuck call sessions (10m+ no update)', registers: [registry], labelNames: ['instance_id'] });
    this.callLongestWait = new Gauge({ name: 'cti_calls_longest_wait_seconds', help: 'Longest queued call wait in seconds', registers: [registry], labelNames: ['instance_id'] });

    this.agentAvailable = new Gauge({ name: 'cti_agents_available_total', help: 'Agents in AVAILABLE state', registers: [registry], labelNames: ['instance_id'] });
    this.agentTalking = new Gauge({ name: 'cti_agents_talking_total', help: 'Agents in TALKING state', registers: [registry], labelNames: ['instance_id'] });
    this.agentRinging = new Gauge({ name: 'cti_agents_ringing_total', help: 'Agents in RINGING state', registers: [registry], labelNames: ['instance_id'] });
    this.agentPaused = new Gauge({ name: 'cti_agents_paused_total', help: 'Agents in paused states', registers: [registry], labelNames: ['instance_id'] });
    this.agentLoggedIn = new Gauge({ name: 'cti_agents_logged_in_total', help: 'Agents not in LOGGED_OUT state', registers: [registry], labelNames: ['instance_id'] });

    this.queueWaiting = new Gauge({ name: 'cti_queue_waiting_total', help: 'Queued customers waiting', registers: [registry], labelNames: ['instance_id'] });
    this.queueRinging = new Gauge({ name: 'cti_queue_ringing_total', help: 'Queue calls ringing agents', registers: [registry], labelNames: ['instance_id'] });
    this.queueTalking = new Gauge({ name: 'cti_queue_talking_total', help: 'Queue calls talking', registers: [registry], labelNames: ['instance_id'] });
    this.queueAvailableAgents = new Gauge({ name: 'cti_queue_available_agents_total', help: 'Available agents for queue', registers: [registry], labelNames: ['instance_id'] });
    this.queueLongestWait = new Gauge({ name: 'cti_queue_longest_wait_seconds', help: 'Longest queue wait in seconds', registers: [registry], labelNames: ['instance_id'] });

    // 문서의 kcti_* 명칭은 이 레포의 cti_ prefix 정책에 맞춰 cti_* 로 노출한다.
    this.operatingModeGauge = new Gauge({
      name: 'cti_operating_mode',
      help: 'Operating mode. NORMAL=0, DB_FAILOVER=1, RECOVERING=2, DEGRADED=3',
      registers: [registry],
      labelNames: ['instance_id'],
    });
    this.configSnapshotAge = new Gauge({
      name: 'cti_config_snapshot_age_seconds',
      help: 'Age of the last known good config snapshot',
      registers: [registry],
      labelNames: ['instance_id'],
    });
    this.configVersionMismatch = new Gauge({
      name: 'cti_config_version_mismatch',
      help: 'Nodes whose applied config version differs from desired',
      registers: [registry],
      labelNames: ['instance_id'],
    });
    this.offlineEventQueueDepth = new Gauge({
      name: 'cti_offline_event_queue_depth',
      help: 'Unprocessed AMI events held in the durable spool',
      registers: [registry],
      labelNames: ['instance_id'],
    });
    this.offlineCommandQueueDepth = new Gauge({
      name: 'cti_offline_command_queue_depth',
      help: 'Unprocessed offline commands. -1 = not implemented',
      registers: [registry],
      labelNames: ['instance_id'],
    });
    this.dbReplicationLag = new Gauge({
      name: 'cti_db_replication_lag_seconds',
      help: 'Standby replication lag. -1 when not a standby or unknown',
      registers: [registry],
      labelNames: ['instance_id'],
    });
    this.walArchiveAge = new Gauge({
      name: 'cti_wal_archive_age_seconds',
      help: 'Seconds since the last successful WAL archive. -1 when unknown',
      registers: [registry],
      labelNames: ['instance_id'],
    });
    this.backupLastSuccess = new Gauge({
      name: 'cti_backup_last_success_timestamp',
      help: 'Unix timestamp of the last successful backup. -1 when unknown',
      registers: [registry],
      labelNames: ['instance_id'],
    });

    this.refreshDuration = new Histogram({
      name: 'cti_health_refresh_duration_seconds',
      help: 'Health summary calculation duration',
      registers: [registry],
      labelNames: ['instance_id'],
      buckets: [0.01, 0.03, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
    });
    this.refreshFailures = new Counter({
      name: 'cti_health_refresh_failures_total',
      help: 'Health refresh failures',
      registers: [registry],
      labelNames: ['instance_id'],
    });
  }

  private mapStatus(status: 'ok' | 'degraded' | 'down'): number {
    if (status === 'ok') return 2;
    if (status === 'degraded') return 1;
    return 0;
  }

  private mapInfra(status: InfraStatus): number {
    if (status === 'up' || status === 'connected') return 1;
    if (status === 'degraded') return 0.5;
    return 0;
  }

  async refresh(tenantId?: string): Promise<void> {
    const endTimer = this.refreshDuration.startTimer();
    let instanceId = process.env.INSTANCE_ID ?? `pid-${process.pid}`;

    try {
      const h = await this.healthSummary.getHealth(tenantId);
      instanceId = h.instanceId;

      this.appHealthStatus.labels(instanceId).set(this.mapStatus(h.status));
      this.infraStatus.labels('db', instanceId).set(this.mapInfra(h.checks.db));
      this.infraStatus.labels('redis', instanceId).set(this.mapInfra(h.checks.redis));
      this.infraStatus.labels('ami', instanceId).set(this.mapInfra(h.checks.ami));

      this.operatingModeGauge.labels(instanceId).set(mapOperatingMode(h.operatingMode));
      this.configSnapshotAge.labels(instanceId).set(orMinusOne(h.resilience.lkgAgeSeconds));
      this.configVersionMismatch.labels(instanceId).set(h.resilience.configVersionMismatch);
      this.offlineEventQueueDepth.labels(instanceId).set(h.resilience.offlineEventQueueDepth);
      // null(미구현)은 0 이 아니라 -1 로 낸다. 0 은 "밀린 것 없음" 으로 읽힌다.
      this.offlineCommandQueueDepth
        .labels(instanceId)
        .set(orMinusOne(h.resilience.offlineCommandQueueDepth));
      this.dbReplicationLag.labels(instanceId).set(orMinusOne(h.resilience.replicationLagSeconds));
      this.walArchiveAge.labels(instanceId).set(orMinusOne(h.resilience.walArchiveAgeSeconds));
      this.backupLastSuccess
        .labels(instanceId)
        .set(
          h.resilience.backupLastSuccessTimestamp
            ? Math.floor(new Date(h.resilience.backupLastSuccessTimestamp).getTime() / 1000)
            : -1,
        );

      this.callActive.labels(instanceId).set(h.call.active);
      this.callQueued.labels(instanceId).set(h.call.queued);
      this.callRinging.labels(instanceId).set(h.call.ringing);
      this.callTalking.labels(instanceId).set(h.call.talking);
      this.callHold.labels(instanceId).set(h.call.hold);
      this.callTransferring.labels(instanceId).set(h.call.transferring);
      this.callStuck.labels(instanceId).set(h.call.stuck);
      this.callLongestWait.labels(instanceId).set(h.call.longestWaitingSeconds);

      this.agentAvailable.labels(instanceId).set(h.agent.available);
      this.agentTalking.labels(instanceId).set(h.agent.talking);
      this.agentRinging.labels(instanceId).set(h.agent.ringing);
      this.agentPaused.labels(instanceId).set(h.agent.paused);
      this.agentLoggedIn.labels(instanceId).set(h.agent.loggedIn);

      this.queueWaiting.labels(instanceId).set(h.queue.waiting);
      this.queueRinging.labels(instanceId).set(h.queue.ringing);
      this.queueTalking.labels(instanceId).set(h.queue.talking);
      this.queueAvailableAgents.labels(instanceId).set(h.queue.availableAgents);
      this.queueLongestWait.labels(instanceId).set(h.queue.longestWaitSeconds);
    } catch (error) {
      this.refreshFailures.labels(instanceId).inc();
      throw error;
    } finally {
      endTimer({ instance_id: instanceId });
    }
  }

  async getMetrics(tenantId?: string): Promise<string> {
    await this.refresh(tenantId);
    return this.registry.metrics();
  }

  getContentType(): string {
    return this.registry.contentType;
  }
}

const OPERATING_MODE_VALUES: Record<string, number> = {
  NORMAL: 0,
  DB_FAILOVER: 1,
  RECOVERING: 2,
  DEGRADED: 3,
};

function mapOperatingMode(mode: string): number {
  return OPERATING_MODE_VALUES[mode] ?? -1;
}

/** null 을 0 으로 내면 "정상 0" 과 "모름" 이 구분되지 않는다. */
function orMinusOne(value: number | null | undefined): number {
  return value === null || value === undefined ? -1 : value;
}
