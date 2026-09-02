import { renderDialplan, type DidInput } from './dialplan.renderer';
import type { FlowGraph } from '../../ars-flow/flow-graph.types';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';

function flowGraph(): FlowGraph {
  return {
    flowId: 'flow-1',
    name: 'main-flow',
    entryNodeId: 'menu',
    nodes: [
      { nodeId: 'menu', nodeType: 'MENU', label: '메인', config: { promptKey: 'menu', timeoutSeconds: 5, maxRetries: 2 } },
      { nodeId: 'q1', nodeType: 'QUEUE', label: '영업', config: { queueName: 'sales' } },
      { nodeId: 'bye', nodeType: 'HANGUP', label: '종료', config: { promptKey: 'vm-goodbye' } },
    ],
    edges: [
      { edgeId: 'e1', fromNodeId: 'menu', toNodeId: 'q1', condition: 'DIGIT', digit: '1' },
      { edgeId: 'e2', fromNodeId: 'menu', toNodeId: 'bye', condition: 'TIMEOUT' },
    ],
  };
}

function did(overrides: Partial<DidInput> = {}): DidInput {
  return {
    id: 'did-1',
    did: '16001234',
    description: null,
    ivrMenuId: null,
    directQueue: null,
    enabled: true,
    ...overrides,
  };
}

function render(dids: DidInput[], extra: Record<string, unknown> = {}) {
  return renderDialplan({ dids, ivrMenus: [], ...extra } as any);
}

describe('ARS 플로우가 걸린 DID', () => {
  it('DID 가 플로우 컨텍스트로 들어간다', () => {
    const { extensionsInbound } = render([
      did({ arsFlow: { tenantId: TENANT_ID, graph: flowGraph() } }),
    ]);

    expect(extensionsInbound).toContain('exten => 16001234,1,NoOp(Inbound DID ${EXTEN} -> ARS flow)');
    expect(extensionsInbound).toContain('Goto(ars-flow-main-flow,s,1)');
  });

  it('플로우 컨텍스트는 IVR·Smart ARS 와 같은 파일에 나온다', () => {
    const { extensionsQueue, extensionsInbound } = render([
      did({ arsFlow: { tenantId: TENANT_ID, graph: flowGraph() } }),
    ]);

    // 진입점은 inbound, 컨텍스트 본체는 queue — 기존 IVR/Smart ARS 와 같은 배치다.
    expect(extensionsQueue).toContain('[ars-flow-main-flow]');
    expect(extensionsQueue).toContain('exten => 1,1,Goto(queue-entry,sales,1)');
    expect(extensionsInbound).not.toContain('[ars-flow-main-flow]');
  });

  it('차단 번호 검사를 플로우보다 먼저 지난다', () => {
    const { extensionsInbound } = render(
      [did({ arsFlow: { tenantId: TENANT_ID, graph: flowGraph() } })],
      { blocklistEntries: [{ id: 'b1', matchType: 'EXACT', phoneNumber: '01011112222', isActive: true }] },
    );

    const blockIndex = extensionsInbound.indexOf('blocked-ani');
    const flowIndex = extensionsInbound.indexOf('Goto(ars-flow-main-flow,s,1)');
    expect(blockIndex).toBeGreaterThan(-1);
    expect(blockIndex).toBeLessThan(flowIndex);
  });

  describe('갈래 우선순위', () => {
    // 플로우가 걸리면 나머지 세 경로는 타지 않는다. 한 DID 가 두 경로를 동시에 타면 안 된다.
    it('플로우가 수신거부·Smart ARS·표준보다 앞선다', () => {
      const { extensionsInbound } = render([
        did({
          arsFlow: { tenantId: TENANT_ID, graph: flowGraph() },
          directQueue: 'support',
          branchSmartArs: {
            enabled: true,
            tenantId: TENANT_ID,
            branchId: null,
            timeoutSeconds: 5,
            maxRetries: 2,
            actions: [{ digit: '1', actionType: 'QUEUE_ROUTE', queueName: 'support' }],
          } as any,
        }),
      ]);

      expect(extensionsInbound).toContain('Goto(ars-flow-main-flow,s,1)');
      expect(extensionsInbound).not.toContain('Goto(smart-ars-');
      expect(extensionsInbound).not.toContain('Goto(queue-entry,support,1)');
    });

    it('플로우가 없으면 기존 경로가 그대로 동작한다', () => {
      const { extensionsInbound } = render([did({ directQueue: 'support' })]);

      expect(extensionsInbound).toContain('Goto(queue-entry,support,1)');
      expect(extensionsInbound).not.toContain('ars-flow-');
    });
  });

  it('여러 DID 가 같은 플로우를 공유해도 컨텍스트는 한 번만 나온다', () => {
    const graph = flowGraph();
    const { extensionsQueue } = render([
      did({ id: 'd1', did: '16001234', arsFlow: { tenantId: TENANT_ID, graph } }),
      did({ id: 'd2', did: '16005678', arsFlow: { tenantId: TENANT_ID, graph } }),
    ]);

    expect(extensionsQueue.split('[ars-flow-main-flow]').length - 1).toBe(1);
  });

  it('DID 마다 다른 플로우면 컨텍스트가 각각 나온다', () => {
    const second = { ...flowGraph(), flowId: 'flow-2', name: 'second-flow' };
    const { extensionsQueue } = render([
      did({ id: 'd1', did: '16001234', arsFlow: { tenantId: TENANT_ID, graph: flowGraph() } }),
      did({ id: 'd2', did: '16005678', arsFlow: { tenantId: TENANT_ID, graph: second } }),
    ]);

    expect(extensionsQueue).toContain('[ars-flow-main-flow]');
    expect(extensionsQueue).toContain('[ars-flow-second-flow]');
  });

  it('꺼진 DID 의 플로우는 렌더하지 않는다', () => {
    const { extensionsQueue } = render([
      did({ enabled: false, arsFlow: { tenantId: TENANT_ID, graph: flowGraph() } }),
    ]);

    expect(extensionsQueue).not.toContain('[ars-flow-main-flow]');
  });
});
