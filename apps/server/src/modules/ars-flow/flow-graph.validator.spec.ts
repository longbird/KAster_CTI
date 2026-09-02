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
      const result = validateFlowGraph(graph([node('p', 'PLAY', { promptKeys: ['custom/nope'] })], []), CONTEXT);

      expect(codes(result)).toContain('PROMPT_NOT_FOUND');
    });

    it('메뉴와 종료 안내 프롬프트도 검사한다', () => {
      const menu = validateFlowGraph(
        graph([node('m', 'MENU', { promptKey: 'custom/nope', timeoutSeconds: 5, maxRetries: 2 })], []),
        CONTEXT,
      );
      const hangup = validateFlowGraph(graph([node('h', 'HANGUP', { promptKey: 'custom/nope' })], []), CONTEXT);

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

describe('validateFlowGraph — 입력값 대상', () => {
  const collect = (nodeId: string) =>
    node(nodeId, 'COLLECT_DIGITS', {
      promptKey: 'menu', minDigits: 10, maxDigits: 11, timeoutSeconds: 5, maxRetries: 2,
    });

  it('입력을 받은 뒤에 쓰면 통과한다', () => {
    const result = validateFlowGraph(
      graph(
        [collect('ask'), node('reg', 'OPT_OUT', { action: 'REGISTER', targetSource: 'COLLECTED' }),
          node('bye', 'HANGUP', { promptKey: 'goodbye' })],
        [edge('ask', 'reg'), edge('ask', 'bye', 'TIMEOUT'), edge('reg', 'bye')],
      ),
      CONTEXT,
    );

    expect(result.errors).toEqual([]);
  });

  it('입력을 받기 전에 쓰면 막는다 — 빈 번호로 수신거부가 등록된다', () => {
    const result = validateFlowGraph(
      graph(
        [node('reg', 'OPT_OUT', { action: 'REGISTER', targetSource: 'COLLECTED' }),
          node('bye', 'HANGUP', { promptKey: 'goodbye' })],
        [edge('reg', 'bye')],
      ),
      CONTEXT,
    );

    expect(codes(result)).toContain('DIGITS_NOT_COLLECTED');
  });

  it('수집 실패(TIMEOUT) 경로로 들어와도 막는다 — 그 경로엔 입력값이 없다', () => {
    const result = validateFlowGraph(
      graph(
        [collect('ask'), node('sms', 'SMS', { smsTemplateId: 'tpl-1', targetSource: 'COLLECTED' }),
          node('bye', 'HANGUP', { promptKey: 'goodbye' })],
        [edge('ask', 'bye'), edge('ask', 'sms', 'TIMEOUT'), edge('sms', 'bye')],
      ),
      CONTEXT,
    );

    expect(codes(result)).toContain('DIGITS_NOT_COLLECTED');
  });

  it('발신번호를 쓰면 수집 노드가 없어도 통과한다', () => {
    const result = validateFlowGraph(
      graph(
        [node('reg', 'OPT_OUT', { action: 'REGISTER', targetSource: 'CALLER' }),
          node('bye', 'HANGUP', { promptKey: 'goodbye' })],
        [edge('reg', 'bye')],
      ),
      CONTEXT,
    );

    expect(result.errors).toEqual([]);
  });

  it('수집 노드의 안내 멘트도 실재해야 한다', () => {
    const result = validateFlowGraph(
      graph(
        [node('ask', 'COLLECT_DIGITS', { promptKey: 'custom/nope', minDigits: 1, maxDigits: 4, timeoutSeconds: 5, maxRetries: 2 }),
          node('bye', 'HANGUP', { promptKey: 'goodbye' })],
        [edge('ask', 'bye')],
      ),
      CONTEXT,
    );

    expect(codes(result)).toContain('PROMPT_NOT_FOUND');
  });

  it('입력을 기다리는 순환은 갇힌 것이 아니다 — 사람이 끊거나 다시 누를 수 있다', () => {
    const result = validateFlowGraph(
      graph(
        [collect('ask'), node('play', 'PLAY', { promptKeys: ['welcome'] })],
        [edge('ask', 'play'), edge('play', 'ask')],
      ),
      CONTEXT,
    );

    expect(codes(result)).not.toContain('TRAPPED_CYCLE');
  });
});

describe('validateFlowGraph — Asterisk 기본 안내', () => {
  it('custom/ 이 아닌 안내는 등록을 요구하지 않는다 — 기본 제공 사운드다', () => {
    const result = validateFlowGraph(
      graph(
        [node('p', 'PLAY', { promptKeys: ['vm-goodbye', 'beep'] }),
          node('bye', 'HANGUP', { promptKey: 'vm-goodbye' })],
        [edge('p', 'bye')],
      ),
      CONTEXT,
    );

    expect(result.errors).toEqual([]);
  });

  it('custom/ 안내는 여전히 등록되어 있어야 한다', () => {
    const result = validateFlowGraph(
      graph(
        [node('p', 'PLAY', { promptKeys: ['custom/nope'] }),
          node('bye', 'HANGUP', { promptKey: null })],
        [edge('p', 'bye')],
      ),
      CONTEXT,
    );

    expect(codes(result)).toContain('PROMPT_NOT_FOUND');
  });
});

describe('validateFlowGraph — HTTP_LOOKUP', () => {
  const CONTEXT_WITH_ENDPOINT: FlowValidationContext = {
    ...CONTEXT,
    httpEndpoints: [{ endpointId: 'ep-1', timeoutMs: 2000 }, { endpointId: 'ep-slow', timeoutMs: 4000 }],
  };

  const lookup = (nodeId: string, config: any = { endpointId: 'ep-1', waitPromptKey: null }) =>
    node(nodeId, 'HTTP_LOOKUP', config);

  it('맞음·안맞음 두 갈래가 다 있으면 통과한다', () => {
    const result = validateFlowGraph(
      graph(
        [lookup('ask'), node('vip', 'QUEUE', { queueName: 'sales' }), node('normal', 'QUEUE', { queueName: 'support' })],
        [edge('ask', 'vip', 'TRUE'), edge('ask', 'normal', 'FALSE')],
      ),
      CONTEXT_WITH_ENDPOINT,
    );

    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('등록되지 않은 엔드포인트는 막는다', () => {
    const result = validateFlowGraph(
      graph(
        [lookup('ask', { endpointId: 'nope', waitPromptKey: null }), node('q', 'QUEUE', { queueName: 'sales' })],
        [edge('ask', 'q', 'TRUE'), edge('ask', 'q', 'FALSE')],
      ),
      CONTEXT_WITH_ENDPOINT,
    );

    expect(codes(result)).toContain('HTTP_ENDPOINT_NOT_FOUND');
  });

  it('실패 연결이 없으면 저장을 막는다 — 조회가 실패하면 통화가 갈 곳을 잃는다', () => {
    const result = validateFlowGraph(
      graph(
        [lookup('ask'), node('vip', 'QUEUE', { queueName: 'sales' })],
        [edge('ask', 'vip', 'TRUE')],
      ),
      CONTEXT_WITH_ENDPOINT,
    );

    expect(codes(result)).toContain('HTTP_LOOKUP_WITHOUT_FALLBACK');
  });

  it('맞았을 때 갈 곳이 없으면 경고한다 — 조회할 이유가 없다', () => {
    const result = validateFlowGraph(
      graph(
        [lookup('ask'), node('q', 'QUEUE', { queueName: 'sales' })],
        [edge('ask', 'q', 'FALSE')],
      ),
      CONTEXT_WITH_ENDPOINT,
    );

    expect(result.errors).toEqual([]);
    expect(result.warnings.map((issue) => issue.code)).toContain('HTTP_LOOKUP_WITHOUT_MATCH_BRANCH');
  });

  it('한 경로에 조회가 셋이면 막는다 — 최악 대기가 15초다', () => {
    const result = validateFlowGraph(
      graph(
        [lookup('a'), lookup('b'), lookup('c'), node('q', 'QUEUE', { queueName: 'sales' })],
        [
          edge('a', 'b', 'TRUE'), edge('a', 'q', 'FALSE'),
          edge('b', 'c', 'TRUE'), edge('b', 'q', 'FALSE'),
          edge('c', 'q', 'TRUE'), edge('c', 'q', 'FALSE'),
        ],
      ),
      CONTEXT_WITH_ENDPOINT,
    );

    expect(codes(result)).toContain('TOO_MANY_HTTP_LOOKUPS');
  });

  it('갈라진 가지에 하나씩이면 괜찮다 — 한 통화가 다 겪지 않는다', () => {
    const result = validateFlowGraph(
      graph(
        [node('m', 'MENU', { promptKey: 'menu', timeoutSeconds: 5, maxRetries: 0 }),
          lookup('a'), lookup('b'), lookup('c'), node('q', 'QUEUE', { queueName: 'sales' })],
        [
          edge('m', 'a', 'DIGIT', '1'), edge('m', 'b', 'DIGIT', '2'), edge('m', 'c', 'DIGIT', '3'),
          edge('m', 'q', 'TIMEOUT'),
          edge('a', 'q', 'TRUE'), edge('a', 'q', 'FALSE'),
          edge('b', 'q', 'TRUE'), edge('b', 'q', 'FALSE'),
          edge('c', 'q', 'TRUE'), edge('c', 'q', 'FALSE'),
        ],
      ),
      CONTEXT_WITH_ENDPOINT,
    );

    expect(codes(result)).not.toContain('TOO_MANY_HTTP_LOOKUPS');
  });

  it('대기 안내에 느린 엔드포인트를 붙이면 경고한다', () => {
    const result = validateFlowGraph(
      graph(
        [lookup('ask', { endpointId: 'ep-slow', waitPromptKey: 'menu' }), node('q', 'QUEUE', { queueName: 'sales' })],
        [edge('ask', 'q', 'TRUE'), edge('ask', 'q', 'FALSE')],
      ),
      CONTEXT_WITH_ENDPOINT,
    );

    expect(result.warnings.map((issue) => issue.code)).toContain('HTTP_LOOKUP_WAIT_TOO_LONG');
  });

  it('대기 안내의 프롬프트도 실재해야 한다', () => {
    const result = validateFlowGraph(
      graph(
        [lookup('ask', { endpointId: 'ep-1', waitPromptKey: 'custom/nope' }), node('q', 'QUEUE', { queueName: 'sales' })],
        [edge('ask', 'q', 'TRUE'), edge('ask', 'q', 'FALSE')],
      ),
      CONTEXT_WITH_ENDPOINT,
    );

    expect(codes(result)).toContain('PROMPT_NOT_FOUND');
  });

  it('조회를 반복하는 순환은 갇힌 것이다 — 사람의 입력을 기다리지 않는다', () => {
    const result = validateFlowGraph(
      graph(
        [lookup('a'), node('p', 'PLAY', { promptKeys: ['welcome'] })],
        [edge('a', 'p', 'TRUE'), edge('a', 'p', 'FALSE'), edge('p', 'a')],
      ),
      CONTEXT_WITH_ENDPOINT,
    );

    expect(codes(result)).toContain('TRAPPED_CYCLE');
  });

  it('엔드포인트 목록이 없는 호출도 깨지지 않는다', () => {
    const result = validateFlowGraph(
      graph(
        [lookup('ask'), node('q', 'QUEUE', { queueName: 'sales' })],
        [edge('ask', 'q', 'TRUE'), edge('ask', 'q', 'FALSE')],
      ),
      CONTEXT,
    );

    expect(codes(result)).toContain('HTTP_ENDPOINT_NOT_FOUND');
  });
});
