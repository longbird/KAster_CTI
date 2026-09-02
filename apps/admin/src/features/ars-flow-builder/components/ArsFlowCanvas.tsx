import {
  addEdge,
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type NodeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { message } from 'antd';
import { useCallback, useEffect, useMemo } from 'react';
import { canEdgeExist, edgeLabel, type FlowCanvasNode } from '../types/canvasGraph';
import type { FlowEdgeCondition, FlowNodeType } from '../types/flowGraph';
import { newNodeId } from '../types/nodeDefaults';
import { ArsFlowNodeCard } from './ArsFlowNodeCard';

interface Props {
  nodes: FlowCanvasNode[];
  edges: Edge[];
  selectedNodeId: string | null;
  onNodesChangeExternal: (nodes: FlowCanvasNode[]) => void;
  onEdgesChangeExternal: (edges: Edge[]) => void;
  onSelectNode: (nodeId: string | null) => void;
}

const NODE_TYPES = { arsFlowNode: ArsFlowNodeCard };

/**
 * 새 연결의 조건을 출발 노드 종류로 정한다.
 *
 * 메뉴에서 나가면 디지트, 조건 분기에서 나가면 참/거짓, 나머지는 다음이다.
 * 사용자가 매번 조건을 고르게 하면 대부분의 경우 답이 하나뿐인데도 한 단계가 는다.
 */
function conditionForSource(nodeType: FlowNodeType, existing: FlowEdgeCondition[]): FlowEdgeCondition | null {
  if (nodeType === 'MENU') return 'DIGIT';
  if (nodeType === 'CONDITION') return existing.includes('TRUE') ? 'FALSE' : 'TRUE';
  if (nodeType === 'COLLECT_DIGITS') {
    if (!existing.includes('DEFAULT')) return 'DEFAULT';
    return existing.includes('TIMEOUT') ? null : 'TIMEOUT';
  }
  return existing.includes('DEFAULT') ? null : 'DEFAULT';
}

export function ArsFlowCanvas({
  nodes, edges, selectedNodeId, onNodesChangeExternal, onEdgesChangeExternal, onSelectNode,
}: Props) {
  const [canvasNodes, setCanvasNodes, onNodesChange] = useNodesState<FlowCanvasNode>(nodes);
  const [canvasEdges, setCanvasEdges, onEdgesChange] = useEdgesState<Edge>(edges);

  useEffect(() => setCanvasNodes(nodes), [nodes, setCanvasNodes]);
  useEffect(() => setCanvasEdges(edges), [edges, setCanvasEdges]);

  const nodeTypeById = useMemo(
    () => new Map(canvasNodes.map((node) => [node.id, node.data.row.nodeType])),
    [canvasNodes],
  );

  const handleConnect = useCallback((connection: Connection) => {
    const sourceType = nodeTypeById.get(connection.source);
    if (!sourceType) return;

    const existing = canvasEdges
      .filter((edge) => edge.source === connection.source)
      .map((edge) => edge.data?.condition as FlowEdgeCondition);
    const condition = conditionForSource(sourceType, existing);

    if (!condition || !canEdgeExist(sourceType, condition)) {
      message.warning('이 노드에서는 더 이상 연결을 만들 수 없습니다.');
      return;
    }

    const next = addEdge(
      {
        ...connection,
        id: newNodeId(),
        label: edgeLabel({ condition, digit: null }),
        data: { condition, digit: null },
      },
      canvasEdges,
    );
    setCanvasEdges(next);
    onEdgesChangeExternal(next);
  }, [canvasEdges, nodeTypeById, setCanvasEdges, onEdgesChangeExternal]);

  const handleNodesChange = useCallback((changes: NodeChange<FlowCanvasNode>[]) => {
    onNodesChange(changes);
    // 위치 이동이 끝난 뒤에만 밖으로 알린다. 드래그 중 매 프레임 올리면 상위가 계속 다시 그린다.
    if (changes.some((change) => change.type === 'position' && change.dragging === false)) {
      setCanvasNodes((current) => {
        onNodesChangeExternal(current);
        return current;
      });
    }
  }, [onNodesChange, setCanvasNodes, onNodesChangeExternal]);

  return (
    <div style={{ height: '100%', minHeight: 520 }}>
      <ReactFlow
        nodes={canvasNodes.map((node) => ({ ...node, selected: node.id === selectedNodeId }))}
        edges={canvasEdges}
        nodeTypes={NODE_TYPES}
        onNodesChange={handleNodesChange}
        onEdgesChange={(changes) => {
          onEdgesChange(changes);
          setCanvasEdges((current) => {
            onEdgesChangeExternal(current);
            return current;
          });
        }}
        onConnect={handleConnect}
        onNodeClick={(_, node) => onSelectNode(node.id)}
        onPaneClick={() => onSelectNode(null)}
        fitView
        proOptions={{ hideAttribution: false }}
      >
        <Background />
        <Controls />
        <MiniMap pannable zoomable />
      </ReactFlow>
    </div>
  );
}
