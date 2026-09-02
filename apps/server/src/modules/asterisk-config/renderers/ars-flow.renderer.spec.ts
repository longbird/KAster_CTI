import { renderArsFlow } from './ars-flow.renderer';
import { renderDialplan } from './dialplan.renderer';
import type {
  FlowEdge,
  FlowGraph,
  FlowNode,
  FlowNodeType,
} from '../../ars-flow/flow-graph.types';

function node(nodeId: string, nodeType: FlowNodeType, config: any, label = nodeId): FlowNode {
  return { nodeId, nodeType, label, config };
}

function edge(
  from: string,
  to: string,
  condition: FlowEdge['condition'] = 'DEFAULT',
  digit?: string,
): FlowEdge {
  return { edgeId: `${from}->${to}:${condition}${digit ?? ''}`, fromNodeId: from, toNodeId: to, condition, digit };
}

function graph(nodes: FlowNode[], edges: FlowEdge[], entryNodeId = nodes[0].nodeId): FlowGraph {
  return { flowId: 'flow-1', name: '대표번호 안내', entryNodeId, nodes, edges };
}

const RENDER_ARGS = { did: '16001234', tenantId: 'tenant-1', branchId: 'branch-1' };

function render(g: FlowGraph) {
  return renderArsFlow({ graph: g, ...RENDER_ARGS });
}

/** 렌더 결과에서 관찰 가능한 사실만 뽑는다. 컨텍스트 이름·라벨 같은 형식은 보지 않는다. */
function observable(conf: string) {
  const playbacks = [...conf.matchAll(/(?:Playback|Background)\(([^)]*)\)/g)].map((m) => m[1]);
  const waitExten = conf.match(/WaitExten\((\d+)\)/)?.[1] ?? null;
  const digitTargets: Record<string, string> = {};
  for (const line of conf.split('\n')) {
    const match = line.match(/^exten => (\d),1,(.*)$/);
    if (match) digitTargets[match[1]] = match[2].trim();
  }
  const timeoutBlock = conf
    .split('\n')
    .slice(conf.split('\n').findIndex((line) => line.startsWith('exten => t,1,')))
    .filter((line) => line.startsWith('exten => t,1,') || line.startsWith(' same => n,'))
    .map((line) => line.replace(/^(exten => t,1,| same => n,)/, '').trim());
  return { playbacks, waitExten, digitTargets, timeoutBlock };
}

describe('renderArsFlow', () => {
  describe('기본 구조', () => {
    it('플로우 이름으로 컨텍스트를 만들고 진입에서 시작한다', () => {
      const conf = render(
        graph([node('bye', 'HANGUP', { promptKey: 'goodbye' })], []),
      );

      expect(conf).toContain('[ars-flow-');
      expect(conf).toMatch(/exten => s,1,NoOp\(/);
      expect(conf).toContain('Answer()');
    });

    it('훅이 쓰는 채널 변수를 진입에서 심는다', () => {
      const conf = render(graph([node('bye', 'HANGUP', { promptKey: null })], []));

      expect(conf).toContain('Set(__SMART_ARS_TENANT_ID=tenant-1)');
      expect(conf).toContain('Set(__SMART_ARS_BRANCH_ID=branch-1)');
      expect(conf).toContain('Set(__ENTRY_DID=16001234)');
    });

    it('지점이 없으면 - 로 채운다', () => {
      const conf = renderArsFlow({
        graph: graph([node('bye', 'HANGUP', { promptKey: null })], []),
        ...RENDER_ARGS,
        branchId: null,
      });

      expect(conf).toContain('Set(__SMART_ARS_BRANCH_ID=-)');
    });
  });

  describe('노드 컴파일', () => {
    it('PLAY 는 프롬프트를 순서대로 재생하고 다음으로 넘어간다', () => {
      const conf = render(
        graph(
          [node('p', 'PLAY', { promptKeys: ['welcome', 'notice'] }), node('q', 'QUEUE', { queueName: 'sales' })],
          [edge('p', 'q')],
        ),
      );

      expect(conf).toContain('Playback(welcome)');
      expect(conf).toContain('Playback(notice)');
      expect(conf).toContain('Goto(queue-entry,sales,1)');
    });

    // 큐·전환·종료는 점프 지점에서 곧바로 끝난다. 라벨을 하나 더 거치게 하면
    // 읽는 사람도 통화도 이유 없이 한 칸 더 돈다.
    it('터미널 노드는 점프 지점에 인라인되고 별도 라벨을 만들지 않는다', () => {
      const conf = render(
        graph(
          [node('p', 'PLAY', { promptKeys: ['welcome'] }), node('q', 'QUEUE', { queueName: 'sales' })],
          [edge('p', 'q')],
        ),
      );

      expect(conf).toContain('Goto(queue-entry,sales,1)');
      expect(conf).not.toMatch(/\(node-\d+-q\)/);
    });

    it('MENU 는 자기 컨텍스트를 갖는다', () => {
      const conf = render(
        graph(
          [
            node('m', 'MENU', { promptKey: 'menu', timeoutSeconds: 7, maxRetries: 2 }),
            node('q', 'QUEUE', { queueName: 'sales' }),
          ],
          [edge('m', 'q', 'DIGIT', '1')],
        ),
      );

      expect(conf).toMatch(/\[ars-flow-[a-z0-9-]+-[a-z0-9-]+\]/);
      expect(conf).toContain('Background(menu)');
      expect(conf).toContain('WaitExten(7)');
      expect(conf).toContain('exten => 1,1,Goto(queue-entry,sales,1)');
    });

    it('MENU 의 타임아웃과 잘못된 입력을 연결한다', () => {
      const conf = render(
        graph(
          [
            node('m', 'MENU', { promptKey: null, timeoutSeconds: 5, maxRetries: 2 }),
            node('bye', 'HANGUP', { promptKey: 'goodbye' }),
            node('again', 'HANGUP', { promptKey: null }),
          ],
          [edge('m', 'bye', 'TIMEOUT'), edge('m', 'again', 'INVALID')],
        ),
      );

      expect(conf).toContain('exten => t,1,');
      expect(conf).toContain('exten => i,1,');
    });

    it('연결되지 않은 타임아웃은 끊는 것으로 마감한다', () => {
      const conf = render(
        graph([node('m', 'MENU', { promptKey: null, timeoutSeconds: 5, maxRetries: 2 })], []),
      );

      expect(conf).toContain('exten => t,1,Hangup()');
    });

    it('TRANSFER 는 transfer-target 으로 보낸다', () => {
      const conf = render(graph([node('t', 'TRANSFER', { transferNumber: '025551234' })], []));

      expect(conf).toContain('Goto(transfer-target,025551234,1)');
    });

    it('HANGUP 은 안내를 재생하고 끊는다', () => {
      const conf = render(graph([node('h', 'HANGUP', { promptKey: 'goodbye' })], []));

      expect(conf).toContain('Playback(goodbye)');
      expect(conf).toContain('Hangup()');
    });

    it('CONDITION 은 GotoIfTime 으로 갈라진다', () => {
      const conf = render(
        graph(
          [
            node('c', 'CONDITION', {
              conditionType: 'TIME_RANGE',
              timeStart: '09:00',
              timeEnd: '18:00',
              daysOfWeek: ['mon', 'tue'],
            }),
            node('open', 'QUEUE', { queueName: 'sales' }),
            node('closed', 'HANGUP', { promptKey: null }),
          ],
          [edge('c', 'open', 'TRUE'), edge('c', 'closed', 'FALSE')],
        ),
      );

      expect(conf).toContain('GotoIfTime(09:00-18:00,mon&tue,*,*?');
    });
  });

  describe('훅 재사용', () => {
    it('SMS 는 Smart ARS 훅을 그대로 부른다', () => {
      const conf = render(graph([node('s', 'SMS', { smsTemplateId: 'tpl-1' })], []));

      expect(conf).toContain('kaster-smart-ars-hook.sh');
      expect(conf).toContain("Set(__SMART_ARS_SELECTED_SMS_TEMPLATE=tpl-1)");
      expect(conf).toContain('System(');
    });

    it('OPT_OUT 은 수신거부 훅을 그대로 부른다', () => {
      const conf = render(graph([node('o', 'OPT_OUT', { action: 'REGISTER' })], []));

      expect(conf).toContain('kaster-opt-out-hook.sh');
      expect(conf).toContain("'register'");
    });

    it('수신거부 해제도 같은 훅으로 간다', () => {
      const conf = render(graph([node('o', 'OPT_OUT', { action: 'UNREGISTER' })], []));

      expect(conf).toContain("'unregister'");
    });
  });

  describe('안전', () => {
    it('도달하지 못하는 노드는 렌더하지 않는다', () => {
      const conf = render(
        graph(
          [node('a', 'HANGUP', { promptKey: null }), node('orphan', 'PLAY', { promptKeys: ['orphan-prompt'] })],
          [],
        ),
      );

      expect(conf).not.toContain('orphan-prompt');
    });

    it('개행이 든 값은 던진다', () => {
      expect(() =>
        render(graph([node('q', 'QUEUE', { queueName: 'sales\nexten => 9,1,Hangup()' })], [])),
      ).toThrow(/newline/i);
    });

    // 한글 이름은 toSlug 를 지나면 아무것도 남지 않는다. 그때는 flowId 로 만든다.
    it('이름에 쓸 수 있는 문자가 없으면 flowId 로 컨텍스트를 만든다', () => {
      const g = graph([node('h', 'HANGUP', { promptKey: null })], []);

      expect(renderArsFlow({ graph: { ...g, name: '대표번호 안내' }, ...RENDER_ARGS }))
        .toContain('[ars-flow-flow-1]');
    });

    it('이름도 id 도 못 쓰면 던진다', () => {
      const g = graph([node('h', 'HANGUP', { promptKey: null })], []);
      expect(() => renderArsFlow({ graph: { ...g, name: '!!!', flowId: '!!!' }, ...RENDER_ARGS }))
        .toThrow(/slug/i);
    });

    it('진입 노드가 없으면 던진다', () => {
      const g = graph([node('h', 'HANGUP', { promptKey: null })], []);
      expect(() => renderArsFlow({ graph: { ...g, entryNodeId: 'ghost' }, ...RENDER_ARGS })).toThrow(/entry/i);
    });
  });

  describe('결정성', () => {
    // 같은 그래프가 매번 같은 문자열이어야 적용 전 diff 가 의미를 갖는다.
    it('노드와 엣지 순서를 바꿔도 결과가 같다', () => {
      const nodes = [
        node('m', 'MENU', { promptKey: 'menu', timeoutSeconds: 5, maxRetries: 2 }),
        node('q1', 'QUEUE', { queueName: 'sales' }),
        node('q2', 'QUEUE', { queueName: 'support' }),
        node('bye', 'HANGUP', { promptKey: 'goodbye' }),
      ];
      const edges = [
        edge('m', 'q1', 'DIGIT', '1'),
        edge('m', 'q2', 'DIGIT', '2'),
        edge('m', 'bye', 'TIMEOUT'),
      ];

      const first = render(graph(nodes, edges, 'm'));
      const second = render(graph([...nodes].reverse(), [...edges].reverse(), 'm'));

      expect(second).toBe(first);
    });
  });

  // 이 단계의 합격 기준. 형식이 아니라 통화가 겪는 사실이 같아야 한다.
  describe('기존 단층 IVR 과의 동등성', () => {
    it('같은 안내·같은 대기·같은 디지트 라우팅·같은 종료를 만든다', () => {
      const legacyConf = renderDialplan({
        dids: [
          {
            id: 'did-1',
            did: '16001234',
            description: null,
            ivrMenuId: 'menu-1',
            directQueue: null,
            enabled: true,
          },
        ],
        ivrMenus: [
          {
            id: 'menu-1',
            name: 'main-menu',
            welcomePrompt: 'welcome',
            menuPrompt: 'menu',
            timeoutSecs: 5,
            entries: [
              { id: 'e1', tenantId: 't', menuId: 'menu-1', digit: '1', label: '영업', queueName: 'sales' },
              { id: 'e2', tenantId: 't', menuId: 'menu-1', digit: '2', label: '지원', queueName: 'support' },
            ],
          },
        ],
      }).extensionsQueue;

      const legacyMenuContext = legacyConf
        .split('\n\n')
        .find((block) => block.startsWith('[ivr-menu-')) as string;

      const flowConf = render(
        graph(
          [
            node('welcome', 'PLAY', { promptKeys: ['welcome'] }),
            node('menu', 'MENU', { promptKey: 'menu', timeoutSeconds: 5, maxRetries: 2 }),
            node('q1', 'QUEUE', { queueName: 'sales' }),
            node('q2', 'QUEUE', { queueName: 'support' }),
            node('bye', 'HANGUP', { promptKey: 'vm-goodbye' }),
          ],
          [
            edge('welcome', 'menu'),
            edge('menu', 'q1', 'DIGIT', '1'),
            edge('menu', 'q2', 'DIGIT', '2'),
            edge('menu', 'bye', 'TIMEOUT'),
          ],
          'welcome',
        ),
      );

      const legacy = observable(legacyMenuContext);
      const flow = observable(flowConf);

      expect(flow.playbacks).toEqual(legacy.playbacks);
      expect(flow.waitExten).toBe(legacy.waitExten);
      expect(flow.digitTargets).toEqual(legacy.digitTargets);
      expect(flow.timeoutBlock).toEqual(legacy.timeoutBlock);
    });
  });
});
