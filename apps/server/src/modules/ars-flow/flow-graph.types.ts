export const FLOW_NODE_TYPES = [
  'PLAY',
  'MENU',
  'QUEUE',
  'TRANSFER',
  'SMS',
  'OPT_OUT',
  'CONDITION',
  'HANGUP',
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
}

export interface OptOutConfig {
  action: 'REGISTER' | 'UNREGISTER';
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

export type NodeConfig =
  | PlayConfig
  | MenuConfig
  | QueueConfig
  | TransferConfig
  | SmsConfig
  | OptOutConfig
  | ConditionConfig
  | HangupConfig;

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
