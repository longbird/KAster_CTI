import {
  CollectDigitsConfig,
  ConditionConfig,
  DigitTargetSource,
  FlowEdge,
  FlowEdgeCondition,
  FlowGraph,
  FlowNode,
  HangupConfig,
  HttpLookupConfig,
  MenuConfig,
  OptOutConfig,
  PlayConfig,
  QueueConfig,
  SmsConfig,
  TransferConfig,
} from '../../ars-flow/flow-graph.types';
import { ARS_HTTP_LOOKUP_AGI_PATH, OPT_OUT_HOOK_PATH, SMART_ARS_HOOK_PATH } from './hook-paths';
import { assertNoNewlines, shellQuote, toPlaybackTarget, toSlug } from './renderer-utils';

export interface ArsFlowRenderInput {
  graph: FlowGraph;
  did: string;
  tenantId: string;
  branchId: string | null;
}

// 받은 숫자가 담기는 채널 변수. `targetSource: 'COLLECTED'` 인 노드가 이 값을 대상 번호로 쓴다.
// 한 통화에서 여러 번 받으면 마지막 값이 남는다 (그래프 모델의 약속).
const COLLECTED_DIGITS_VAR = 'ARS_COLLECTED_DIGITS';
const COLLECT_INPUT_VAR = 'ARS_COLLECT_INPUT';
const CALLER_NUMBER_EXPRESSION = '${CALLERID(num)}';
// AGI 가 채우는 변수. NOMATCH 와 ERROR 는 둘 다 실패 갈래로 간다 —
// 셋으로 나누면 작성자가 오류 갈래를 비워 두고, 장애 때 통화가 갈 곳을 잃는다.
const LOOKUP_STATUS_VAR = 'ARS_LOOKUP_STATUS';
const LOOKUP_VALUE_VAR = 'ARS_LOOKUP_VALUE';

/** 점프 지점에서 곧바로 끝나는 노드. 별도 라벨 블록을 만들지 않는다. */
const TERMINAL_TYPES = new Set(['QUEUE', 'TRANSFER', 'HANGUP']);

const CONDITION_RANK: Record<FlowEdgeCondition, number> = {
  DIGIT: 0,
  TRUE: 1,
  FALSE: 2,
  DEFAULT: 3,
  TIMEOUT: 4,
  INVALID: 5,
};

const WEEKDAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

/**
 * ARS 플로우 그래프를 dialplan 컨텍스트로 컴파일한다.
 *
 * 순수 함수다 — DB·파일·AMI 를 모른다. 같은 그래프는 항상 같은 문자열을 낸다
 * (그래야 적용 전 diff 가 의미를 갖는다). 노드 좌표는 `FlowGraph` 에 아예 없으므로
 * 편집기에서 노드를 옮겨도 결과가 바뀌지 않는다.
 */
export function renderArsFlow(input: ArsFlowRenderInput): string {
  const { graph } = input;
  // 이 제품의 플로우 이름은 대개 한글이고, toSlug 는 한글을 전부 걷어낸다.
  // 그때는 flowId 로 컨텍스트 이름을 만든다 — 이름이 바뀌어도 컨텍스트가 흔들리지 않는 이점도 있다.
  const flowSlug = toSlug(graph.name) || toSlug(graph.flowId);
  if (!flowSlug) {
    throw new Error(`ARS flow has no usable name or id for a context slug`);
  }

  const nodesById = new Map(graph.nodes.map((node) => [node.nodeId, node]));
  if (!nodesById.has(graph.entryNodeId)) {
    throw new Error(`ARS flow entry node not found: ${graph.entryNodeId}`);
  }

  assertNoNewlines(input.did, 'did');
  assertNoNewlines(input.tenantId, 'tenantId');
  if (input.branchId) assertNoNewlines(input.branchId, 'branchId');

  const outgoing = buildOutgoing(graph, nodesById);
  const order = orderReachableNodes(graph, nodesById, outgoing);
  const labels = buildLabels(order);
  const mainContext = `ars-flow-${flowSlug}`;
  const menuContexts = new Map<string, string>();
  for (const node of order) {
    if (node.nodeType !== 'MENU') continue;
    menuContexts.set(node.nodeId, `${mainContext}-${labels.get(node.nodeId)}`);
  }

  const jump = (nodeId: string): string[] =>
    renderJump(nodesById.get(nodeId) as FlowNode, mainContext, menuContexts, labels);

  const mainLines: string[] = [
    `[${mainContext}]`,
    `exten => s,1,NoOp(ARS flow ${graph.name})`,
    ' same => n,Answer()',
    // 안내를 언어 하위 디렉터리에서 찾다가 못 찾으면 무음이 된다. 기존 Smart ARS 도 같은 줄을 넣는다.
    ' same => n,Set(CHANNEL(language)=)',
    ` same => n,Set(__SMART_ARS_TENANT_ID=${input.tenantId})`,
    ` same => n,Set(__SMART_ARS_BRANCH_ID=${input.branchId ?? '-'})`,
    ` same => n,Set(__ENTRY_DID=${input.did})`,
    ...jump(graph.entryNodeId).map(prefixSame),
  ];

  for (const node of order) {
    if (node.nodeType === 'MENU' || TERMINAL_TYPES.has(node.nodeType)) continue;
    mainLines.push(
      ` same => n(${labels.get(node.nodeId)}),NoOp(ARS node ${node.label})`,
      ...renderInlineNode(node, labels.get(node.nodeId) as string, outgoing, jump).map(prefixSame),
    );
  }

  const contexts = [mainLines.join('\n')];
  for (const node of order) {
    if (node.nodeType !== 'MENU') continue;
    contexts.push(renderMenuContext(node, menuContexts.get(node.nodeId) as string, outgoing, jump));
  }

  return contexts.join('\n\n');
}

/**
 * `(라벨)App(...)` 형태면 우선순위 라벨을 붙인다.
 * `COLLECT_DIGITS` 의 재시도 루프가 같은 extension 안으로 되돌아가려면 라벨이 필요하다.
 */
function prefixSame(line: string): string {
  const labeled = line.match(/^\(([A-Za-z0-9_-]+)\)(.*)$/);
  return labeled ? ` same => n(${labeled[1]}),${labeled[2]}` : ` same => n,${line}`;
}

function buildOutgoing(
  graph: FlowGraph,
  nodesById: Map<string, FlowNode>,
): Map<string, FlowEdge[]> {
  const outgoing = new Map<string, FlowEdge[]>();
  for (const node of graph.nodes) outgoing.set(node.nodeId, []);

  for (const edge of graph.edges) {
    if (!nodesById.has(edge.fromNodeId) || !nodesById.has(edge.toNodeId)) continue;
    outgoing.get(edge.fromNodeId)?.push(edge);
  }

  for (const edges of outgoing.values()) {
    edges.sort(
      (a, b) =>
        CONDITION_RANK[a.condition] - CONDITION_RANK[b.condition] ||
        (a.digit ?? '').localeCompare(b.digit ?? '') ||
        a.toNodeId.localeCompare(b.toNodeId),
    );
  }
  return outgoing;
}

/**
 * 진입에서 도달 가능한 노드만, 항상 같은 순서로.
 * 도달하지 못하는 노드는 렌더하지 않는다 — 죽은 dialplan 을 PBX 에 올리지 않는다.
 */
function orderReachableNodes(
  graph: FlowGraph,
  nodesById: Map<string, FlowNode>,
  outgoing: Map<string, FlowEdge[]>,
): FlowNode[] {
  const seen = new Set<string>([graph.entryNodeId]);
  const order: FlowNode[] = [];
  const queue = [graph.entryNodeId];

  while (queue.length) {
    const nodeId = queue.shift() as string;
    order.push(nodesById.get(nodeId) as FlowNode);
    for (const edge of outgoing.get(nodeId) ?? []) {
      if (seen.has(edge.toNodeId)) continue;
      seen.add(edge.toNodeId);
      queue.push(edge.toNodeId);
    }
  }
  return order;
}

function buildLabels(order: FlowNode[]): Map<string, string> {
  const labels = new Map<string, string>();
  order.forEach((node, index) => {
    const slug = toSlug(node.label) || node.nodeType.toLowerCase();
    labels.set(node.nodeId, `node-${index}-${slug}`);
  });
  return labels;
}

/** 그 노드로 넘어가는 한 줄. 터미널 노드는 여기서 곧바로 끝난다. */
function renderJump(
  node: FlowNode,
  mainContext: string,
  menuContexts: Map<string, string>,
  labels: Map<string, string>,
): string[] {
  switch (node.nodeType) {
    case 'QUEUE': {
      const { queueName } = node.config as QueueConfig;
      assertNoNewlines(queueName, 'queueName');
      return [`Goto(queue-entry,${queueName},1)`];
    }
    case 'TRANSFER': {
      const { transferNumber } = node.config as TransferConfig;
      assertNoNewlines(transferNumber, 'transferNumber');
      return [`Goto(transfer-target,${transferNumber},1)`];
    }
    case 'HANGUP': {
      const { promptKey } = node.config as HangupConfig;
      return [...(promptKey ? [`Playback(${toPlaybackTarget(promptKey)})`] : []), 'Hangup()'];
    }
    case 'MENU':
      return [`Goto(${menuContexts.get(node.nodeId)},s,1)`];
    default:
      return [`Goto(${mainContext},s,${labels.get(node.nodeId)})`];
  }
}

function renderInlineNode(
  node: FlowNode,
  label: string,
  outgoing: Map<string, FlowEdge[]>,
  jump: (nodeId: string) => string[],
): string[] {
  switch (node.nodeType) {
    case 'PLAY':
      return [
        ...(node.config as PlayConfig).promptKeys.map(
          (promptKey) => `Playback(${toPlaybackTarget(promptKey)})`,
        ),
        ...continueOrHangup(node, outgoing, jump),
      ];
    case 'SMS': {
      const { smsTemplateId, targetSource } = node.config as SmsConfig;
      assertNoNewlines(smsTemplateId, 'smsTemplateId');
      return [
        `Set(__SMART_ARS_SELECTED_SMS_TEMPLATE=${smsTemplateId})`,
        `System(${buildSmartArsHookCommand('sms', targetNumberExpression(targetSource))})`,
        ...continueOrHangup(node, outgoing, jump),
      ];
    }
    case 'OPT_OUT': {
      const { action, targetSource } = node.config as OptOutConfig;
      return [
        'Set(__OPT_OUT_TENANT_ID=${SMART_ARS_TENANT_ID})',
        'Set(__OPT_OUT_BRANCH_ID=${SMART_ARS_BRANCH_ID})',
        // 요청자는 언제나 전화를 건 사람이다. 대상만 입력값으로 바뀐다.
        'Set(__REQUESTER_PHONE=${CALLERID(num)})',
        `Set(__OPT_OUT_TARGET_PHONE=${targetNumberExpression(targetSource)})`,
        'Set(__OPT_OUT_SOURCE_TYPE=ARS_FLOW)',
        'Set(__OPT_OUT_SELECTED_SMS_TEMPLATE=-)',
        `System(${buildOptOutHookCommand(action === 'UNREGISTER' ? 'unregister' : 'register')})`,
        ...continueOrHangup(node, outgoing, jump),
      ];
    }
    case 'CONDITION':
      return renderCondition(node, label, outgoing, jump);
    case 'COLLECT_DIGITS':
      return renderCollectDigits(node, label, outgoing, jump);
    case 'HTTP_LOOKUP':
      return renderHttpLookup(node, label, outgoing, jump);
    default:
      return ['Hangup()'];
  }
}

/**
 * 통화 중 외부 조회.
 *
 * 성공 갈래를 **뒤에 라벨로** 둔다. 실패 갈래가 여러 줄로 끝날 수 있어서
 * `GotoIf(...?목적지)` 한 줄에 밀어 넣을 수 없기 때문이다. 실패 갈래는 항상 Goto 나 Hangup 으로
 * 끝나므로 아래 라벨 블록으로 흘러 들어가지 않는다.
 */
function renderHttpLookup(
  node: FlowNode,
  label: string,
  outgoing: Map<string, FlowEdge[]>,
  jump: (nodeId: string) => string[],
): string[] {
  const config = node.config as HttpLookupConfig;
  assertNoNewlines(config.endpointId, 'endpointId');

  const matchLabel = `${label}-match`;
  const onTrue = findEdge(node.nodeId, outgoing, 'TRUE');
  const onFalse = findEdge(node.nodeId, outgoing, 'FALSE');

  return [
    ...(config.waitPromptKey ? [`Playback(${toPlaybackTarget(config.waitPromptKey)})`] : []),
    `AGI(${ARS_HTTP_LOOKUP_AGI_PATH},${config.endpointId})`,
    `GotoIf($["\${${LOOKUP_STATUS_VAR}}"="MATCH"]?${matchLabel})`,
    // 조회가 실패했거나 조건에 맞지 않았다. 검증기가 이 갈래를 반드시 채우게 한다.
    ...(onFalse ? jump(onFalse.toNodeId) : ['Hangup()']),
    `(${matchLabel})NoOp(ARS lookup matched \${${LOOKUP_VALUE_VAR}})`,
    ...(onTrue ? jump(onTrue.toNodeId) : ['Hangup()']),
  ];
}

function targetNumberExpression(source: DigitTargetSource | undefined): string {
  return source === 'COLLECTED' ? `\${${COLLECTED_DIGITS_VAR}}` : CALLER_NUMBER_EXPRESSION;
}

/**
 * 숫자 여러 자리를 받는다. 자릿수를 못 채우면 정해진 횟수만큼 다시 묻는다.
 *
 * 재시도는 같은 extension 안의 라벨로 되돌아간다 — 080 수신거부의 번호 재입력과 같은 모양이다.
 * 카운터 변수명에는 라벨의 하이픈을 쓸 수 없어 밑줄로 바꾼다 (Asterisk 변수명 규칙).
 */
function renderCollectDigits(
  node: FlowNode,
  label: string,
  outgoing: Map<string, FlowEdge[]>,
  jump: (nodeId: string) => string[],
): string[] {
  const config = node.config as CollectDigitsConfig;
  const prompt = config.promptKey ? toPlaybackTarget(config.promptKey) : '';

  const counter = `ARS_COLLECT_RETRY_${label.replace(/[^A-Za-z0-9_]/g, '_')}`;
  const readLabel = `${label}-read`;
  const okLabel = `${label}-ok`;
  const onTimeout = findEdge(node.nodeId, outgoing, 'TIMEOUT');

  return [
    `Set(__${counter}=0)`,
    `(${readLabel})Read(${COLLECT_INPUT_VAR},${prompt},${config.maxDigits},,1,${config.timeoutSeconds})`,
    `Set(__${COLLECTED_DIGITS_VAR}=\${FILTER(0-9,\${${COLLECT_INPUT_VAR}})})`,
    `GotoIf($[\${LEN(\${${COLLECTED_DIGITS_VAR}})}>=${config.minDigits}]?${okLabel})`,
    `Set(__${counter}=$[\${${counter}}+1])`,
    `GotoIf($[\${${counter}}<=${config.maxRetries}]?${readLabel})`,
    // 재시도를 소진했다. 입력값이 없는 상태로 나간다.
    ...(onTimeout ? jump(onTimeout.toNodeId) : ['Hangup()']),
    `(${okLabel})NoOp(ARS collected \${${COLLECTED_DIGITS_VAR}})`,
    ...continueOrHangup(node, outgoing, jump),
  ];
}

/**
 * 시간·공휴일 조건 분기.
 *
 * 참일 때 갈 곳이 **여러 줄일 수 있다** (HANGUP 은 안내 + Hangup 두 줄이다).
 * `GotoIfTime` 의 목적지 자리에는 우선순위 라벨만 들어가므로, 여러 줄이면
 * 라벨을 하나 만들어 뒤에 두고 그리로 보낸다 — `HTTP_LOOKUP` 과 같은 모양이다.
 *
 * 한 줄짜리 목적지는 예전처럼 조건 안에 그대로 둔다. 이미 잘 돌던 플로우의 컴파일 결과를
 * 바꾸지 않기 위해서다.
 */
function renderCondition(
  node: FlowNode,
  label: string,
  outgoing: Map<string, FlowEdge[]>,
  jump: (nodeId: string) => string[],
): string[] {
  const config = node.config as ConditionConfig;
  const onTrue = findEdge(node.nodeId, outgoing, 'TRUE');
  const onFalse = findEdge(node.nodeId, outgoing, 'FALSE');
  const otherwise = onFalse ? jump(onFalse.toNodeId) : ['Hangup()'];

  if (!onTrue) return otherwise;

  const target = jump(onTrue.toNodeId);
  if (target.length === 1) {
    return [`GotoIfTime(${buildTimeSpec(config)}?${stripGoto(target[0])})`, ...otherwise];
  }

  const trueLabel = `${label}-true`;
  return [
    `GotoIfTime(${buildTimeSpec(config)}?${trueLabel})`,
    ...otherwise,
    `(${trueLabel})NoOp(ARS condition ${node.label} matched)`,
    ...target,
  ];
}

/** `GotoIfTime(...?target)` 의 target 자리에는 Goto 를 벗긴 형태가 들어간다. */
function stripGoto(line: string): string {
  const match = line.match(/^Goto\((.*)\)$/);
  return match ? match[1] : line;
}

function buildTimeSpec(config: ConditionConfig): string {
  if (config.conditionType === 'HOLIDAY') {
    return '*,*,*,*';
  }
  const days = config.daysOfWeek.length
    ? [...config.daysOfWeek].sort((a, b) => WEEKDAY_ORDER.indexOf(a) - WEEKDAY_ORDER.indexOf(b)).join('&')
    : '*';
  return `${config.timeStart}-${config.timeEnd},${days},*,*`;
}

function continueOrHangup(
  node: FlowNode,
  outgoing: Map<string, FlowEdge[]>,
  jump: (nodeId: string) => string[],
): string[] {
  const next = findEdge(node.nodeId, outgoing, 'DEFAULT');
  return next ? jump(next.toNodeId) : ['Hangup()'];
}

function findEdge(
  nodeId: string,
  outgoing: Map<string, FlowEdge[]>,
  condition: FlowEdgeCondition,
): FlowEdge | undefined {
  return outgoing.get(nodeId)?.find((edge) => edge.condition === condition);
}

function renderMenuContext(
  node: FlowNode,
  contextName: string,
  outgoing: Map<string, FlowEdge[]>,
  jump: (nodeId: string) => string[],
): string {
  const config = node.config as MenuConfig;
  const counter = `ARS_MENU_RETRY_${contextName.replace(/[^A-Za-z0-9_]/g, '_')}`;
  const retries = config.maxRetries ?? 0;

  const lines: string[] = [`[${contextName}]`, `exten => s,1,NoOp(ARS menu ${node.label})`];
  // 재시도가 없으면 카운터도 만들지 않는다 — 기존 단층 IVR 과 같은 모양을 지킨다.
  if (retries > 0) lines.push(` same => n,Set(__${counter}=0)`);
  if (config.promptKey) {
    lines.push(` same => n${retries > 0 ? '(prompt)' : ''},Background(${toPlaybackTarget(config.promptKey)})`);
  }
  lines.push(` same => n,WaitExten(${config.timeoutSeconds})`);

  for (const edge of outgoing.get(node.nodeId) ?? []) {
    if (edge.condition !== 'DIGIT' || !edge.digit) continue;
    assertNoNewlines(edge.digit, 'digit');
    lines.push(...renderExtension(edge.digit, jump(edge.toNodeId)));
  }

  const onTimeout = findEdge(node.nodeId, outgoing, 'TIMEOUT');
  const giveUp = onTimeout ? jump(onTimeout.toNodeId) : ['Hangup()'];
  // 재시도는 안내부터 다시 튼다. 다 쓰면 시간초과 연결로 나간다.
  const timeoutBody = retries > 0 && config.promptKey
    ? [
        `Set(__${counter}=$[\${${counter}}+1])`,
        `GotoIf($[\${${counter}}<=${retries}]?s,prompt)`,
        ...giveUp,
      ]
    : giveUp;
  lines.push(...renderExtension('t', timeoutBody));

  const onInvalid = findEdge(node.nodeId, outgoing, 'INVALID');
  if (onInvalid) {
    lines.push(...renderExtension('i', jump(onInvalid.toNodeId)));
  }

  return lines.join('\n');
}

function renderExtension(exten: string, body: string[]): string[] {
  return [`exten => ${exten},1,${body[0]}`, ...body.slice(1).map(prefixSame)];
}

function buildSmartArsHookCommand(action: 'sms' | 'opt-out', targetNumber: string): string {
  const args = [
    shellQuote(action),
    shellQuote('${SMART_ARS_TENANT_ID}'),
    shellQuote('${SMART_ARS_BRANCH_ID}'),
    shellQuote('${ENTRY_DID}'),
    shellQuote(targetNumber),
    shellQuote('${SMART_ARS_SELECTED_SMS_TEMPLATE}'),
  ];
  return `${SMART_ARS_HOOK_PATH} ${args.join(' ')}`;
}

function buildOptOutHookCommand(action: 'register' | 'unregister'): string {
  const args = [
    shellQuote(action),
    shellQuote('${OPT_OUT_TENANT_ID}'),
    shellQuote('${OPT_OUT_BRANCH_ID}'),
    shellQuote('${ENTRY_DID}'),
    shellQuote('${REQUESTER_PHONE}'),
    shellQuote('${OPT_OUT_TARGET_PHONE}'),
    shellQuote('${OPT_OUT_SOURCE_TYPE}'),
    shellQuote('${OPT_OUT_SELECTED_SMS_TEMPLATE}'),
  ];
  return `${OPT_OUT_HOOK_PATH} ${args.join(' ')}`;
}
