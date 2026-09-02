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
            // 기존 단층 IVR 은 시간초과에 재시도가 없다. 동등한 그래프의 재시도는 0 이어야 한다.
            node('menu', 'MENU', { promptKey: 'menu', timeoutSeconds: 5, maxRetries: 0 }),
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

describe('renderArsFlow — COLLECT_DIGITS', () => {
  const collectConfig = {
    promptKey: 'custom/enter_number',
    minDigits: 10,
    maxDigits: 11,
    timeoutSeconds: 8,
    maxRetries: 2,
  };

  it('안내를 틀고 자릿수만큼 받는다', () => {
    const conf = render(
      graph(
        [node('ask', 'COLLECT_DIGITS', collectConfig, '번호입력'),
          node('bye', 'HANGUP', { promptKey: null })],
        [edge('ask', 'bye')],
      ),
    );

    expect(conf).toContain('Read(ARS_COLLECT_INPUT,/var/lib/asterisk/sounds/custom/enter_number,11,,1,8)');
    expect(conf).toContain('Set(__ARS_COLLECTED_DIGITS=${FILTER(0-9,${ARS_COLLECT_INPUT})})');
  });

  it('자릿수를 채우면 성공 경로로, 못 채우면 다시 묻는다', () => {
    const conf = render(
      graph(
        [node('ask', 'COLLECT_DIGITS', collectConfig, '번호입력'),
          node('q', 'QUEUE', { queueName: 'sales' }),
          node('bye', 'HANGUP', { promptKey: null })],
        [edge('ask', 'q'), edge('ask', 'bye', 'TIMEOUT')],
      ),
    );

    const lines = conf.split('\n').map((line) => line.trim());
    const readLabel = lines.find((line) => line.includes('Read(ARS_COLLECT_INPUT'))?.match(/n\(([^)]+)\)/)?.[1];
    expect(readLabel).toBeTruthy();

    // 자릿수 미달이면 재시도 라벨로 되돌아간다.
    expect(conf).toContain(`?${readLabel})`);
    // 재시도를 소진하면 TIMEOUT 간선으로 나간다.
    expect(conf).toContain('Goto(queue-entry,sales,1)');
    expect(conf).toContain('Hangup()');
  });

  it('재시도가 소진되면 TIMEOUT 간선으로 나간다', () => {
    const conf = render(
      graph(
        [node('ask', 'COLLECT_DIGITS', collectConfig, '번호입력'),
          node('ok', 'QUEUE', { queueName: 'sales' }),
          node('fail', 'QUEUE', { queueName: 'support' })],
        [edge('ask', 'ok'), edge('ask', 'fail', 'TIMEOUT')],
      ),
    );

    const retryGuard = conf.split('\n').find((line) => line.includes('ARS_COLLECT_RETRY') && line.includes('GotoIf'));
    expect(retryGuard).toBeTruthy();
    // 재시도 한도 다음 줄이 실패 경로여야 한다.
    const lines = conf.split('\n');
    const guardIndex = lines.indexOf(retryGuard as string);
    expect(lines[guardIndex + 1]).toContain('Goto(queue-entry,support,1)');
  });

  it('안내가 없으면 파일 인자를 비운다', () => {
    const conf = render(
      graph(
        [node('ask', 'COLLECT_DIGITS', { ...collectConfig, promptKey: null }, '번호입력'),
          node('bye', 'HANGUP', { promptKey: null })],
        [edge('ask', 'bye')],
      ),
    );

    expect(conf).toContain('Read(ARS_COLLECT_INPUT,,11,,1,8)');
  });

  it('재시도 카운터 변수명에 하이픈이 들어가지 않는다 — Asterisk 변수명이 아니다', () => {
    const conf = render(
      graph(
        [node('ask', 'COLLECT_DIGITS', collectConfig, '번호입력'),
          node('bye', 'HANGUP', { promptKey: null })],
        [edge('ask', 'bye')],
      ),
    );

    for (const match of conf.matchAll(/Set\(__(ARS_COLLECT_RETRY_[^=]*)=/g)) {
      expect(match[1]).toMatch(/^[A-Za-z0-9_]+$/);
    }
  });
});

describe('renderArsFlow — 대상 번호 출처', () => {
  it('기본은 발신번호다', () => {
    const conf = render(graph([node('o', 'OPT_OUT', { action: 'REGISTER', targetSource: 'CALLER' })], []));

    expect(conf).toContain('Set(__OPT_OUT_TARGET_PHONE=${CALLERID(num)})');
  });

  it('수신거부 대상을 입력값으로 바꾼다 — 요청자는 여전히 발신번호다', () => {
    const conf = render(graph([node('o', 'OPT_OUT', { action: 'REGISTER', targetSource: 'COLLECTED' })], []));

    expect(conf).toContain('Set(__REQUESTER_PHONE=${CALLERID(num)})');
    expect(conf).toContain('Set(__OPT_OUT_TARGET_PHONE=${ARS_COLLECTED_DIGITS})');
  });

  it('문자 수신자를 입력값으로 바꾼다', () => {
    const caller = render(graph([node('s', 'SMS', { smsTemplateId: 'tpl-1', targetSource: 'CALLER' })], []));
    const collected = render(graph([node('s', 'SMS', { smsTemplateId: 'tpl-1', targetSource: 'COLLECTED' })], []));

    expect(caller).toContain("'${CALLERID(num)}'");
    expect(collected).toContain("'${ARS_COLLECTED_DIGITS}'");
    expect(collected).not.toContain("'${CALLERID(num)}'");
  });
});

describe('renderArsFlow — 안내 파일 경로', () => {
  it('custom/ 안내는 절대경로로 바꾼다 — 기존 렌더러와 같은 규칙이다', () => {
    const conf = render(
      graph(
        [node('p', 'PLAY', { promptKeys: ['custom/welcome', 'vm-goodbye'] }),
          node('bye', 'HANGUP', { promptKey: 'custom/thanks' })],
        [edge('p', 'bye')],
      ),
    );

    expect(conf).toContain('Playback(/var/lib/asterisk/sounds/custom/welcome)');
    expect(conf).toContain('Playback(vm-goodbye)');
    expect(conf).toContain('Playback(/var/lib/asterisk/sounds/custom/thanks)');
    expect(conf).not.toContain('Playback(custom/');
  });

  it('메뉴와 번호 입력의 안내에도 같은 규칙을 쓴다', () => {
    const conf = render(
      graph(
        [node('m', 'MENU', { promptKey: 'custom/main', timeoutSeconds: 5, maxRetries: 0 }),
          node('ask', 'COLLECT_DIGITS', {
            promptKey: 'custom/enter', minDigits: 1, maxDigits: 4, timeoutSeconds: 5, maxRetries: 0,
          }),
          node('bye', 'HANGUP', { promptKey: null })],
        [edge('m', 'ask', 'DIGIT', '1'), edge('ask', 'bye'), edge('m', 'bye', 'TIMEOUT')],
      ),
    );

    expect(conf).toContain('Background(/var/lib/asterisk/sounds/custom/main)');
    expect(conf).toContain('Read(ARS_COLLECT_INPUT,/var/lib/asterisk/sounds/custom/enter,4,,1,5)');
  });

  it('진입에서 채널 언어를 비운다 — 안내가 언어 하위 디렉터리에서 안 찾아지면 무음이 된다', () => {
    const conf = render(graph([node('bye', 'HANGUP', { promptKey: null })], []));

    expect(conf).toContain('Set(CHANNEL(language)=)');
  });
});

describe('renderArsFlow — 메뉴 재시도', () => {
  const menuGraph = (maxRetries: number) =>
    graph(
      [node('m', 'MENU', { promptKey: 'menu', timeoutSeconds: 5, maxRetries }, '메인'),
        node('q', 'QUEUE', { queueName: 'sales' }),
        node('bye', 'HANGUP', { promptKey: 'vm-goodbye' })],
      [edge('m', 'q', 'DIGIT', '1'), edge('m', 'bye', 'TIMEOUT')],
    );

  it('재시도가 있으면 안내부터 다시 튼다', () => {
    const conf = render(menuGraph(2));

    expect(conf).toMatch(/same => n\(prompt\),Background\(menu\)/);
    expect(conf).toMatch(/exten => t,1,Set\(__ARS_MENU_RETRY_[A-Za-z0-9_]+=\$\[\$\{ARS_MENU_RETRY_[A-Za-z0-9_]+\}\+1\]\)/);
    expect(conf).toMatch(/GotoIf\(\$\[\$\{ARS_MENU_RETRY_[A-Za-z0-9_]+\}<=2\]\?s,prompt\)/);
  });

  it('재시도를 다 쓰면 시간초과 연결로 나간다', () => {
    const lines = render(menuGraph(2)).split('\n');
    const guardIndex = lines.findIndex((line) => line.includes('?s,prompt)'));

    expect(lines[guardIndex + 1]).toContain('Playback(vm-goodbye)');
  });

  it('재시도가 0 이면 카운터를 만들지 않는다 — 기존 단층 IVR 과 같은 모양을 유지한다', () => {
    const conf = render(menuGraph(0));

    expect(conf).not.toContain('ARS_MENU_RETRY');
    expect(conf).toContain('exten => t,1,Playback(vm-goodbye)');
  });
});

describe('renderArsFlow — HTTP_LOOKUP', () => {
  const lookupGraph = (config: any = { endpointId: 'ep-1', waitPromptKey: null }) =>
    graph(
      [node('ask', 'HTTP_LOOKUP', config, '등급조회'),
        node('vip', 'QUEUE', { queueName: 'sales' }),
        node('normal', 'QUEUE', { queueName: 'support' })],
      [edge('ask', 'vip', 'TRUE'), edge('ask', 'normal', 'FALSE')],
    );

  it('AGI 를 부르고 결과로 분기한다', () => {
    const conf = render(lookupGraph());

    expect(conf).toContain('AGI(/var/lib/asterisk/sounds/custom/kaster-ars-http-lookup.agi,ep-1)');
    expect(conf).toContain('GotoIf($["${ARS_LOOKUP_STATUS}"="MATCH"]?');
  });

  it('맞으면 TRUE, 아니면 FALSE 로 간다', () => {
    const lines = render(lookupGraph()).split('\n');
    const guardIndex = lines.findIndex((line) => line.includes('ARS_LOOKUP_STATUS'));
    const matchLabel = lines[guardIndex].match(/\?([A-Za-z0-9_-]+)\)/)?.[1];

    // 조건 바로 다음 줄이 실패 경로다.
    expect(lines[guardIndex + 1]).toContain('Goto(queue-entry,support,1)');
    // 성공 경로는 라벨 뒤에 있다.
    const matchIndex = lines.findIndex((line) => line.includes(`n(${matchLabel}),`));
    expect(matchIndex).toBeGreaterThan(guardIndex);
    expect(lines.slice(matchIndex).join('\n')).toContain('Goto(queue-entry,sales,1)');
  });

  it('대기 안내를 조회 전에 튼다', () => {
    const conf = render(lookupGraph({ endpointId: 'ep-1', waitPromptKey: 'custom/checking' }));
    const lines = conf.split('\n');
    const promptIndex = lines.findIndex((line) => line.includes('Playback(/var/lib/asterisk/sounds/custom/checking)'));
    const agiIndex = lines.findIndex((line) => line.includes('kaster-ars-http-lookup.agi'));

    expect(promptIndex).toBeGreaterThan(-1);
    expect(promptIndex).toBeLessThan(agiIndex);
  });

  it('안내가 없으면 곧바로 조회한다', () => {
    expect(render(lookupGraph())).not.toContain('Playback(');
  });

  it('여러 줄로 끝나는 목적지도 온전히 낸다', () => {
    const conf = render(
      graph(
        [node('ask', 'HTTP_LOOKUP', { endpointId: 'ep-1', waitPromptKey: null }, '등급조회'),
          node('bye', 'HANGUP', { promptKey: 'vm-goodbye' }),
          node('q', 'QUEUE', { queueName: 'sales' })],
        [edge('ask', 'bye', 'TRUE'), edge('ask', 'q', 'FALSE')],
      ),
    );

    expect(conf).toContain('Playback(vm-goodbye)');
    expect(conf).toContain('Hangup()');
    expect(conf).toContain('Goto(queue-entry,sales,1)');
  });

  it('실패 연결이 없으면 끊는다 — 컴파일이 통화를 허공에 두지 않는다', () => {
    const conf = render(
      graph(
        [node('ask', 'HTTP_LOOKUP', { endpointId: 'ep-1', waitPromptKey: null }, '등급조회'),
          node('q', 'QUEUE', { queueName: 'sales' })],
        [edge('ask', 'q', 'TRUE')],
      ),
    );

    expect(conf).toContain('Hangup()');
  });

  it('엔드포인트 id 에 개행을 넣지 못한다', () => {
    expect(() => render(lookupGraph({ endpointId: 'ep-1\nexten => s,1,System(x)', waitPromptKey: null })))
      .toThrow();
  });
});

describe('renderArsFlow — CONDITION 의 여러 줄 목적지', () => {
  it('한 줄로 끝나는 목적지는 그대로 조건에 넣는다', () => {
    const conf = render(
      graph(
        [node('c', 'CONDITION', {
          conditionType: 'TIME_RANGE', timeStart: '09:00', timeEnd: '18:00', daysOfWeek: ['mon'],
        }, '업무시간'),
          node('open', 'QUEUE', { queueName: 'sales' }),
          node('closed', 'QUEUE', { queueName: 'support' })],
        [edge('c', 'open', 'TRUE'), edge('c', 'closed', 'FALSE')],
      ),
    );

    expect(conf).toContain('GotoIfTime(09:00-18:00,mon,*,*?queue-entry,sales,1)');
  });

  it('여러 줄로 끝나는 목적지도 온전히 낸다 — 한 줄에 밀어 넣으면 안내가 사라진다', () => {
    const conf = render(
      graph(
        [node('c', 'CONDITION', {
          conditionType: 'TIME_RANGE', timeStart: '09:00', timeEnd: '18:00', daysOfWeek: ['mon'],
        }, '업무시간'),
          node('bye', 'HANGUP', { promptKey: 'vm-goodbye' }),
          node('q', 'QUEUE', { queueName: 'sales' })],
        [edge('c', 'bye', 'TRUE'), edge('c', 'q', 'FALSE')],
      ),
    );

    // 조건 안에 애플리케이션을 넣지 않는다 — GotoIfTime 의 목적지는 라벨이어야 한다.
    expect(conf).not.toMatch(/GotoIfTime\([^)]*\?Playback/);
    expect(conf).toContain('Playback(vm-goodbye)');
    expect(conf).toContain('Hangup()');
    expect(conf).toContain('Goto(queue-entry,sales,1)');
  });
});
