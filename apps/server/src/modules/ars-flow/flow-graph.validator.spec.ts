import { validateFlowGraph, type FlowValidationContext } from './flow-graph.validator';
import type { FlowEdge, FlowGraph, FlowNode, FlowNodeType } from './flow-graph.types';

const CONTEXT: FlowValidationContext = {
  queueNames: ['sales', 'support'],
  promptKeys: ['welcome', 'menu', 'goodbye'],
  smsTemplateIds: ['tpl-1'],
};

function node(nodeId: string, nodeType: FlowNodeType, config: any = {}): FlowNode {
  return { nodeId, nodeType, label: nodeId, config };
}

function edge(from: string, to: string, condition: FlowEdge['condition'] = 'DEFAULT', digit?: string): FlowEdge {
  return { edgeId: `${from}->${to}:${condition}${digit ?? ''}`, fromNodeId: from, toNodeId: to, condition, digit };
}

function graph(nodes: FlowNode[], edges: FlowEdge[], entryNodeId = nodes[0]?.nodeId ?? 'missing'): FlowGraph {
  return { flowId: 'flow-1', name: '테스트 플로우', entryNodeId, nodes, edges };
}

function codes(result: { errors: Array<{ code: string }> }) {
  return result.errors.map((issue) => issue.code);
}

describe('validateFlowGraph', () => {
  it('정상 그래프는 오류도 경고도 없다', () => {
    const result = validateFlowGraph(
      graph(
        [
          node('menu', 'MENU', { promptKey: 'menu', timeoutSeconds: 5, maxRetries: 2 }),
          node('q1', 'QUEUE', { queueName: 'sales' }),
          node('bye', 'HANGUP', { promptKey: 'goodbye' }),
        ],
        [edge('menu', 'q1', 'DIGIT', '1'), edge('menu', 'bye', 'TIMEOUT')],
      ),
      CONTEXT,
    );

    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  describe('1. 진입 노드', () => {
    it('진입 노드가 없는 id 를 가리키면 오류', () => {
      const result = validateFlowGraph(graph([node('a', 'HANGUP', { promptKey: null })], [], 'nope'), CONTEXT);

      expect(codes(result)).toContain('ENTRY_NODE_NOT_FOUND');
    });

    it('노드가 하나도 없으면 오류', () => {
      const result = validateFlowGraph(graph([], [], 'nope'), CONTEXT);

      expect(codes(result)).toContain('ENTRY_NODE_NOT_FOUND');
    });
  });

  describe('2. 엣지 목적지', () => {
    it('없는 노드로 가는 엣지는 오류', () => {
      const result = validateFlowGraph(
        graph([node('a', 'MENU', { promptKey: null, timeoutSeconds: 5, maxRetries: 2 })], [edge('a', 'ghost')]),
        CONTEXT,
      );

      expect(codes(result)).toContain('EDGE_TARGET_NOT_FOUND');
    });

    it('없는 노드에서 나오는 엣지도 오류', () => {
      const result = validateFlowGraph(
        graph([node('a', 'HANGUP', { promptKey: null })], [edge('ghost', 'a')]),
        CONTEXT,
      );

      expect(codes(result)).toContain('EDGE_SOURCE_NOT_FOUND');
    });
  });

  describe('3. 도달 가능성', () => {
    // 편집 중일 수 있으므로 저장을 막지 않는다.
    it('도달 못 하는 노드는 오류가 아니라 경고다', () => {
      const result = validateFlowGraph(
        graph(
          [node('a', 'HANGUP', { promptKey: null }), node('orphan', 'HANGUP', { promptKey: null })],
          [],
        ),
        CONTEXT,
      );

      expect(result.errors).toEqual([]);
      expect(result.warnings.map((issue) => issue.code)).toContain('UNREACHABLE_NODE');
      expect(result.warnings[0].nodeId).toBe('orphan');
    });
  });

  describe('4. 메뉴 디지트', () => {
    it('한 메뉴에서 디지트가 겹치면 오류', () => {
      const result = validateFlowGraph(
        graph(
          [
            node('menu', 'MENU', { promptKey: null, timeoutSeconds: 5, maxRetries: 2 }),
            node('q1', 'QUEUE', { queueName: 'sales' }),
            node('q2', 'QUEUE', { queueName: 'support' }),
          ],
          [edge('menu', 'q1', 'DIGIT', '1'), edge('menu', 'q2', 'DIGIT', '1')],
        ),
        CONTEXT,
      );

      expect(codes(result)).toContain('DUPLICATE_MENU_DIGIT');
    });

    it('다른 메뉴에서 같은 디지트를 쓰는 것은 괜찮다', () => {
      const result = validateFlowGraph(
        graph(
          [
            node('m1', 'MENU', { promptKey: null, timeoutSeconds: 5, maxRetries: 2 }),
            node('m2', 'MENU', { promptKey: null, timeoutSeconds: 5, maxRetries: 2 }),
            node('q1', 'QUEUE', { queueName: 'sales' }),
          ],
          [edge('m1', 'm2', 'DIGIT', '1'), edge('m2', 'q1', 'DIGIT', '1')],
        ),
        CONTEXT,
      );

      expect(codes(result)).not.toContain('DUPLICATE_MENU_DIGIT');
    });
  });

  describe('5. 대상 실재', () => {
    it('등록되지 않은 큐는 오류', () => {
      const result = validateFlowGraph(graph([node('q', 'QUEUE', { queueName: 'ghost-queue' })], []), CONTEXT);

      expect(codes(result)).toContain('QUEUE_NOT_FOUND');
      expect(result.errors[0].message).toContain('ghost-queue');
    });

    it('등록되지 않은 프롬프트는 오류', () => {
      const result = validateFlowGraph(graph([node('p', 'PLAY', { promptKeys: ['nope'] })], []), CONTEXT);

      expect(codes(result)).toContain('PROMPT_NOT_FOUND');
    });

    it('메뉴와 종료 안내 프롬프트도 검사한다', () => {
      const menu = validateFlowGraph(
        graph([node('m', 'MENU', { promptKey: 'nope', timeoutSeconds: 5, maxRetries: 2 })], []),
        CONTEXT,
      );
      const hangup = validateFlowGraph(graph([node('h', 'HANGUP', { promptKey: 'nope' })], []), CONTEXT);

      expect(codes(menu)).toContain('PROMPT_NOT_FOUND');
      expect(codes(hangup)).toContain('PROMPT_NOT_FOUND');
    });

    it('안내가 없는 종료 노드는 검사할 것이 없다', () => {
      const result = validateFlowGraph(graph([node('h', 'HANGUP', { promptKey: null })], []), CONTEXT);

      expect(result.errors).toEqual([]);
    });

    it('등록되지 않은 문자 템플릿은 오류', () => {
      const result = validateFlowGraph(graph([node('s', 'SMS', { smsTemplateId: 'ghost' })], []), CONTEXT);

      expect(codes(result)).toContain('SMS_TEMPLATE_NOT_FOUND');
    });
  });

  describe('6. 깊이', () => {
    it('상한을 넘으면 오류', () => {
      const nodes = Array.from({ length: 13 }, (_, index) => node(`n${index}`, 'PLAY', { promptKeys: ['welcome'] }));
      const edges = nodes.slice(0, -1).map((current, index) => edge(current.nodeId, nodes[index + 1].nodeId));

      const result = validateFlowGraph(graph(nodes, edges), CONTEXT);

      expect(codes(result)).toContain('DEPTH_EXCEEDED');
    });

    it('상한 이내면 통과', () => {
      const nodes = Array.from({ length: 5 }, (_, index) => node(`n${index}`, 'PLAY', { promptKeys: ['welcome'] }));
      const edges = nodes.slice(0, -1).map((current, index) => edge(current.nodeId, nodes[index + 1].nodeId));

      expect(codes(validateFlowGraph(graph(nodes, edges), CONTEXT))).not.toContain('DEPTH_EXCEEDED');
    });
  });

  describe('7. 탈출구 없는 순환', () => {
    // 이 검사가 없으면 고객이 끊을 때까지 안내만 반복된다.
    it('메뉴 없는 순환은 오류', () => {
      const result = validateFlowGraph(
        graph(
          [
            node('p1', 'PLAY', { promptKeys: ['welcome'] }),
            node('p2', 'PLAY', { promptKeys: ['menu'] }),
          ],
          [edge('p1', 'p2'), edge('p2', 'p1')],
        ),
        CONTEXT,
      );

      expect(codes(result)).toContain('TRAPPED_CYCLE');
    });

    it('자기 자신으로 도는 엣지도 오류', () => {
      const result = validateFlowGraph(
        graph([node('p1', 'PLAY', { promptKeys: ['welcome'] })], [edge('p1', 'p1')]),
        CONTEXT,
      );

      expect(codes(result)).toContain('TRAPPED_CYCLE');
    });

    // 메뉴가 끼어 있으면 사람이 다른 디지트를 눌러 빠져나갈 수 있다.
    it('순환에 메뉴가 있으면 통과', () => {
      const result = validateFlowGraph(
        graph(
          [
            node('menu', 'MENU', { promptKey: 'menu', timeoutSeconds: 5, maxRetries: 2 }),
            node('p1', 'PLAY', { promptKeys: ['welcome'] }),
          ],
          [edge('menu', 'p1', 'DIGIT', '1'), edge('p1', 'menu')],
        ),
        CONTEXT,
      );

      expect(codes(result)).not.toContain('TRAPPED_CYCLE');
    });

    it('순환이 있어도 깊이 계산이 끝난다', () => {
      const result = validateFlowGraph(
        graph(
          [
            node('menu', 'MENU', { promptKey: 'menu', timeoutSeconds: 5, maxRetries: 2 }),
            node('p1', 'PLAY', { promptKeys: ['welcome'] }),
          ],
          [edge('menu', 'p1', 'DIGIT', '1'), edge('p1', 'menu')],
        ),
        CONTEXT,
      );

      expect(codes(result)).not.toContain('DEPTH_EXCEEDED');
    });
  });

  it('오류가 여러 개면 전부 모아서 준다', () => {
    const result = validateFlowGraph(
      graph([node('q', 'QUEUE', { queueName: 'ghost' })], [edge('q', 'nowhere')], 'missing'),
      CONTEXT,
    );

    expect(codes(result)).toEqual(
      expect.arrayContaining(['ENTRY_NODE_NOT_FOUND', 'EDGE_TARGET_NOT_FOUND', 'QUEUE_NOT_FOUND']),
    );
  });
});
