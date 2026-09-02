import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ArsFlowService } from './ars-flow.service';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const FLOW_ID = '00000000-0000-0000-0000-0000000000f1';

const FLOW_ROW = {
  flowId: FLOW_ID,
  tenantId: TENANT_ID,
  branchId: null,
  name: '대표번호 안내',
  description: null,
  status: 'DRAFT',
  entryNodeId: 'n-menu',
  version: 1,
};

const NODE_ROWS = [
  { nodeId: 'n-menu', flowId: FLOW_ID, nodeType: 'MENU', label: '메인', config: { promptKey: 'menu', timeoutSeconds: 5, maxRetries: 2 }, posX: 10, posY: 20 },
  { nodeId: 'n-q', flowId: FLOW_ID, nodeType: 'QUEUE', label: '영업', config: { queueName: 'sales' }, posX: 30, posY: 40 },
];

const EDGE_ROWS = [
  { edgeId: 'e1', flowId: FLOW_ID, fromNodeId: 'n-menu', toNodeId: 'n-q', condition: 'DIGIT', digit: '1', sortOrder: 0 },
];

const VALID_GRAPH_INPUT = {
  entryNodeId: 'n-menu',
  nodes: [
    { nodeId: 'n-menu', nodeType: 'MENU' as const, label: '메인', config: { promptKey: 'menu', timeoutSeconds: 5 }, posX: 0, posY: 0 },
    { nodeId: 'n-q', nodeType: 'QUEUE' as const, label: '영업', config: { queueName: 'sales' }, posX: 0, posY: 0 },
  ],
  edges: [
    { edgeId: 'e1', fromNodeId: 'n-menu', toNodeId: 'n-q', condition: 'DIGIT' as const, digit: '1' },
  ],
};

function buildService(options: {
  flow?: Record<string, unknown> | null;
  nodes?: Array<Record<string, unknown>>;
  edges?: Array<Record<string, unknown>>;
  queues?: Array<{ queueName: string }>;
  prompts?: Array<{ promptKey: string }>;
  templates?: Array<{ templateId: string }>;
  ivrMenu?: Record<string, unknown> | null;
  duplicateFlow?: boolean;
} = {}) {
  const state = { created: [] as any[], nodeCreates: [] as any[], edgeCreates: [] as any[], deletes: [] as string[] };
  const prisma: any = {
    arsFlows: {
      findMany: jest.fn().mockResolvedValue([FLOW_ROW]),
      findFirst: jest.fn().mockImplementation(async (args: any) => {
        // 이름으로 찾으면 중복 검사다. flowId 로 찾으면 플로우 로딩이다.
        if (args?.where?.name !== undefined) {
          return options.duplicateFlow ? { flowId: FLOW_ID } : null;
        }
        return options.flow === undefined ? FLOW_ROW : options.flow;
      }),
      create: jest.fn().mockImplementation(async (args: any) => {
        state.created.push(args);
        return { ...FLOW_ROW, ...args.data };
      }),
      update: jest.fn().mockImplementation(async (args: any) => ({ ...FLOW_ROW, ...args.data })),
      delete: jest.fn().mockImplementation(async () => {
        state.deletes.push('flow');
        return FLOW_ROW;
      }),
    },
    arsFlowNodes: {
      findMany: jest.fn().mockResolvedValue(options.nodes ?? NODE_ROWS),
      deleteMany: jest.fn().mockImplementation(async () => {
        state.deletes.push('nodes');
        return { count: 0 };
      }),
      createMany: jest.fn().mockImplementation(async (args: any) => {
        state.nodeCreates.push(...args.data);
        return { count: args.data.length };
      }),
    },
    arsFlowEdges: {
      findMany: jest.fn().mockResolvedValue(options.edges ?? EDGE_ROWS),
      deleteMany: jest.fn().mockImplementation(async () => {
        state.deletes.push('edges');
        return { count: 0 };
      }),
      createMany: jest.fn().mockImplementation(async (args: any) => {
        state.edgeCreates.push(...args.data);
        return { count: args.data.length };
      }),
    },
    asteriskIvrMenu: {
      findFirst: jest.fn().mockResolvedValue(options.ivrMenu === undefined ? null : options.ivrMenu),
    },
    queues: { findMany: jest.fn().mockResolvedValue(options.queues ?? [{ queueName: 'sales' }]) },
    asteriskPrompt: { findMany: jest.fn().mockResolvedValue(options.prompts ?? [{ promptKey: 'menu' }]) },
    tenantSmsTemplate: { findMany: jest.fn().mockResolvedValue(options.templates ?? [{ templateId: 'tpl-1' }]) },
    $transaction: jest.fn().mockImplementation(async (fn: any) => fn(prisma)),
  };

  return { service: new ArsFlowService(prisma), prisma, state };
}

describe('ArsFlowService', () => {
  describe('조회', () => {
    it('그래프를 노드·엣지와 함께 준다', async () => {
      const { service } = buildService();

      const result = await service.get(TENANT_ID, FLOW_ID);

      expect(result.flow.flowId).toBe(FLOW_ID);
      expect(result.nodes).toHaveLength(2);
      expect(result.edges).toHaveLength(1);
    });

    it('편집기 좌표는 조회 결과에 남긴다', async () => {
      const { service } = buildService();

      const result = await service.get(TENANT_ID, FLOW_ID);

      expect(result.nodes[0]).toMatchObject({ posX: 10, posY: 20 });
    });

    it('없는 플로우는 404', async () => {
      const { service } = buildService({ flow: null });

      await expect(service.get(TENANT_ID, FLOW_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('테넌트 조건 없이 찾지 않는다', async () => {
      const { service, prisma } = buildService();

      await service.get(TENANT_ID, FLOW_ID);

      expect(prisma.arsFlows.findFirst.mock.calls[0][0].where).toMatchObject({ tenantId: TENANT_ID, flowId: FLOW_ID });
    });
  });

  describe('그래프 교체', () => {
    it('검증을 통과하면 노드와 엣지를 통째로 갈아끼운다', async () => {
      const { service, state } = buildService();

      await service.replaceGraph(TENANT_ID, FLOW_ID, VALID_GRAPH_INPUT);

      expect(state.deletes).toEqual(expect.arrayContaining(['edges', 'nodes']));
      expect(state.nodeCreates).toHaveLength(2);
      expect(state.edgeCreates).toHaveLength(1);
    });

    // 엣지가 노드를 참조하므로 지우는 순서가 반대면 FK 가 걸린다.
    it('엣지를 노드보다 먼저 지운다', async () => {
      const { service, state } = buildService();

      await service.replaceGraph(TENANT_ID, FLOW_ID, VALID_GRAPH_INPUT);

      expect(state.deletes.indexOf('edges')).toBeLessThan(state.deletes.indexOf('nodes'));
    });

    it('한 트랜잭션 안에서 처리한다', async () => {
      const { service, prisma } = buildService();

      await service.replaceGraph(TENANT_ID, FLOW_ID, VALID_GRAPH_INPUT);

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('노드 설정이 깨졌으면 저장하지 않는다', async () => {
      const { service, state } = buildService();

      await expect(
        service.replaceGraph(TENANT_ID, FLOW_ID, {
          ...VALID_GRAPH_INPUT,
          nodes: [{ nodeId: 'n1', nodeType: 'QUEUE' as const, label: 'x', config: {}, posX: 0, posY: 0 }],
          edges: [],
          entryNodeId: 'n1',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(state.nodeCreates).toHaveLength(0);
    });

    it('그래프 검증 오류가 있으면 저장하지 않고 이유를 준다', async () => {
      const { service, state } = buildService({ queues: [] });

      await expect(service.replaceGraph(TENANT_ID, FLOW_ID, VALID_GRAPH_INPUT)).rejects.toThrow(/QUEUE_NOT_FOUND/);
      expect(state.nodeCreates).toHaveLength(0);
    });

    it('갇히는 순환은 저장하지 않는다', async () => {
      const { service } = buildService({ prompts: [{ promptKey: 'a' }] });

      await expect(
        service.replaceGraph(TENANT_ID, FLOW_ID, {
          entryNodeId: 'p1',
          nodes: [
            { nodeId: 'p1', nodeType: 'PLAY' as const, label: 'p1', config: { promptKeys: ['a'] }, posX: 0, posY: 0 },
            { nodeId: 'p2', nodeType: 'PLAY' as const, label: 'p2', config: { promptKeys: ['a'] }, posX: 0, posY: 0 },
          ],
          edges: [
            { edgeId: 'e1', fromNodeId: 'p1', toNodeId: 'p2', condition: 'DEFAULT' as const },
            { edgeId: 'e2', fromNodeId: 'p2', toNodeId: 'p1', condition: 'DEFAULT' as const },
          ],
        }),
      ).rejects.toThrow(/TRAPPED_CYCLE/);
    });

    it('경고만 있으면 저장한다', async () => {
      const { service, state } = buildService();

      await service.replaceGraph(TENANT_ID, FLOW_ID, {
        ...VALID_GRAPH_INPUT,
        nodes: [
          ...VALID_GRAPH_INPUT.nodes,
          { nodeId: 'orphan', nodeType: 'HANGUP' as const, label: '고아', config: {}, posX: 0, posY: 0 },
        ],
      });

      expect(state.nodeCreates).toHaveLength(3);
    });
  });

  describe('검증', () => {
    it('저장하지 않고 오류와 경고를 준다', async () => {
      const { service, state } = buildService({ queues: [] });

      const result = await service.validate(TENANT_ID, FLOW_ID, VALID_GRAPH_INPUT);

      expect(result.errors.map((issue) => issue.code)).toContain('QUEUE_NOT_FOUND');
      expect(state.nodeCreates).toHaveLength(0);
    });
  });

  describe('미리보기', () => {
    it('컴파일된 conf 를 문자열로 준다', async () => {
      const { service } = buildService();

      const result = await service.preview(TENANT_ID, FLOW_ID, '16001234');

      expect(result.conf).toContain('[ars-flow-');
      expect(result.conf).toContain('Goto(queue-entry,sales,1)');
    });

    it('오류가 있는 그래프는 미리보기도 거절한다', async () => {
      const { service } = buildService({ queues: [] });

      await expect(service.preview(TENANT_ID, FLOW_ID, '16001234')).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('생성·삭제', () => {
    it('DRAFT 로 만든다', async () => {
      const { service, state } = buildService({ flow: null });

      await service.create(TENANT_ID, { name: '신규 플로우' });

      expect(state.created[0].data).toMatchObject({ tenantId: TENANT_ID, name: '신규 플로우', status: 'DRAFT' });
    });

    it('없는 플로우는 삭제할 수 없다', async () => {
      const { service } = buildService({ flow: null });

      await expect(service.remove(TENANT_ID, FLOW_ID)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});


describe('ArsFlowService.importFromIvrMenu', () => {
  const MENU_ID = '00000000-0000-0000-0000-0000000000m1'.replace('m', 'a');
  const MENU = {
    id: MENU_ID,
    name: '대표 안내',
    welcomePrompt: null,
    menuPrompt: 'menu',
    timeoutSecs: 5,
    entries: [
      { id: 'e1', digit: '1', label: '영업', queueName: 'sales' },
    ],
  };

  it('메뉴가 없으면 404 다', async () => {
    const { service } = buildService({ ivrMenu: null });

    await expect(service.importFromIvrMenu(TENANT_ID, MENU_ID)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('같은 이름의 플로우가 있으면 만들지 않는다', async () => {
    const { service, prisma } = buildService({ ivrMenu: MENU, duplicateFlow: true });

    await expect(service.importFromIvrMenu(TENANT_ID, MENU_ID)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.arsFlows.create).not.toHaveBeenCalled();
  });

  it('DRAFT 플로우와 그래프를 함께 만든다', async () => {
    const { service, state } = buildService({ ivrMenu: MENU });

    const result = await service.importFromIvrMenu(TENANT_ID, MENU_ID);

    expect(result.flowId).toBeTruthy();
    expect(state.nodeCreates.map((node: any) => node.nodeType).sort())
      .toEqual(['HANGUP', 'MENU', 'QUEUE']);
    expect(state.edgeCreates.map((edge: any) => edge.condition).sort())
      .toEqual(['DIGIT', 'TIMEOUT']);
  });

  it('원래 메뉴는 건드리지 않는다 — 확인 전까지 통화는 기존 경로로 흐른다', async () => {
    const { service, prisma } = buildService({ ivrMenu: MENU });

    await service.importFromIvrMenu(TENANT_ID, MENU_ID);

    expect(prisma.asteriskIvrMenu.findFirst).toHaveBeenCalled();
    expect((prisma.asteriskIvrMenu as any).update).toBeUndefined();
  });

  it('검증에 걸리면 빈 플로우를 남기지 않는다', async () => {
    // 큐가 실재하지 않으므로 QUEUE_NOT_FOUND 로 저장이 막힌다.
    const { service, state } = buildService({ ivrMenu: MENU, queues: [] });

    await expect(service.importFromIvrMenu(TENANT_ID, MENU_ID)).rejects.toBeInstanceOf(BadRequestException);
    expect(state.deletes).toContain('flow');
  });
});
