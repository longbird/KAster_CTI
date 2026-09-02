import { BadRequestException } from '@nestjs/common';
import { assertArsFlowAttachable } from './did-ars-flow';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const FLOW_ID = 'a7fee255-3514-4ca2-a0ba-d2c9d533ec50';

function buildPrisma(flow: Record<string, unknown> | null) {
  return {
    arsFlows: { findFirst: jest.fn().mockResolvedValue(flow) },
  } as any;
}

describe('assertArsFlowAttachable', () => {
  it('flowId 가 없으면 검사할 것이 없다', async () => {
    const prisma = buildPrisma(null);

    await expect(assertArsFlowAttachable(prisma, TENANT_ID, undefined)).resolves.toBeUndefined();
    await expect(assertArsFlowAttachable(prisma, TENANT_ID, null)).resolves.toBeUndefined();
    expect(prisma.arsFlows.findFirst).not.toHaveBeenCalled();
  });

  it('진입 노드가 있는 플로우는 걸 수 있다', async () => {
    const prisma = buildPrisma({ flowId: FLOW_ID, name: 'pilot-flow', entryNodeId: 'node-1' });

    await expect(assertArsFlowAttachable(prisma, TENANT_ID, FLOW_ID)).resolves.toBeUndefined();
  });

  it('테넌트 조건 없이 찾지 않는다', async () => {
    const prisma = buildPrisma({ flowId: FLOW_ID, name: 'f', entryNodeId: 'node-1' });

    await assertArsFlowAttachable(prisma, TENANT_ID, FLOW_ID);

    expect(prisma.arsFlows.findFirst.mock.calls[0][0].where).toMatchObject({
      tenantId: TENANT_ID,
      flowId: FLOW_ID,
    });
  });

  it('없는 플로우는 거부한다', async () => {
    const prisma = buildPrisma(null);

    await expect(assertArsFlowAttachable(prisma, TENANT_ID, FLOW_ID)).rejects.toBeInstanceOf(BadRequestException);
  });

  /**
   * 파일럿에서 겪은 실패를 여기서 미리 막는다. 진입 노드가 없는 플로우를 걸어두면
   * 렌더 가드가 PBX 설정 적용 자체를 막아 다른 변경까지 못 하게 된다.
   */
  it('진입 노드가 없는 플로우는 걸 수 없다', async () => {
    const prisma = buildPrisma({ flowId: FLOW_ID, name: 'pilot-flow', entryNodeId: null });

    await expect(assertArsFlowAttachable(prisma, TENANT_ID, FLOW_ID)).rejects.toThrow(/진입 노드/);
  });

  it('거부 메시지에 플로우 이름을 담는다', async () => {
    const prisma = buildPrisma({ flowId: FLOW_ID, name: 'pilot-flow', entryNodeId: null });

    await expect(assertArsFlowAttachable(prisma, TENANT_ID, FLOW_ID)).rejects.toThrow(/pilot-flow/);
  });
});
