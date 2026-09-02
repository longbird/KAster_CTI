import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Col, Dropdown, Empty, Input, Modal, Row, Select, Space, Typography, message } from 'antd';
import type { Edge } from '@xyflow/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePermissionStore } from '../../store/usePermissionStore';
import {
  createArsFlow,
  deleteArsFlow,
  getArsFlow,
  listArsFlows,
  previewArsFlow,
  saveArsFlowGraph,
  validateArsFlow,
} from './api/arsFlowApi';
import { listArsHttpEndpoints } from '../ars-http-endpoints/api/arsHttpEndpointsApi';
import { ArsFlowCanvas } from './components/ArsFlowCanvas';
import { NodePropertiesPanel } from './components/NodePropertiesPanel';
import { toCanvas, toGraphPayload, type FlowCanvasNode } from './types/canvasGraph';
import {
  FLOW_NODE_TYPES,
  NODE_TYPE_LABELS,
  type ArsFlow,
  type FlowEdgeCondition,
  type FlowNodeRow,
  type FlowNodeType,
  type FlowValidationResult,
} from './types/flowGraph';
import { defaultConfigFor, newNodeId } from './types/nodeDefaults';

export function ArsFlowBuilderPage() {
  const permission = usePermissionStore((s) => s.permissionsByMenu['settings/ars-flows']);
  const canUpdate = permission?.canUpdate ?? true;
  const canCreate = permission?.canCreate ?? true;

  const [flows, setFlows] = useState<ArsFlow[]>([]);
  const [flowId, setFlowId] = useState<string | null>(null);
  const [entryNodeId, setEntryNodeId] = useState<string | null>(null);
  const [nodes, setNodes] = useState<FlowCanvasNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [validation, setValidation] = useState<FlowValidationResult | null>(null);
  const [httpEndpoints, setHttpEndpoints] = useState<Array<{ value: string; label: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadFlows = useCallback(async () => {
    try {
      const rows = await listArsFlows();
      setFlows(rows);
      setFlowId((current) => current ?? rows[0]?.flowId ?? null);
    } catch (error: any) {
      message.error(error?.response?.data?.error?.message ?? '플로우 목록을 불러오지 못했습니다.');
    }
  }, []);

  const loadGraph = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const { flow, nodes: nodeRows, edges: edgeRows } = await getArsFlow(id);
      const canvas = toCanvas(nodeRows, edgeRows, flow.entryNodeId);
      setEntryNodeId(flow.entryNodeId);
      setNodes(canvas.nodes);
      setEdges(canvas.edges);
      setSelectedNodeId(null);
      setValidation(null);
    } catch (error: any) {
      message.error(error?.response?.data?.error?.message ?? '플로우를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadFlows(); }, [loadFlows]);
  useEffect(() => {
    // 자격이 없으면 403 이다. 그때는 조회 노드를 못 쓰는 것이지 편집기가 깨지는 것은 아니다.
    void listArsHttpEndpoints()
      .then((rows) => setHttpEndpoints(
        rows.filter((row) => row.isActive).map((row) => ({ value: row.endpointId, label: row.name })),
      ))
      .catch(() => setHttpEndpoints([]));
  }, []);
  useEffect(() => { if (flowId) void loadGraph(flowId); }, [flowId, loadGraph]);

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId)?.data.row ?? null,
    [nodes, selectedNodeId],
  );

  const outgoing = useMemo(() => {
    if (!selectedNodeId) return [];
    const labelById = new Map(nodes.map((node) => [node.id, node.data.row.label]));
    return edges
      .filter((edge) => edge.source === selectedNodeId)
      .map((edge) => ({
        edgeId: edge.id,
        condition: (edge.data?.condition as FlowEdgeCondition) ?? 'DEFAULT',
        digit: (edge.data?.digit as string | null) ?? null,
        toLabel: labelById.get(edge.target) ?? edge.target,
      }));
  }, [edges, nodes, selectedNodeId]);

  const incoming = useMemo(() => {
    if (!selectedNodeId) return [];
    const labelById = new Map(nodes.map((node) => [node.id, node.data.row.label]));
    return edges
      .filter((edge) => edge.target === selectedNodeId)
      .map((edge) => ({
        edgeId: edge.id,
        condition: (edge.data?.condition as FlowEdgeCondition) ?? 'DEFAULT',
        digit: (edge.data?.digit as string | null) ?? null,
        fromLabel: labelById.get(edge.source) ?? edge.source,
      }));
  }, [edges, nodes, selectedNodeId]);

  const addNode = (nodeType: FlowNodeType) => {
    const row: FlowNodeRow = {
      nodeId: newNodeId(),
      nodeType,
      label: NODE_TYPE_LABELS[nodeType],
      config: defaultConfigFor(nodeType),
      posX: 80 + nodes.length * 40,
      posY: 80 + (nodes.length % 5) * 90,
    };
    const next: FlowCanvasNode = {
      id: row.nodeId,
      type: 'arsFlowNode',
      position: { x: row.posX, y: row.posY },
      data: { row, isEntry: nodes.length === 0 },
    };
    setNodes((current) => [...current, next]);
    // 첫 노드는 자동으로 진입점이 된다. 진입점 없는 플로우는 저장할 수 없다.
    if (nodes.length === 0) setEntryNodeId(row.nodeId);
    setSelectedNodeId(row.nodeId);
  };

  const updateNode = (next: FlowNodeRow) => {
    setNodes((current) => current.map((node) => (
      node.id === next.nodeId ? { ...node, data: { ...node.data, row: next } } : node
    )));
  };

  const setEntry = (nodeId: string) => {
    setEntryNodeId(nodeId);
    setNodes((current) => current.map((node) => ({
      ...node,
      data: { ...node.data, isEntry: node.id === nodeId },
    })));
  };

  const deleteNode = (nodeId: string) => {
    setNodes((current) => current.filter((node) => node.id !== nodeId));
    setEdges((current) => current.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
    if (entryNodeId === nodeId) setEntryNodeId(null);
    setSelectedNodeId(null);
  };

  const buildPayload = () => toGraphPayload(nodes, edges, entryNodeId ?? '');

  const runValidate = async () => {
    if (!flowId || !entryNodeId) {
      message.warning('진입 노드를 먼저 정하세요.');
      return null;
    }
    try {
      const result = await validateArsFlow(flowId, buildPayload());
      setValidation(result);
      if (result.errors.length === 0) message.success('검증을 통과했습니다.');
      return result;
    } catch (error: any) {
      message.error(error?.response?.data?.error?.message ?? '검증하지 못했습니다.');
      return null;
    }
  };

  const save = async () => {
    if (!flowId) return;
    const result = await runValidate();
    if (!result || result.errors.length > 0) return;

    setSaving(true);
    try {
      await saveArsFlowGraph(flowId, buildPayload());
      message.success('플로우를 저장했습니다.');
      await loadGraph(flowId);
      await loadFlows();
    } catch (error: any) {
      message.error(error?.response?.data?.error?.message ?? '저장하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const showPreview = async () => {
    if (!flowId) return;
    let did = '07000000000';
    Modal.confirm({
      title: '컴파일 미리보기',
      content: (
        <Space direction="vertical" style={{ width: '100%' }}>
          <Typography.Text type="secondary">미리보기에 쓸 대표번호를 입력하세요.</Typography.Text>
          <Input defaultValue={did} onChange={(event) => { did = event.target.value; }} />
        </Space>
      ),
      okText: '미리보기',
      cancelText: '취소',
      onOk: async () => {
        try {
          const { conf } = await previewArsFlow(flowId, did);
          Modal.info({
            title: '컴파일된 dialplan',
            width: 820,
            content: (
              <pre style={{ maxHeight: 480, overflow: 'auto', fontSize: 12, background: '#f6f6f6', padding: 12 }}>
                {conf}
              </pre>
            ),
          });
        } catch (error: any) {
          message.error(error?.response?.data?.error?.message ?? '미리보기를 만들지 못했습니다.');
        }
      },
    });
  };

  const createFlow = () => {
    let name = '';
    Modal.confirm({
      title: '새 플로우',
      content: <Input placeholder="플로우 이름" onChange={(event) => { name = event.target.value; }} />,
      okText: '만들기',
      cancelText: '취소',
      onOk: async () => {
        if (!name.trim()) { message.warning('이름을 입력하세요.'); return Promise.reject(); }
        try {
          const created = await createArsFlow({ name: name.trim() });
          await loadFlows();
          setFlowId(created.flowId);
        } catch (error: any) {
          message.error(error?.response?.data?.error?.message ?? '만들지 못했습니다.');
          return Promise.reject();
        }
      },
    });
  };

  const removeFlow = () => {
    if (!flowId) return;
    Modal.confirm({
      title: '이 플로우를 삭제할까요?',
      content: '이 플로우를 쓰던 DID 는 사라지지 않고 기존 경로로 되돌아갑니다.',
      okText: '삭제',
      okButtonProps: { danger: true },
      cancelText: '취소',
      onOk: async () => {
        await deleteArsFlow(flowId);
        setFlowId(null);
        setNodes([]);
        setEdges([]);
        await loadFlows();
      },
    });
  };

  return (
    <Card
      className="ars-builder"
      title="ARS 플로우 빌더"
      extra={
        <Space wrap>
          <Select
            style={{ minWidth: 200 }}
            placeholder="플로우 선택"
            value={flowId ?? undefined}
            onChange={setFlowId}
            options={flows.map((flow) => ({ value: flow.flowId, label: flow.name }))}
          />
          <Button icon={<ReloadOutlined />} onClick={() => flowId && loadGraph(flowId)} loading={loading}>
            새로고침
          </Button>
          <Button icon={<PlusOutlined />} disabled={!canCreate} onClick={createFlow}>새 플로우</Button>
          <Dropdown
            disabled={!flowId || !canUpdate}
            menu={{
              items: FLOW_NODE_TYPES.map((type) => ({ key: type, label: NODE_TYPE_LABELS[type] })),
              onClick: ({ key }) => addNode(key as FlowNodeType),
            }}
          >
            <Button type="dashed">노드 추가</Button>
          </Dropdown>
          <Button onClick={showPreview} disabled={!flowId}>컴파일 미리보기</Button>
          <Button onClick={runValidate} disabled={!flowId}>검증</Button>
          <Button type="primary" onClick={save} loading={saving} disabled={!flowId || !canUpdate}>저장</Button>
          <Button danger onClick={removeFlow} disabled={!flowId}>삭제</Button>
        </Space>
      }
    >
      {validation && (validation.errors.length > 0 || validation.warnings.length > 0) && (
        <Space className="ars-builder__issues" direction="vertical" size={8} style={{ width: '100%' }}>
          {validation.errors.length > 0 && (
            <Alert
              type="error"
              showIcon
              message="저장할 수 없습니다"
              description={
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {validation.errors.map((issue, index) => <li key={index}>{issue.message}</li>)}
                </ul>
              }
            />
          )}
          {validation.warnings.length > 0 && (
            <Alert
              type="warning"
              showIcon
              message="확인이 필요합니다 (저장은 됩니다)"
              description={
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {validation.warnings.map((issue, index) => <li key={index}>{issue.message}</li>)}
                </ul>
              }
            />
          )}
        </Space>
      )}

      {!flowId ? (
        <Empty description="플로우를 고르거나 새로 만드세요." />
      ) : (
        <Row gutter={12} className="ars-builder__workspace">
          <Col xs={24} lg={17} className="ars-builder__pane-col">
            <div className="ars-builder__pane">
              <ArsFlowCanvas
                nodes={nodes}
                edges={edges}
                selectedNodeId={selectedNodeId}
                onNodesChangeExternal={setNodes}
                onEdgesChangeExternal={setEdges}
                onSelectNode={setSelectedNodeId}
              />
            </div>
          </Col>
          <Col xs={24} lg={7} className="ars-builder__pane-col">
            <div className="ars-builder__pane ars-builder__pane--panel">
              <NodePropertiesPanel
                node={selectedNode}
                httpEndpoints={httpEndpoints}
                isEntry={selectedNode?.nodeId === entryNodeId}
                outgoing={outgoing}
                incoming={incoming}
                onChange={updateNode}
                onSetEntry={() => selectedNode && setEntry(selectedNode.nodeId)}
                onDelete={() => selectedNode && deleteNode(selectedNode.nodeId)}
                onEdgeDigitChange={(edgeId, digit) => setEdges((current) => current.map((edge) => (
                  edge.id === edgeId
                    ? { ...edge, label: `디지트 ${digit}`, data: { ...edge.data, digit } }
                    : edge
                )))}
                onEdgeDelete={(edgeId) => setEdges((current) => current.filter((edge) => edge.id !== edgeId))}
              />
            </div>
          </Col>
        </Row>
      )}
    </Card>
  );
}
