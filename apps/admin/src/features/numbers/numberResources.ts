export interface NumberDidRow {
  id: string;
  did: string;
  description?: string | null;
  primaryQueueName?: string | null;
  ivrMenuName?: string | null;
  directQueue?: string | null;
  ivrMenuId?: string | null;
  representativeNumber?: string | null;
  isActive?: boolean;
}

export interface NumberAgentRow {
  agentId: string;
  loginId: string;
  agentName: string;
  extension: string;
  isActive: boolean;
}

export interface NumberQueueRow {
  queueId: string;
  queueName: string;
  queueDisplayName?: string | null;
  queueExten?: string | null;
  isActive?: boolean;
}

export type NumberResourceType = 'DID' | 'EXTENSION' | 'QUEUE' | 'FEATURE_CODE';

export interface NumberResourceRow {
  id: string;
  number: string;
  resourceType: NumberResourceType;
  label: string;
  routeSummary: string;
  status: 'ACTIVE' | 'INACTIVE';
  targetRoute: string | null;
  hasConflict: boolean;
}

const FEATURE_CODE_ROWS: Array<Omit<NumberResourceRow, 'hasConflict'>> = [
  {
    id: 'feature-pickup',
    number: '*8',
    resourceType: 'FEATURE_CODE',
    label: '대리응답',
    routeSummary: '대리응답',
    status: 'ACTIVE',
    targetRoute: '/calls/active?feature=pickup',
  },
  {
    id: 'feature-attended-transfer-complete',
    number: '*2',
    resourceType: 'FEATURE_CODE',
    label: '상담 전환 완료',
    routeSummary: '상담 전환 완료',
    status: 'ACTIVE',
    targetRoute: '/calls/active?feature=attended-transfer',
  },
];

function didRouteSummary(did: NumberDidRow): string {
  if (did.ivrMenuName || did.ivrMenuId) return 'ARS 사용';
  const queueName = did.primaryQueueName || did.directQueue;
  if (queueName) return `호 분배룰 ${queueName}`;
  return '미설정';
}

export function buildNumberResourceRows(input: {
  dids: NumberDidRow[];
  agents: NumberAgentRow[];
  queues?: NumberQueueRow[];
}): NumberResourceRow[] {
  const rows: Array<Omit<NumberResourceRow, 'hasConflict'>> = [
    ...input.dids.map((did) => ({
      id: `did-${did.id}`,
      number: did.did,
      resourceType: 'DID' as const,
      label: did.description || did.representativeNumber || 'DID',
      routeSummary: didRouteSummary(did),
      status: did.isActive === false ? 'INACTIVE' as const : 'ACTIVE' as const,
      targetRoute: `/asterisk-config?tab=dids&resourceId=${did.id}`,
    })),
    ...input.agents.map((agent) => ({
      id: `agent-${agent.agentId}`,
      number: agent.extension,
      resourceType: 'EXTENSION' as const,
      label: `${agent.agentName} (${agent.loginId})`,
      routeSummary: '상담원 내선',
      status: agent.isActive ? 'ACTIVE' as const : 'INACTIVE' as const,
      targetRoute: `/settings/agents?resourceId=${agent.agentId}`,
    })),
    ...(input.queues ?? [])
      .filter((queue) => Boolean(queue.queueExten))
      .map((queue) => ({
        id: `queue-${queue.queueId}`,
        number: queue.queueExten!,
        resourceType: 'QUEUE' as const,
        label: queue.queueDisplayName || queue.queueName,
        routeSummary: '호 분배룰 내선',
        status: queue.isActive === false ? 'INACTIVE' as const : 'ACTIVE' as const,
        targetRoute: `/settings/queues?resourceId=${queue.queueId}`,
      })),
    ...FEATURE_CODE_ROWS,
  ];

  const countByNumber = rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.number] = (acc[row.number] ?? 0) + 1;
    return acc;
  }, {});

  return rows.map((row) => ({
    ...row,
    hasConflict: (countByNumber[row.number] ?? 0) > 1,
  }));
}
