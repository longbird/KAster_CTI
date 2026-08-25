/**
 * 지금 이 순간의 운영 상태를 스냅샷 행으로 만든다.
 *
 * 큐마다 한 행, 그리고 `queueId = null` 인 테넌트 합계 한 행을 만든다.
 * 큐 축이 없으면 "어느 큐가 막혔는가"를 답할 수 없고, 합계 축이 없으면
 * 큐가 늘고 줄 때 전체 추이가 끊긴다. 둘 다 필요하다.
 */
import { floorToResolution } from './snapshot-rollup';

export interface QueueLiveRow {
  queueId: string;
  waiting: number;
  ringing: number;
  talking: number;
  longestWaitSeconds: number;
}

export interface AgentLiveRow {
  agentId: string;
  /** 이 상담원이 속한 큐. 비어 있으면 어느 큐에도 배정되지 않았다. */
  queueIds: string[];
  statusCode: string;
}

export interface ResourceMetrics {
  trunkChannelsInUse: number | null;
  endpointsTotal: number | null;
  endpointsRegistered: number | null;
  endpointsReachable: number | null;
  amiConnected: boolean;
}

export interface SnapshotInsertRow {
  tenantId: string;
  queueId: string | null;
  capturedAt: Date;
  resolution: 'PT1M';
  waitingCalls: number;
  longestWaitSeconds: number;
  talkingCalls: number;
  ringingCalls: number;
  agentsAvailable: number;
  agentsRinging: number;
  agentsTalking: number;
  agentsAcw: number;
  agentsBreak: number;
  agentsLoggedIn: number;
  trunkChannelsInUse: number | null;
  endpointsTotal: number | null;
  endpointsRegistered: number | null;
  endpointsReachable: number | null;
  amiConnected: boolean | null;
}

/** 상태 코드 -> 스냅샷 칸. 여기 없는 코드는 칸에 넣지 않는다 (로그인 인원에는 센다). */
const STATUS_COLUMN: Record<string, keyof SnapshotInsertRow> = {
  AVAILABLE: 'agentsAvailable',
  RINGING_AGENT: 'agentsRinging',
  TALKING: 'agentsTalking',
  AFTER_CALL_WORK: 'agentsAcw',
  BREAK: 'agentsBreak',
};

interface AgentCounts {
  agentsAvailable: number;
  agentsRinging: number;
  agentsTalking: number;
  agentsAcw: number;
  agentsBreak: number;
  agentsLoggedIn: number;
}

function emptyAgentCounts(): AgentCounts {
  return {
    agentsAvailable: 0,
    agentsRinging: 0,
    agentsTalking: 0,
    agentsAcw: 0,
    agentsBreak: 0,
    agentsLoggedIn: 0,
  };
}

function countAgents(agents: AgentLiveRow[]): AgentCounts {
  const counts = emptyAgentCounts();
  for (const agent of agents) {
    counts.agentsLoggedIn += 1;
    const column = STATUS_COLUMN[agent.statusCode];
    if (column) (counts as any)[column] += 1;
  }
  return counts;
}

export interface BuildSnapshotInput {
  tenantId: string;
  capturedAt: Date;
  queues: QueueLiveRow[];
  agents: AgentLiveRow[];
  resources: ResourceMetrics;
}

export function buildSnapshotRows(input: BuildSnapshotInput): SnapshotInsertRow[] {
  // 적재가 몇 초 늦어도 같은 분에 들어가야 한다. 안 그러면 unique 제약이
  // 중복을 못 걸러내고 버킷 경계가 행마다 흔들린다.
  const capturedAt = floorToResolution(input.capturedAt, 'PT1M');

  const queueRows: SnapshotInsertRow[] = input.queues.map((queue) => ({
    tenantId: input.tenantId,
    queueId: queue.queueId,
    capturedAt,
    resolution: 'PT1M',
    waitingCalls: queue.waiting,
    longestWaitSeconds: queue.longestWaitSeconds,
    talkingCalls: queue.talking,
    ringingCalls: queue.ringing,
    ...countAgents(input.agents.filter((agent) => agent.queueIds.includes(queue.queueId))),
    // 리소스는 PBX 전체의 값이라 큐로 나눌 수 없다. 큐 행에 복사해두면
    // 큐 3개를 더했을 때 트렁크가 3배로 보인다.
    trunkChannelsInUse: null,
    endpointsTotal: null,
    endpointsRegistered: null,
    endpointsReachable: null,
    amiConnected: null,
  }));

  const totalRow: SnapshotInsertRow = {
    tenantId: input.tenantId,
    queueId: null,
    capturedAt,
    resolution: 'PT1M',
    waitingCalls: input.queues.reduce((sum, queue) => sum + queue.waiting, 0),
    // 최장 대기는 더하지 않는다. 40초와 180초를 더한 220초는 존재한 적 없는 값이다.
    longestWaitSeconds: Math.max(0, ...input.queues.map((queue) => queue.longestWaitSeconds)),
    talkingCalls: input.queues.reduce((sum, queue) => sum + queue.talking, 0),
    ringingCalls: input.queues.reduce((sum, queue) => sum + queue.ringing, 0),
    // 상담원은 <b>사람 단위로</b> 센다. 두 큐에 걸친 상담원을 큐별 합으로 더하면
    // 로그인 인원이 실제보다 많아 보여 인력 판단이 틀어진다.
    ...countAgents(input.agents),
    ...input.resources,
  };

  return [...queueRows, totalRow];
}
