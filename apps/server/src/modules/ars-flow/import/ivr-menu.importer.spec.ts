import { renderArsFlow } from '../../asterisk-config/renderers/ars-flow.renderer';
import { renderDialplan } from '../../asterisk-config/renderers/dialplan.renderer';
import type { IvrMenuInput } from '../../asterisk-config/renderers/dialplan.renderer';
import { FlowGraph } from '../flow-graph.types';
import { importIvrMenu, type ImportedFlow } from './ivr-menu.importer';

function counterIds() {
  let next = 0;
  // 서버 DTO 가 UUID 를 요구하므로 형식을 맞춘 결정적 id 를 쓴다.
  return () => `00000000-0000-4000-8000-${String((next += 1)).padStart(12, '0')}`;
}

const MENU: IvrMenuInput = {
  id: 'menu-1',
  name: 'main-menu',
  welcomePrompt: 'welcome',
  menuPrompt: 'menu',
  timeoutSecs: 5,
  entries: [
    { id: 'e1', tenantId: 't', menuId: 'menu-1', digit: '1', label: '영업', queueName: 'sales' },
    { id: 'e2', tenantId: 't', menuId: 'menu-1', digit: '2', label: '지원', queueName: 'support' },
  ],
};

function toGraph(imported: ImportedFlow): FlowGraph {
  return {
    flowId: 'flow-1',
    name: imported.name,
    entryNodeId: imported.entryNodeId,
    nodes: imported.nodes.map(({ posX, posY, ...node }) => node),
    edges: imported.edges,
  };
}

/** 렌더 결과에서 통화가 어떻게 흐르는지만 뽑는다. 컨텍스트 이름·라벨은 보지 않는다. */
function observable(conf: string) {
  const playbacks = [...conf.matchAll(/(?:Playback|Background)\(([^)]*)\)/g)].map((m) => m[1]);
  const waitExten = conf.match(/WaitExten\((\d+)\)/)?.[1] ?? null;
  const digitTargets: Record<string, string> = {};
  for (const line of conf.split('\n')) {
    const match = line.match(/^exten => (\d),1,(.*)$/);
    if (match) digitTargets[match[1]] = match[2].trim();
  }
  const lines = conf.split('\n');
  const timeoutStart = lines.findIndex((line) => line.startsWith('exten => t,1,'));
  const timeoutBlock = lines
    .slice(timeoutStart)
    .filter((line) => line.startsWith('exten => t,1,') || line.startsWith(' same => n,'))
    .map((line) => line.replace(/^exten => t,1,/, '').replace(/^ same => n,/, ''));
  return { playbacks, waitExten, digitTargets, timeoutBlock };
}

describe('importIvrMenu', () => {
  it('환영 안내 → 메뉴 → 큐 순으로 옮긴다', () => {
    const imported = importIvrMenu(MENU, { newId: counterIds() });
    const types = imported.nodes.map((node) => node.nodeType);

    expect(types).toEqual(['MENU', 'PLAY', 'QUEUE', 'QUEUE', 'HANGUP']);
    expect(imported.nodes.find((node) => node.nodeId === imported.entryNodeId)?.nodeType).toBe('PLAY');
    expect(imported.notes).toEqual([]);
  });

  it('디지트를 원래 매핑 그대로 잇는다', () => {
    const imported = importIvrMenu(MENU, { newId: counterIds() });
    const queueOf = (digit: string) => {
      const edge = imported.edges.find((e) => e.condition === 'DIGIT' && e.digit === digit);
      const node = imported.nodes.find((n) => n.nodeId === edge?.toNodeId);
      return (node?.config as { queueName: string }).queueName;
    };

    expect(queueOf('1')).toBe('sales');
    expect(queueOf('2')).toBe('support');
  });

  it('시간초과는 기존과 같은 안내로 끝난다', () => {
    const imported = importIvrMenu(MENU, { newId: counterIds() });
    const edge = imported.edges.find((e) => e.condition === 'TIMEOUT');
    const node = imported.nodes.find((n) => n.nodeId === edge?.toNodeId);

    expect(node?.nodeType).toBe('HANGUP');
    expect(node?.config).toEqual({ promptKey: 'vm-goodbye' });
  });

  it('재시도를 0 으로 둔다 — 기존 단층 IVR 은 다시 묻지 않는다', () => {
    const imported = importIvrMenu(MENU, { newId: counterIds() });
    const menu = imported.nodes.find((node) => node.nodeType === 'MENU');

    expect(menu?.config).toMatchObject({ maxRetries: 0 });
  });

  it('환영 안내가 없으면 메뉴가 곧 진입이다', () => {
    const imported = importIvrMenu({ ...MENU, welcomePrompt: null }, { newId: counterIds() });
    const entry = imported.nodes.find((node) => node.nodeId === imported.entryNodeId);

    expect(entry?.nodeType).toBe('MENU');
    expect(imported.nodes.some((node) => node.nodeType === 'PLAY')).toBe(false);
  });

  it('노드가 겹쳐 쌓이지 않게 좌표를 준다', () => {
    const imported = importIvrMenu(MENU, { newId: counterIds() });
    const positions = imported.nodes.map((node) => `${node.posX},${node.posY}`);

    expect(new Set(positions).size).toBe(positions.length);
  });

  it('사람이 확인해야 할 점을 알려준다', () => {
    const empty = importIvrMenu({ ...MENU, menuPrompt: null, entries: [] }, { newId: counterIds() });

    expect(empty.notes).toHaveLength(2);
    expect(empty.notes.join(' ')).toMatch(/디지트 매핑/);
    expect(empty.notes.join(' ')).toMatch(/메뉴 안내/);
  });

  it('id 를 안 넣으면 UUID 를 만든다', () => {
    const imported = importIvrMenu(MENU);

    for (const node of imported.nodes) {
      expect(node.nodeId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    }
  });
});

/**
 * 설계서 §4.4 조건 2 의 실질 판정.
 *
 * 문서는 "바이트 단위로 같다" 로 적혀 있지만 두 렌더러는 컨텍스트 이름부터 다르다
 * (`[ivr-menu-x]` / `[ars-flow-x]`). 실제로 확인해야 하는 것은 **통화가 같게 흐르는가** 다.
 */
describe('importIvrMenu — 기존 렌더 결과와의 동등성', () => {
  function legacyMenuContext(menu: IvrMenuInput) {
    return renderDialplan({
      dids: [{
        id: 'did-1', did: '16001234', description: null,
        ivrMenuId: menu.id, directQueue: null, enabled: true,
      }],
      ivrMenus: [menu],
    })
      .extensionsQueue.split('\n\n')
      .find((block) => block.startsWith('[ivr-menu-')) as string;
  }

  function importedConf(menu: IvrMenuInput) {
    return renderArsFlow({
      graph: toGraph(importIvrMenu(menu, { newId: counterIds() })),
      did: '16001234',
      tenantId: 'tenant-1',
      branchId: null,
    });
  }

  it('안내·대기·디지트·종료가 모두 같다', () => {
    const legacy = observable(legacyMenuContext(MENU));
    const imported = observable(importedConf(MENU));

    expect(imported.playbacks).toEqual(legacy.playbacks);
    expect(imported.waitExten).toBe(legacy.waitExten);
    expect(imported.digitTargets).toEqual(legacy.digitTargets);
    expect(imported.timeoutBlock).toEqual(legacy.timeoutBlock);
  });

  it('환영 안내가 없는 메뉴도 같다', () => {
    const menu = { ...MENU, welcomePrompt: null };
    const legacy = observable(legacyMenuContext(menu));
    const imported = observable(importedConf(menu));

    expect(imported.playbacks).toEqual(legacy.playbacks);
    expect(imported.digitTargets).toEqual(legacy.digitTargets);
    expect(imported.timeoutBlock).toEqual(legacy.timeoutBlock);
  });

  it('custom/ 안내를 쓰는 메뉴도 같은 파일을 튼다', () => {
    const menu = { ...MENU, welcomePrompt: 'custom/welcome', menuPrompt: 'custom/main' };
    const legacy = observable(legacyMenuContext(menu));
    const imported = observable(importedConf(menu));

    expect(imported.playbacks).toEqual(legacy.playbacks);
    expect(imported.playbacks[0]).toBe('/var/lib/asterisk/sounds/custom/welcome');
  });

  it('디지트가 하나뿐인 메뉴도 같다', () => {
    const menu = { ...MENU, entries: [MENU.entries[0]] };
    const legacy = observable(legacyMenuContext(menu));
    const imported = observable(importedConf(menu));

    expect(imported.digitTargets).toEqual(legacy.digitTargets);
    expect(imported.timeoutBlock).toEqual(legacy.timeoutBlock);
  });
});
