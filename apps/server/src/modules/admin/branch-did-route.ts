/** 지사에 연결된 DID 하나의 인입 착신 경로 분류. */
export type DidInboundRoute = 'ARS' | 'DIRECT_QUEUE' | 'FORWARDING' | 'NONE';

export interface DidRouteFacts {
  ivrMenuId: string | null;
  directQueue: string | null;
  hasForwardingRule: boolean;
}

/**
 * 착신 경로 우선순위: 착신전환 > ARS > 직접 분배룰 > 미설정.
 * 렌더러(renderDidStandardRoute)가 ALWAYS 착신전환 규칙을 DID 기본 경로보다
 * 먼저 적용하므로, 분류도 FORWARDING 을 최우선으로 둔다.
 */
export function classifyDidInboundRoute(facts: DidRouteFacts): DidInboundRoute {
  if (facts.hasForwardingRule) return 'FORWARDING';
  if (facts.ivrMenuId) return 'ARS';
  if (facts.directQueue) return 'DIRECT_QUEUE';
  return 'NONE';
}
