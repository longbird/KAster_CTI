import {
  FlowGraph,
  FlowNode,
  HangupConfig,
  MenuConfig,
  PlayConfig,
  QueueConfig,
  SmsConfig,
} from './flow-graph.types';

const MAX_DEPTH = 10;

export interface FlowIssue {
  code: string;
  message: string;
  nodeId?: string;
  edgeId?: string;
}

export interface FlowValidationContext {
  queueNames: string[];
  promptKeys: string[];
  smsTemplateIds: string[];
}

export interface FlowValidationResult {
  errors: FlowIssue[];
  warnings: FlowIssue[];
}

/**
 * 그래프가 통화를 망가뜨리지 않는지 본다.
 *
 * 오류는 저장을 막고, 경고는 막지 않는다 — 도달 불가 노드는 편집 중일 수 있다.
 * 큐·프롬프트·문자 템플릿의 실재 여부는 순수 함수 밖의 사실이라 `context` 로 받는다
 * (컴파일러와 마찬가지로 여기도 DB 를 몰라야 한다).
 */
export function validateFlowGraph(
  graph: FlowGraph,
  context: FlowValidationContext,
): FlowValidationResult {
  const errors: FlowIssue[] = [];
  const warnings: FlowIssue[] = [];
  const nodesById = new Map(graph.nodes.map((node) => [node.nodeId, node]));

  checkEntryNode(graph, nodesById, errors);
  checkEdgeEndpoints(graph, nodesById, errors);
  checkMenuDigits(graph, nodesById, errors);
  checkTargetsExist(graph, context, errors);

  const reachable = collectReachable(graph, nodesById);
  checkReachability(graph, reachable, warnings);
  checkDepth(graph, nodesById, errors);
  checkTrappedCycles(graph, nodesById, errors);

  return { errors, warnings };
}

function checkEntryNode(
  graph: FlowGraph,
  nodesById: Map<string, FlowNode>,
  errors: FlowIssue[],
): void {
  if (!graph.entryNodeId || !nodesById.has(graph.entryNodeId)) {
    errors.push({
      code: 'ENTRY_NODE_NOT_FOUND',
      message: `entry node not found: ${graph.entryNodeId ?? '(none)'}`,
    });
  }
}

function checkEdgeEndpoints(
  graph: FlowGraph,
  nodesById: Map<string, FlowNode>,
  errors: FlowIssue[],
): void {
  for (const edge of graph.edges) {
    if (!nodesById.has(edge.fromNodeId)) {
      errors.push({
        code: 'EDGE_SOURCE_NOT_FOUND',
        message: `edge starts from a node that does not exist: ${edge.fromNodeId}`,
        edgeId: edge.edgeId,
      });
    }
    if (!nodesById.has(edge.toNodeId)) {
      errors.push({
        code: 'EDGE_TARGET_NOT_FOUND',
        message: `edge points to a node that does not exist: ${edge.toNodeId}`,
        edgeId: edge.edgeId,
      });
    }
  }
}

function checkMenuDigits(
  graph: FlowGraph,
  nodesById: Map<string, FlowNode>,
  errors: FlowIssue[],
): void {
  const seen = new Map<string, Set<string>>();

  for (const edge of graph.edges) {
    if (edge.condition !== 'DIGIT' || !edge.digit) continue;
    if (nodesById.get(edge.fromNodeId)?.nodeType !== 'MENU') continue;

    const digits = seen.get(edge.fromNodeId) ?? new Set<string>();
    if (digits.has(edge.digit)) {
      errors.push({
        code: 'DUPLICATE_MENU_DIGIT',
        message: `menu digit ${edge.digit} is mapped more than once`,
        nodeId: edge.fromNodeId,
        edgeId: edge.edgeId,
      });
    }
    digits.add(edge.digit);
    seen.set(edge.fromNodeId, digits);
  }
}

function checkTargetsExist(
  graph: FlowGraph,
  context: FlowValidationContext,
  errors: FlowIssue[],
): void {
  const queues = new Set(context.queueNames);
  const prompts = new Set(context.promptKeys);
  const templates = new Set(context.smsTemplateIds);

  for (const node of graph.nodes) {
    switch (node.nodeType) {
      case 'QUEUE': {
        const { queueName } = node.config as QueueConfig;
        if (!queues.has(queueName)) {
          errors.push({
            code: 'QUEUE_NOT_FOUND',
            message: `queue does not exist: ${queueName}`,
            nodeId: node.nodeId,
          });
        }
        break;
      }
      case 'PLAY': {
        for (const promptKey of (node.config as PlayConfig).promptKeys) {
          pushMissingPrompt(prompts, promptKey, node.nodeId, errors);
        }
        break;
      }
      case 'MENU': {
        pushMissingPrompt(prompts, (node.config as MenuConfig).promptKey, node.nodeId, errors);
        break;
      }
      case 'HANGUP': {
        pushMissingPrompt(prompts, (node.config as HangupConfig).promptKey, node.nodeId, errors);
        break;
      }
      case 'SMS': {
        const { smsTemplateId } = node.config as SmsConfig;
        if (!templates.has(smsTemplateId)) {
          errors.push({
            code: 'SMS_TEMPLATE_NOT_FOUND',
            message: `sms template does not exist: ${smsTemplateId}`,
            nodeId: node.nodeId,
          });
        }
        break;
      }
      default:
        break;
    }
  }
}

function pushMissingPrompt(
  prompts: Set<string>,
  promptKey: string | null | undefined,
  nodeId: string,
  errors: FlowIssue[],
): void {
  if (!promptKey) return;
  if (prompts.has(promptKey)) return;
  errors.push({
    code: 'PROMPT_NOT_FOUND',
    message: `prompt does not exist: ${promptKey}`,
    nodeId,
  });
}

function buildAdjacency(graph: FlowGraph, nodesById: Map<string, FlowNode>): Map<string, string[]> {
  const adjacency = new Map<string, string[]>();
  for (const node of graph.nodes) adjacency.set(node.nodeId, []);

  for (const edge of graph.edges) {
    if (!nodesById.has(edge.fromNodeId) || !nodesById.has(edge.toNodeId)) continue;
    adjacency.get(edge.fromNodeId)?.push(edge.toNodeId);
  }
  return adjacency;
}

function collectReachable(graph: FlowGraph, nodesById: Map<string, FlowNode>): Set<string> {
  const reachable = new Set<string>();
  if (!nodesById.has(graph.entryNodeId)) return reachable;

  const adjacency = buildAdjacency(graph, nodesById);
  const queue = [graph.entryNodeId];
  reachable.add(graph.entryNodeId);

  while (queue.length) {
    const current = queue.shift() as string;
    for (const next of adjacency.get(current) ?? []) {
      if (reachable.has(next)) continue;
      reachable.add(next);
      queue.push(next);
    }
  }
  return reachable;
}

function checkReachability(graph: FlowGraph, reachable: Set<string>, warnings: FlowIssue[]): void {
  for (const node of graph.nodes) {
    if (reachable.has(node.nodeId)) continue;
    warnings.push({
      code: 'UNREACHABLE_NODE',
      message: `node cannot be reached from the entry node: ${node.label}`,
      nodeId: node.nodeId,
    });
  }
}

/**
 * 탈출구 없는 순환을 찾는다. **이 검사가 이 파일에서 가장 중요하다.**
 *
 * 안내만 반복하는 순환에 빠진 통화는 고객이 끊을 때까지 나오지 못한다.
 * `MENU` 는 사람이 다른 디지트를 눌러 빠져나갈 수 있는 지점이므로,
 * `MENU` 를 뺀 부분그래프에 남은 순환이 곧 갇히는 순환이다.
 */
function checkTrappedCycles(
  graph: FlowGraph,
  nodesById: Map<string, FlowNode>,
  errors: FlowIssue[],
): void {
  const adjacency = buildAdjacency(graph, nodesById);
  const escapable = (nodeId: string) => nodesById.get(nodeId)?.nodeType === 'MENU';

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const reported = new Set<string>();

  const walk = (nodeId: string): void => {
    if (escapable(nodeId) || visited.has(nodeId)) return;

    if (visiting.has(nodeId)) {
      if (!reported.has(nodeId)) {
        reported.add(nodeId);
        errors.push({
          code: 'TRAPPED_CYCLE',
          message: `node is part of a loop with no menu to escape from: ${nodesById.get(nodeId)?.label ?? nodeId}`,
          nodeId,
        });
      }
      return;
    }

    visiting.add(nodeId);
    for (const next of adjacency.get(nodeId) ?? []) walk(next);
    visiting.delete(nodeId);
    visited.add(nodeId);
  };

  for (const node of graph.nodes) walk(node.nodeId);
}

/** 최단 경로 기준 깊이. 순환이 있어도 계산이 끝난다. */
function checkDepth(graph: FlowGraph, nodesById: Map<string, FlowNode>, errors: FlowIssue[]): void {
  if (!nodesById.has(graph.entryNodeId)) return;

  const adjacency = buildAdjacency(graph, nodesById);
  const depthByNode = new Map<string, number>([[graph.entryNodeId, 0]]);
  const queue = [graph.entryNodeId];

  while (queue.length) {
    const current = queue.shift() as string;
    const depth = depthByNode.get(current) ?? 0;

    for (const next of adjacency.get(current) ?? []) {
      if (depthByNode.has(next)) continue;
      depthByNode.set(next, depth + 1);
      queue.push(next);
    }
  }

  for (const [nodeId, depth] of depthByNode) {
    if (depth <= MAX_DEPTH) continue;
    errors.push({
      code: 'DEPTH_EXCEEDED',
      message: `node is ${depth} steps from the entry node (max ${MAX_DEPTH})`,
      nodeId,
    });
  }
}
