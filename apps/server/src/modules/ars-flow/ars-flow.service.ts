import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { renderArsFlow } from '../asterisk-config/renderers/ars-flow.renderer';
import {
  FlowEdge,
  FlowEdgeCondition,
  FlowGraph,
  FlowNode,
  FlowNodeType,
  isFlowEdgeCondition,
  isFlowNodeType,
} from './flow-graph.types';
import { FlowValidationContext, FlowValidationResult, validateFlowGraph } from './flow-graph.validator';
import { parseNodeConfig } from './node-config.parser';

export interface GraphNodeInput {
  nodeId: string;
  nodeType: FlowNodeType;
  label: string;
  config: unknown;
  posX?: number;
  posY?: number;
}

export interface GraphEdgeInput {
  edgeId: string;
  fromNodeId: string;
  toNodeId: string;
  condition: FlowEdgeCondition;
  digit?: string | null;
}

export interface ReplaceGraphInput {
  entryNodeId: string;
  nodes: GraphNodeInput[];
  edges: GraphEdgeInput[];
}

export interface CreateFlowInput {
  name: string;
  branchId?: string | null;
  description?: string | null;
}

const FLOW_FIELDS = {
  flowId: true,
  tenantId: true,
  branchId: true,
  name: true,
  description: true,
  status: true,
  entryNodeId: true,
  version: true,
  createdAt: true,
  updatedAt: true,
};

/**
 * ARS 플로우 그래프를 다룬다.
 *
 * 그래프는 노드/엣지 개별 CRUD 가 아니라 **한 덩어리로 교체**한다.
 * 개별 CRUD 로 두면 편집 중간 상태가 매번 검증에 걸려 저장 자체가 불가능해진다.
 */
@Injectable()
export class ArsFlowService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string) {
    return (this.prisma as any).arsFlows.findMany({
      where: { tenantId },
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
      select: FLOW_FIELDS,
    });
  }

  async get(tenantId: string, flowId: string) {
    const flow = await this.loadFlowOrThrow(tenantId, flowId);
    const [nodes, edges] = await Promise.all([
      (this.prisma as any).arsFlowNodes.findMany({
        where: { tenantId, flowId },
        orderBy: { nodeId: 'asc' },
      }),
      (this.prisma as any).arsFlowEdges.findMany({
        where: { tenantId, flowId },
        orderBy: [{ fromNodeId: 'asc' }, { sortOrder: 'asc' }],
      }),
    ]);

    return { flow, nodes, edges };
  }

  async create(tenantId: string, input: CreateFlowInput) {
    return (this.prisma as any).arsFlows.create({
      data: {
        tenantId,
        name: input.name.trim(),
        branchId: input.branchId ?? null,
        description: input.description ?? null,
        status: 'DRAFT',
      },
      select: FLOW_FIELDS,
    });
  }

  async remove(tenantId: string, flowId: string) {
    await this.loadFlowOrThrow(tenantId, flowId);
    await (this.prisma as any).arsFlows.delete({ where: { flowId } });
    return { deleted: true, flowId };
  }

  /** 저장하지 않고 검증만 한다. 편집기가 저장 전에 부른다. */
  async validate(
    tenantId: string,
    flowId: string,
    input: ReplaceGraphInput,
  ): Promise<FlowValidationResult> {
    const flow = await this.loadFlowOrThrow(tenantId, flowId);
    const graph = this.toGraph(flow, input);
    return validateFlowGraph(graph, await this.loadValidationContext(tenantId));
  }

  async replaceGraph(tenantId: string, flowId: string, input: ReplaceGraphInput) {
    const flow = await this.loadFlowOrThrow(tenantId, flowId);
    const graph = this.toGraph(flow, input);

    const result = validateFlowGraph(graph, await this.loadValidationContext(tenantId));
    if (result.errors.length) {
      throw new BadRequestException(
        `flow graph is not valid: ${result.errors.map((issue) => `${issue.code} ${issue.message}`).join(' / ')}`,
      );
    }

    await (this.prisma as any).$transaction(async (tx: any) => {
      // 엣지가 노드를 참조하므로 엣지를 먼저 지운다.
      await tx.arsFlowEdges.deleteMany({ where: { tenantId, flowId } });
      await tx.arsFlowNodes.deleteMany({ where: { tenantId, flowId } });

      await tx.arsFlowNodes.createMany({
        data: input.nodes.map((node) => ({
          nodeId: node.nodeId,
          tenantId,
          flowId,
          nodeType: node.nodeType,
          label: node.label,
          config: node.config as any,
          posX: node.posX ?? 0,
          posY: node.posY ?? 0,
        })),
      });

      await tx.arsFlowEdges.createMany({
        data: input.edges.map((edge, index) => ({
          edgeId: edge.edgeId,
          tenantId,
          flowId,
          fromNodeId: edge.fromNodeId,
          toNodeId: edge.toNodeId,
          condition: edge.condition,
          digit: edge.digit ?? null,
          sortOrder: index,
        })),
      });

      await tx.arsFlows.update({
        where: { flowId },
        data: { entryNodeId: input.entryNodeId, version: { increment: 1 } },
      });
    });

    return { saved: true, warnings: result.warnings };
  }

  /** 컴파일 결과를 문자열로만 준다. 파일을 쓰지 않는다. */
  async preview(tenantId: string, flowId: string, did: string) {
    const { flow, nodes, edges } = await this.get(tenantId, flowId);
    const graph = this.toGraph(flow, {
      entryNodeId: flow.entryNodeId ?? '',
      nodes,
      edges,
    });

    const result = validateFlowGraph(graph, await this.loadValidationContext(tenantId));
    if (result.errors.length) {
      throw new BadRequestException(
        `flow graph is not valid: ${result.errors.map((issue) => `${issue.code} ${issue.message}`).join(' / ')}`,
      );
    }

    return {
      conf: renderArsFlow({ graph, did, tenantId, branchId: flow.branchId ?? null }),
      warnings: result.warnings,
    };
  }

  private toGraph(flow: Record<string, any>, input: ReplaceGraphInput): FlowGraph {
    return {
      flowId: flow.flowId,
      name: flow.name,
      entryNodeId: input.entryNodeId,
      nodes: input.nodes.map((node) => this.toNode(node)),
      edges: input.edges.map((edge) => this.toEdge(edge)),
    };
  }

  private toNode(node: GraphNodeInput): FlowNode {
    if (!isFlowNodeType(node.nodeType)) {
      throw new BadRequestException(`unknown flow node type: ${node.nodeType}`);
    }
    try {
      return {
        nodeId: node.nodeId,
        nodeType: node.nodeType,
        label: node.label,
        config: parseNodeConfig(node.nodeType, node.config),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new BadRequestException(`node "${node.label}" has an invalid config: ${message}`);
    }
  }

  private toEdge(edge: GraphEdgeInput): FlowEdge {
    if (!isFlowEdgeCondition(edge.condition)) {
      throw new BadRequestException(`unknown flow edge condition: ${edge.condition}`);
    }
    return {
      edgeId: edge.edgeId,
      fromNodeId: edge.fromNodeId,
      toNodeId: edge.toNodeId,
      condition: edge.condition,
      digit: edge.digit ?? null,
    };
  }

  /** 큐·프롬프트·문자 템플릿의 실재 여부. 검증기는 DB 를 모르므로 여기서 모아 넘긴다. */
  private async loadValidationContext(tenantId: string): Promise<FlowValidationContext> {
    const [queues, prompts, templates] = await Promise.all([
      (this.prisma as any).queues.findMany({ where: { tenantId }, select: { queueName: true } }),
      (this.prisma as any).asteriskPrompt.findMany({
        where: { tenantId, isActive: true },
        select: { promptKey: true },
      }),
      (this.prisma as any).tenantSmsTemplate.findMany({
        where: { tenantId, isActive: true },
        select: { templateId: true },
      }),
    ]);

    return {
      queueNames: queues.map((queue: any) => queue.queueName),
      promptKeys: prompts.map((prompt: any) => prompt.promptKey),
      smsTemplateIds: templates.map((template: any) => template.templateId),
    };
  }

  private async loadFlowOrThrow(tenantId: string, flowId: string) {
    const flow = await (this.prisma as any).arsFlows.findFirst({
      where: { tenantId, flowId },
      select: FLOW_FIELDS,
    });
    if (!flow) {
      throw new NotFoundException('ars flow not found');
    }
    return flow;
  }
}
