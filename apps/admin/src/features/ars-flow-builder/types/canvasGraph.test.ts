import { describe, expect, it } from 'vitest';
import { canEdgeExist, edgeLabel, toCanvas, toGraphPayload } from './canvasGraph';
import type { FlowEdgeRow, FlowNodeRow } from './flowGraph';

const NODES: FlowNodeRow[] = [
  { nodeId: 'n1', nodeType: 'PLAY', label: '인사', config: { promptKeys: ['welcome'] }, posX: 10, posY: 20 },
  { nodeId: 'n2', nodeType: 'MENU', label: '메뉴', config: { promptKey: 'menu', timeoutSeconds: 5 }, posX: 200, posY: 20 },
  { nodeId: 'n3', nodeType: 'QUEUE', label: '영업', config: { queueName: 'sales' }, posX: 400, posY: 0 },
];
const EDGES: FlowEdgeRow[] = [
  { edgeId: 'e1', fromNodeId: 'n1', toNodeId: 'n2', condition: 'DEFAULT' },
  { edgeId: 'e2', fromNodeId: 'n2', toNodeId: 'n3', condition: 'DIGIT', digit: '1' },
];

describe('toCanvas', () => {
  it('노드를 좌표와 함께 캔버스로 옮긴다', () => {
    const { nodes } = toCanvas(NODES, EDGES, 'n1');

    expect(nodes).toHaveLength(3);
    expect(nodes[0].position).toEqual({ x: 10, y: 20 });
    expect(nodes[0].data.row.nodeId).toBe('n1');
  });

  it('진입 노드를 표시한다', () => {
    const { nodes } = toCanvas(NODES, EDGES, 'n2');

    expect(nodes.find((n) => n.id === 'n2')?.data.isEntry).toBe(true);
    expect(nodes.find((n) => n.id === 'n1')?.data.isEntry).toBe(false);
  });

  it('엣지에 조건 라벨을 붙인다', () => {
    const { edges } = toCanvas(NODES, EDGES, 'n1');

    expect(edges.find((e) => e.id === 'e2')?.label).toBe('디지트 1');
    expect(edges.find((e) => e.id === 'e1')?.label).toBe('다음');
  });
});

describe('toGraphPayload', () => {
  /** 좌표는 저장하되 컴파일에는 쓰이지 않는다. 서버가 그렇게 만들어져 있다. */
  it('캔버스 좌표를 그대로 실어 보낸다', () => {
    const { nodes, edges } = toCanvas(NODES, EDGES, 'n1');
    const moved = nodes.map((n) => (n.id === 'n1' ? { ...n, position: { x: 999, y: 888 } } : n));

    const payload = toGraphPayload(moved, edges, 'n1');

    expect(payload.nodes.find((n) => n.nodeId === 'n1')).toMatchObject({ posX: 999, posY: 888 });
  });

  it('진입 노드를 함께 보낸다', () => {
    const { nodes, edges } = toCanvas(NODES, EDGES, 'n2');

    expect(toGraphPayload(nodes, edges, 'n2').entryNodeId).toBe('n2');
  });

  it('왕복해도 그래프가 보존된다', () => {
    const { nodes, edges } = toCanvas(NODES, EDGES, 'n1');
    const payload = toGraphPayload(nodes, edges, 'n1');

    expect(payload.nodes.map((n) => n.nodeId).sort()).toEqual(['n1', 'n2', 'n3']);
    expect(payload.edges).toEqual([
      { edgeId: 'e1', fromNodeId: 'n1', toNodeId: 'n2', condition: 'DEFAULT', digit: null },
      { edgeId: 'e2', fromNodeId: 'n2', toNodeId: 'n3', condition: 'DIGIT', digit: '1' },
    ]);
  });

  it('좌표는 정수로 보낸다', () => {
    const { nodes, edges } = toCanvas(NODES, EDGES, 'n1');
    const moved = nodes.map((n) => ({ ...n, position: { x: 12.7, y: -3.2 } }));

    expect(toGraphPayload(moved, edges, 'n1').nodes[0]).toMatchObject({ posX: 13, posY: -3 });
  });
});

describe('canEdgeExist', () => {
  it('터미널 노드에서는 나갈 수 없다', () => {
    expect(canEdgeExist('QUEUE', 'DEFAULT')).toBe(false);
    expect(canEdgeExist('TRANSFER', 'DEFAULT')).toBe(false);
    expect(canEdgeExist('HANGUP', 'DEFAULT')).toBe(false);
  });

  it('메뉴는 디지트·시간초과·잘못된 입력으로 나간다', () => {
    expect(canEdgeExist('MENU', 'DIGIT')).toBe(true);
    expect(canEdgeExist('MENU', 'TIMEOUT')).toBe(true);
    expect(canEdgeExist('MENU', 'INVALID')).toBe(true);
    expect(canEdgeExist('MENU', 'DEFAULT')).toBe(false);
  });

  it('조건 분기는 참·거짓으로 나간다', () => {
    expect(canEdgeExist('CONDITION', 'TRUE')).toBe(true);
    expect(canEdgeExist('CONDITION', 'FALSE')).toBe(true);
    expect(canEdgeExist('CONDITION', 'DIGIT')).toBe(false);
  });

  it('나머지 노드는 다음으로만 나간다', () => {
    expect(canEdgeExist('PLAY', 'DEFAULT')).toBe(true);
    expect(canEdgeExist('SMS', 'DEFAULT')).toBe(true);
    expect(canEdgeExist('PLAY', 'DIGIT')).toBe(false);
  });
});

describe('edgeLabel', () => {
  it('디지트는 숫자를 함께 보여준다', () => {
    expect(edgeLabel({ condition: 'DIGIT', digit: '3' })).toBe('디지트 3');
  });

  it('디지트가 없으면 조건만 보여준다', () => {
    expect(edgeLabel({ condition: 'TIMEOUT' })).toBe('시간초과');
  });
});

describe('canEdgeExist — 번호 입력받기', () => {
  it('성공(다음)과 실패(시간초과) 둘만 나간다', () => {
    expect(canEdgeExist('COLLECT_DIGITS', 'DEFAULT')).toBe(true);
    expect(canEdgeExist('COLLECT_DIGITS', 'TIMEOUT')).toBe(true);
  });

  it('디지트나 참/거짓으로는 나가지 않는다', () => {
    expect(canEdgeExist('COLLECT_DIGITS', 'DIGIT')).toBe(false);
    expect(canEdgeExist('COLLECT_DIGITS', 'TRUE')).toBe(false);
    expect(canEdgeExist('COLLECT_DIGITS', 'INVALID')).toBe(false);
  });
});

describe('canEdgeExist — 외부 조회', () => {
  it('맞음·안맞음 둘로만 나간다', () => {
    expect(canEdgeExist('HTTP_LOOKUP', 'TRUE')).toBe(true);
    expect(canEdgeExist('HTTP_LOOKUP', 'FALSE')).toBe(true);
  });

  it('오류 전용 갈래를 만들지 않는다 — 실패도 안맞음으로 온다', () => {
    expect(canEdgeExist('HTTP_LOOKUP', 'DEFAULT')).toBe(false);
    expect(canEdgeExist('HTTP_LOOKUP', 'TIMEOUT')).toBe(false);
    expect(canEdgeExist('HTTP_LOOKUP', 'INVALID')).toBe(false);
  });
});
