import type { Edge, Node } from '@xyflow/react';
import {
  EDGE_CONDITION_LABELS,
  TERMINAL_NODE_TYPES,
  type FlowEdgeCondition,
  type FlowEdgeRow,
  type FlowNodeRow,
  type FlowNodeType,
} from './flowGraph';

export interface FlowNodeData extends Record<string, unknown> {
  row: FlowNodeRow;
  isEntry: boolean;
}

export type FlowCanvasNode = Node<FlowNodeData>;

export interface GraphPayload {
  entryNodeId: string;
  nodes: FlowNodeRow[];
  edges: Array<Required<Pick<FlowEdgeRow, 'edgeId' | 'fromNodeId' | 'toNodeId' | 'condition'>> & { digit: string | null }>;
}

/**
 * 서버 그래프를 캔버스 표현으로 옮긴다.
 *
 * 캔버스는 그래프의 **표현일 뿐**이다. 좌표는 사람이 보기 좋으라고 있는 것이고,
 * 서버 컴파일러는 좌표를 아예 받지 않는다 — 노드를 옮겨도 dialplan 은 그대로다.
 */
export function toCanvas(
  nodes: FlowNodeRow[],
  edges: FlowEdgeRow[],
  entryNodeId: string | null,
): { nodes: FlowCanvasNode[]; edges: Edge[] } {
  return {
    nodes: nodes.map((row) => ({
      id: row.nodeId,
      type: 'arsFlowNode',
      position: { x: row.posX, y: row.posY },
      data: { row, isEntry: row.nodeId === entryNodeId },
    })),
    edges: edges.map((row) => ({
      id: row.edgeId,
      source: row.fromNodeId,
      target: row.toNodeId,
      label: edgeLabel(row),
      data: { condition: row.condition, digit: row.digit ?? null },
    })),
  };
}

/** 캔버스 상태를 서버가 받는 그래프로 되돌린다. */
export function toGraphPayload(
  nodes: FlowCanvasNode[],
  edges: Edge[],
  entryNodeId: string,
): GraphPayload {
  return {
    entryNodeId,
    nodes: nodes.map((node) => ({
      ...node.data.row,
      // 소수 좌표를 그대로 보내면 서버 DTO 의 @IsInt 에 걸린다.
      posX: Math.round(node.position.x),
      posY: Math.round(node.position.y),
    })),
    edges: edges.map((edge) => ({
      edgeId: edge.id,
      fromNodeId: edge.source,
      toNodeId: edge.target,
      condition: (edge.data?.condition as FlowEdgeCondition) ?? 'DEFAULT',
      digit: (edge.data?.digit as string | null) ?? null,
    })),
  };
}

/**
 * 이 노드에서 이 조건으로 나가는 연결을 만들 수 있는가.
 *
 * 서버 검증이 최종 판정이지만, 캔버스에서 애초에 못 잇게 하면 사용자가
 * 저장을 눌러 거절당하는 왕복을 줄인다.
 */
export function canEdgeExist(nodeType: FlowNodeType, condition: FlowEdgeCondition): boolean {
  if (TERMINAL_NODE_TYPES.includes(nodeType)) return false;
  if (nodeType === 'MENU') return condition === 'DIGIT' || condition === 'TIMEOUT' || condition === 'INVALID';
  if (nodeType === 'CONDITION') return condition === 'TRUE' || condition === 'FALSE';
  return condition === 'DEFAULT';
}

export function edgeLabel(edge: Pick<FlowEdgeRow, 'condition' | 'digit'>): string {
  const base = EDGE_CONDITION_LABELS[edge.condition];
  return edge.condition === 'DIGIT' && edge.digit ? `${base} ${edge.digit}` : base;
}
