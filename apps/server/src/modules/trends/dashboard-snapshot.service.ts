import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { AmiConnectionService } from '../ami/ami-connection.service';
import { AmiLeaderElectionService } from '../redis/ami-leader-election.service';
import { countEndpointContacts, countTrunkChannels } from './resource-metrics';
import {
  AgentLiveRow,
  QueueLiveRow,
  ResourceMetrics,
  buildSnapshotRows,
} from './snapshot-builder';

/** 아직 끝나지 않은 세션 상태. ENDED 를 제외한 전부. */
const LIVE_SESSION_STATUSES = [
  'NEW',
  'QUEUED',
  'RINGING_AGENT',
  'TALKING',
  'HOLD',
  'TRANSFERRING',
  'AFTER_CALL_WORK',
];

const CAPTURE_INTERVAL_MS = 60_000;
const AMI_QUERY_TIMEOUT_MS = 5_000;

/**
 * 1분마다 운영 상태를 `dashboardSnapshots` 에 적재한다.
 *
 * 대기큐 깊이·트렁크 점유·단말 등록수는 순간값이라 지나가면 사라진다. 통화 이력처럼
 * 나중에 소급 집계할 방법이 없어서, 추이를 보려면 그때그때 적재하는 수밖에 없다.
 */
@Injectable()
export class DashboardSnapshotService implements OnModuleInit {
  private readonly logger = new Logger(DashboardSnapshotService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ami: AmiConnectionService,
    private readonly leader: AmiLeaderElectionService,
  ) {}

  onModuleInit(): void {
    setInterval(
      () => this.capture().catch((error) => this.logger.error(`snapshot capture failed: ${error.message}`)),
      CAPTURE_INTERVAL_MS,
    );
  }

  async capture(): Promise<void> {
    // 리더 가드가 없으면 노드 수만큼 중복 적재된다. DB 의 @@unique 가 최종
    // 방어선이지만, 매 분 실패할 INSERT 를 노드 수만큼 던지는 것은 낭비다.
    if (!this.leader.isLeader()) return;

    const capturedAt = new Date();
    const resources = await this.readResourceMetrics();
    const tenants = await this.prisma.tenants.findMany({ select: { tenantId: true } });

    for (const { tenantId } of tenants) {
      try {
        await this.captureTenant(tenantId, capturedAt, resources);
      } catch (error: any) {
        // 한 테넌트가 실패해도 나머지는 적재한다. 이 분을 통째로 버리면
        // 그 구간이 영원히 빈다.
        this.logger.warn(`snapshot skipped for tenant ${tenantId}: ${error.message}`);
      }
    }
  }

  private async captureTenant(
    tenantId: string,
    capturedAt: Date,
    resources: ResourceMetrics,
  ): Promise<void> {
    const [queues, agents] = await Promise.all([
      this.readQueueRows(tenantId),
      this.readAgentRows(tenantId),
    ]);

    await this.prisma.dashboardSnapshots.createMany({
      data: buildSnapshotRows({ tenantId, capturedAt, queues, agents, resources }),
      skipDuplicates: true,
    });
  }

  private async readQueueRows(tenantId: string): Promise<QueueLiveRow[]> {
    const queues = await this.prisma.queues.findMany({
      where: { tenantId, isActive: true },
      select: { queueId: true, queueName: true },
    });
    if (queues.length === 0) return [];

    const queueNames = queues.map((queue) => queue.queueName);
    const [statusCounts, queuedCalls] = await Promise.all([
      this.prisma.callSessions.groupBy({
        by: ['queueName', 'sessionStatus'],
        where: {
          tenantId,
          queueName: { in: queueNames },
          sessionStatus: { in: LIVE_SESSION_STATUSES },
        },
        _count: { callId: true },
      }),
      this.prisma.callSessions.findMany({
        where: { tenantId, queueName: { in: queueNames }, sessionStatus: 'QUEUED' },
        select: { queueName: true, queuedAt: true },
      }),
    ]);

    const countAt = (queueName: string, status: string) =>
      (statusCounts as any[]).find(
        (row) => row.queueName === queueName && row.sessionStatus === status,
      )?._count.callId ?? 0;

    const now = Date.now();
    const longestWaitAt = (queueName: string) => {
      const waits = (queuedCalls as any[])
        .filter((call) => call.queueName === queueName && call.queuedAt)
        .map((call) => Math.max(0, Math.floor((now - call.queuedAt.getTime()) / 1000)));
      return waits.length ? Math.max(...waits) : 0;
    };

    return queues.map((queue) => ({
      queueId: queue.queueId,
      waiting: countAt(queue.queueName, 'QUEUED'),
      ringing: countAt(queue.queueName, 'RINGING_AGENT'),
      talking: countAt(queue.queueName, 'TALKING'),
      longestWaitSeconds: longestWaitAt(queue.queueName),
    }));
  }

  private async readAgentRows(tenantId: string): Promise<AgentLiveRow[]> {
    // endedAt 이 null 인 행이 그 상담원의 현재 상태다 (admin.service 와 같은 규칙).
    const [openStatuses, memberships] = await Promise.all([
      this.prisma.agentStatusHistory.findMany({
        where: { tenantId, endedAt: null },
        select: { agentId: true, statusCode: true },
      }),
      this.prisma.queueAgentMembers.findMany({
        where: { isActive: true },
        select: { agentId: true, queueId: true },
      }),
    ]);

    const queueIdsByAgent = new Map<string, string[]>();
    for (const member of memberships as any[]) {
      const list = queueIdsByAgent.get(member.agentId) ?? [];
      list.push(member.queueId);
      queueIdsByAgent.set(member.agentId, list);
    }

    return (openStatuses as any[]).map((status) => ({
      agentId: status.agentId,
      queueIds: queueIdsByAgent.get(status.agentId) ?? [],
      statusCode: status.statusCode,
    }));
  }

  /**
   * PBX 리소스 지표. 못 읽으면 `null` 이고 `0` 이 아니다.
   *
   * 못 읽은 구간을 0 으로 적재하면 나중에 용량을 볼 때 트렁크가 놀고 있었던
   * 것처럼 보인다. 대신 `amiConnected` 로 왜 비었는지를 남긴다.
   */
  private async readResourceMetrics(): Promise<ResourceMetrics> {
    const empty: ResourceMetrics = {
      trunkChannelsInUse: null,
      endpointsTotal: null,
      endpointsRegistered: null,
      endpointsReachable: null,
      amiConnected: false,
    };

    if (!this.ami.isConnected()) return empty;

    try {
      const [contacts, channels] = await Promise.all([
        this.ami.sendActionWithResponse(
          { Action: 'PJSIPShowContacts' },
          { eventList: true, timeoutMs: AMI_QUERY_TIMEOUT_MS },
        ),
        this.ami.sendActionWithResponse(
          { Action: 'CoreShowChannels' },
          { eventList: true, timeoutMs: AMI_QUERY_TIMEOUT_MS },
        ),
      ]);

      const endpoints = countEndpointContacts(contacts);
      return {
        trunkChannelsInUse: countTrunkChannels(channels),
        endpointsTotal: endpoints?.registered ?? null,
        endpointsRegistered: endpoints?.registered ?? null,
        endpointsReachable: endpoints?.reachable ?? null,
        amiConnected: true,
      };
    } catch (error: any) {
      // 연결은 살아 있는데 조회만 실패한 경우다. 그 사실을 그대로 남긴다.
      this.logger.warn(`AMI resource query failed: ${error.message}`);
      return { ...empty, amiConnected: true };
    }
  }
}
