export const FLOW_NODE_TYPES = [
  'PLAY',
  'MENU',
  'QUEUE',
  'TRANSFER',
  'SMS',
  'OPT_OUT',
  'CONDITION',
  'HANGUP',
  'COLLECT_DIGITS',
  'HTTP_LOOKUP',
] as const;
export type FlowNodeType = (typeof FLOW_NODE_TYPES)[number];

export const FLOW_EDGE_CONDITIONS = [
  'DIGIT',
  'TIMEOUT',
  'INVALID',
  'TRUE',
  'FALSE',
  'DEFAULT',
] as const;
export type FlowEdgeCondition = (typeof FLOW_EDGE_CONDITIONS)[number];

/**
 * 수신거부·문자의 대상 번호를 어디서 가져오는지.
 *
 * `COLLECTED` 는 `COLLECT_DIGITS` 노드가 받아둔 번호를 쓴다 — 고객이 *다른 번호*를
 * 눌러 넣는 경로다(080 수신거부의 번호 재입력과 같은 시나리오).
 * 기본값은 `CALLER` 이고, 이 필드가 없던 기존 그래프는 전부 `CALLER` 로 읽힌다.
 */
export const DIGIT_TARGET_SOURCES = ['CALLER', 'COLLECTED'] as const;
export type DigitTargetSource = (typeof DIGIT_TARGET_SOURCES)[number];

export interface PlayConfig {
  promptKeys: string[];
}

export interface MenuConfig {
  promptKey: string | null;
  timeoutSeconds: number;
  maxRetries: number;
}

export interface QueueConfig {
  queueName: string;
}

export interface TransferConfig {
  transferNumber: string;
}

export interface SmsConfig {
  smsTemplateId: string;
  targetSource: DigitTargetSource;
}

export interface OptOutConfig {
  action: 'REGISTER' | 'UNREGISTER';
  targetSource: DigitTargetSource;
}

export interface ConditionConfig {
  conditionType: 'TIME_RANGE' | 'HOLIDAY';
  timeStart: string | null;
  timeEnd: string | null;
  daysOfWeek: string[];
}

export interface HangupConfig {
  promptKey: string | null;
}

/**
 * 숫자 여러 자리를 받는다.
 *
 * 받은 값은 채널 변수 하나(`ARS_COLLECTED_DIGITS`)에 담기고, `targetSource: 'COLLECTED'` 인
 * `SMS`/`OPT_OUT` 노드가 그것을 대상 번호로 쓴다. 한 통화에서 여러 번 받으면 마지막 값이 남는다.
 */
export interface CollectDigitsConfig {
  promptKey: string | null;
  minDigits: number;
  maxDigits: number;
  timeoutSeconds: number;
  maxRetries: number;
}

/**
 * 통화 중 외부 API 를 조회하고 결과로 분기한다.
 *
 * 주소·인증·응답 해석 규칙은 **여기 없다** — 관리자가 등록한 엔드포인트(`arsHttpEndpoints`)에 있다.
 * 노드에 주소를 적을 수 있으면 PBX 망에서 아무 데나 부를 수 있고, 그래프는 미리보기·백업으로
 * 복사되므로 자격증명이 거기 있으면 안 된다.
 *
 * `waitPromptKey` 는 조회하는 동안 틀 안내다. 비우면 그 시간 동안 고객은 무음을 듣는다.
 */
export interface HttpLookupConfig {
  endpointId: string;
  waitPromptKey: string | null;
}

export type NodeConfig =
  | PlayConfig
  | MenuConfig
  | QueueConfig
  | TransferConfig
  | SmsConfig
  | OptOutConfig
  | ConditionConfig
  | HangupConfig
  | CollectDigitsConfig
  | HttpLookupConfig;

export interface FlowNode {
  nodeId: string;
  nodeType: FlowNodeType;
  label: string;
  config: NodeConfig;
}

export interface FlowEdge {
  edgeId: string;
  fromNodeId: string;
  toNodeId: string;
  condition: FlowEdgeCondition;
  digit?: string | null;
}

/**
 * 컴파일러가 보는 그래프.
 *
 * `posX`/`posY` 가 **의도적으로 없다.** 편집기에서 노드를 옮겼다고 dialplan 이 바뀌면 안 된다.
 * 좌표는 `arsFlowNodes` 에만 남고 여기까지 오지 않는다.
 */
export interface FlowGraph {
  flowId: string;
  name: string;
  entryNodeId: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export function isFlowNodeType(value: unknown): value is FlowNodeType {
  return typeof value === 'string' && (FLOW_NODE_TYPES as readonly string[]).includes(value);
}

export function isFlowEdgeCondition(value: unknown): value is FlowEdgeCondition {
  return typeof value === 'string' && (FLOW_EDGE_CONDITIONS as readonly string[]).includes(value);
}
