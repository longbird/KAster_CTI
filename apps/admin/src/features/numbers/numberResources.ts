export interface NumberDidRow {
  id: string;
  did: string;
  description?: string | null;
  primaryQueueName?: string | null;
  ivrMenuName?: string | null;
  directQueue?: string | null;
  directExtension?: string | null;
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

export interface NumberFeatureCodeRow {
  featureKey: string;
  label: string;
  code: string | null;
  enabled: boolean;
  invocation: 'HANDSET_DIAL' | 'SERVER_DTMF';
}

// 하드코딩하지 않는다. 예전 구현은 *8 / *2 를 항상 ACTIVE 로 보여줬지만
// 어느 dialplan 에도 렌더링되지 않아 화면이 사실과 달랐다.
function buildFeatureCodeRows(
  featureCodes: NumberFeatureCodeRow[],
): Array<Omit<NumberResourceRow, 'hasConflict'>> {
  return featureCodes
    .filter((item) => Boolean(item.code))
    .map((item) => ({
      id: `feature-${item.featureKey}`,
      number: item.code as string,
      resourceType: 'FEATURE_CODE' as const,
      label: item.label,
      routeSummary: item.invocation === 'HANDSET_DIAL'
        ? `${item.label} · 단말 다이얼`
        : `${item.label} · 서버 전송 (단말 다이얼 불가)`,
      status: item.enabled ? 'ACTIVE' as const : 'INACTIVE' as const,
      targetRoute: '/asterisk?tab=feature-codes',
    }));
}

function didRouteSummary(did: NumberDidRow): string {
  if (did.ivrMenuName || did.ivrMenuId) return 'ARS 사용';
  const queueName = did.primaryQueueName || did.directQueue;
  if (queueName) return `호 분배룰 ${queueName}`;
  if (did.directExtension) return `내선 ${did.directExtension}`;
  return '미설정';
}

export function buildNumberResourceRows(input: {
  dids: NumberDidRow[];
  agents: NumberAgentRow[];
  queues?: NumberQueueRow[];
  featureCodes?: NumberFeatureCodeRow[];
}): NumberResourceRow[] {
  const rows: Array<Omit<NumberResourceRow, 'hasConflict'>> = [
    ...input.dids.map((did) => ({
      id: `did-${did.id}`,
      number: did.did,
      resourceType: 'DID' as const,
      label: did.description || did.representativeNumber || 'DID',
      routeSummary: didRouteSummary(did),
      status: did.isActive === false ? 'INACTIVE' as const : 'ACTIVE' as const,
      targetRoute: `/asterisk?tab=dids&resourceId=${did.id}`,
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
    ...buildFeatureCodeRows(input.featureCodes ?? []),
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
