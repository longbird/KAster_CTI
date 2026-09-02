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

export const FLOW_EDGE_CONDITIONS = ['DIGIT', 'TIMEOUT', 'INVALID', 'TRUE', 'FALSE', 'DEFAULT'] as const;
export type FlowEdgeCondition = (typeof FLOW_EDGE_CONDITIONS)[number];

export interface FlowNodeRow {
  nodeId: string;
  nodeType: FlowNodeType;
  label: string;
  config: Record<string, unknown>;
  posX: number;
  posY: number;
}

export interface FlowEdgeRow {
  edgeId: string;
  fromNodeId: string;
  toNodeId: string;
  condition: FlowEdgeCondition;
  digit?: string | null;
}

export interface ArsFlow {
  flowId: string;
  name: string;
  description: string | null;
  status: string;
  entryNodeId: string | null;
  version: number;
}

export interface FlowGraphResponse {
  flow: ArsFlow;
  nodes: FlowNodeRow[];
  edges: FlowEdgeRow[];
}

export interface FlowIssue {
  code: string;
  message: string;
  nodeId?: string;
  edgeId?: string;
}

export interface FlowValidationResult {
  errors: FlowIssue[];
  warnings: FlowIssue[];
}

export const NODE_TYPE_LABELS: Record<FlowNodeType, string> = {
  PLAY: '안내 재생',
  MENU: '메뉴 (디지트 입력)',
  QUEUE: '큐 연결',
  TRANSFER: '번호 전환',
  SMS: '문자 발송',
  OPT_OUT: '수신거부 처리',
  CONDITION: '조건 분기',
  HANGUP: '통화 종료',
};

export const EDGE_CONDITION_LABELS: Record<FlowEdgeCondition, string> = {
  DIGIT: '디지트',
  TIMEOUT: '시간초과',
  INVALID: '잘못된 입력',
  TRUE: '참',
  FALSE: '거짓',
  DEFAULT: '다음',
};

/** 점프 지점에서 끝나는 노드. 나가는 연결을 만들 수 없다. */
export const TERMINAL_NODE_TYPES: FlowNodeType[] = ['QUEUE', 'TRANSFER', 'HANGUP'];
