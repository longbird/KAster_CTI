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
