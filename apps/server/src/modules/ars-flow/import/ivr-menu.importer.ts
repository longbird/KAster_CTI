import { randomUUID } from 'crypto';
import type { IvrMenuInput } from '../../asterisk-config/renderers/dialplan.renderer';
import { FlowEdge, FlowEdgeCondition, FlowNode, FlowNodeType, NodeConfig } from '../flow-graph.types';

/** 기존 `renderIvrMenu()` 의 시간초과 안내. 옮긴 그래프도 같은 파일을 틀어야 동등하다. */
const LEGACY_TIMEOUT_PROMPT = 'vm-goodbye';

const COLUMN_WIDTH = 280;
const ROW_HEIGHT = 150;

export interface ImportedNode extends FlowNode {
  posX: number;
  posY: number;
}

export interface ImportedFlow {
  name: string;
  entryNodeId: string;
  nodes: ImportedNode[];
  edges: FlowEdge[];
  /** 옮기면서 원래와 달라진 점. 조용히 넘기지 않고 사람에게 보여준다. */
  notes: string[];
}

export interface ImportOptions {
  /** 테스트가 결정적인 id 를 넣는다. 운영에서는 UUID 다 — 서버 DTO 가 UUID 를 요구한다. */
  newId?: () => string;
}

/**
 * 기존 단층 IVR 메뉴를 플로우 그래프로 옮긴다.
 *
 * 순수 함수다. DB 를 모르고, 같은 입력에는 같은 그래프를 낸다(id 주입 시).
 * 옮긴 그래프를 컴파일한 결과는 `renderIvrMenu()` 의 결과와 **관찰 동등**해야 한다 —
 * 같은 안내, 같은 대기 시간, 같은 디지트 라우팅, 같은 종료. 이 약속을 spec 이 지킨다.
 *
 * 컨텍스트 이름까지 같아지지는 않는다(`[ivr-menu-x]` vs `[ars-flow-x]`). 바이트 동등은
 * 두 렌더러의 구조가 달라 애초에 불가능하고, 통화가 같게 흐르는지가 실제로 확인해야 할 것이다.
 */
export function importIvrMenu(menu: IvrMenuInput, options: ImportOptions = {}): ImportedFlow {
  const newId = options.newId ?? randomUUID;
  const nodes: ImportedNode[] = [];
  const edges: FlowEdge[] = [];
  const notes: string[] = [];
  const rowsByColumn = new Map<number, number>();

  const add = (
    nodeType: FlowNodeType,
    label: string,
    config: NodeConfig,
    column: number,
  ): string => {
    const row = rowsByColumn.get(column) ?? 0;
    rowsByColumn.set(column, row + 1);
    const nodeId = newId();
    nodes.push({
      nodeId,
      nodeType,
      label,
      config,
      posX: column * COLUMN_WIDTH,
      posY: row * ROW_HEIGHT,
    });
    return nodeId;
  };

  const connect = (
    fromNodeId: string,
    toNodeId: string,
    condition: FlowEdgeCondition,
    digit: string | null = null,
  ) => {
    edges.push({ edgeId: newId(), fromNodeId, toNodeId, condition, digit });
  };

  const hasWelcome = Boolean(menu.welcomePrompt);
  const menuColumn = hasWelcome ? 1 : 0;

  const menuNodeId = add(
    'MENU',
    menu.name,
    {
      promptKey: menu.menuPrompt,
      timeoutSeconds: menu.timeoutSecs,
      // 기존 단층 IVR 은 시간초과에 재시도가 없다. 0 이 아니면 통화가 다르게 흐른다.
      maxRetries: 0,
    },
    menuColumn,
  );

  let entryNodeId = menuNodeId;
  if (menu.welcomePrompt) {
    entryNodeId = add('PLAY', '환영 안내', { promptKeys: [menu.welcomePrompt] }, 0);
    connect(entryNodeId, menuNodeId, 'DEFAULT');
  }

  const targetColumn = menuColumn + 1;
  for (const entry of menu.entries) {
    const queueNodeId = add(
      'QUEUE',
      entry.label || `${entry.digit}번`,
      { queueName: entry.queueName },
      targetColumn,
    );
    connect(menuNodeId, queueNodeId, 'DIGIT', entry.digit);
  }

  const hangupNodeId = add('HANGUP', '시간초과 종료', { promptKey: LEGACY_TIMEOUT_PROMPT }, targetColumn);
  connect(menuNodeId, hangupNodeId, 'TIMEOUT');

  if (!menu.entries.length) {
    notes.push('디지트 매핑이 없습니다. 메뉴에 연결을 추가해야 통화가 큐로 이어집니다.');
  }
  if (!menu.menuPrompt) {
    notes.push('메뉴 안내가 비어 있습니다. 고객에게 아무 안내 없이 입력을 기다립니다.');
  }

  return { name: menu.name, entryNodeId, nodes, edges, notes };
}
