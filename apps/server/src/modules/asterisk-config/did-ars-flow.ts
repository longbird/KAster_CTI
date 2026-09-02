import { BadRequestException } from '@nestjs/common';

/**
 * DID 에 ARS 플로우를 걸 수 있는지 확인한다.
 *
 * 플로우는 기존 경로(IVR/큐/내선)를 대체하지 않고 **위에 얹힌다**. 플로우가 지워지면
 * FK SetNull 로 flowId 가 비고, 그 DID 는 원래 경로로 되돌아간다. 그래서 라우팅 XOR
 * 검사에는 넣지 않는다 — 넣으면 플로우를 지웠을 때 DID 가 갈 곳을 잃는다.
 *
 * 진입 노드가 없는 플로우를 걸어두면 렌더 가드가 PBX 설정 적용 자체를 막아
 * 무관한 변경까지 못 하게 된다. 그래서 거는 시점에 먼저 막는다.
 */
export async function assertArsFlowAttachable(
  prisma: any,
  tenantId: string,
  flowId: string | null | undefined,
): Promise<void> {
  if (!flowId) return;

  const flow = await prisma.arsFlows.findFirst({
    where: { tenantId, flowId },
    select: { flowId: true, name: true, entryNodeId: true },
  });

  if (!flow) {
    throw new BadRequestException(`ARS 플로우를 찾을 수 없습니다: ${flowId}`);
  }

  if (!flow.entryNodeId) {
    throw new BadRequestException(
      `"${flow.name}" 플로우는 진입 노드가 없어 DID 에 걸 수 없습니다. 먼저 시나리오를 완성하세요.`,
    );
  }
}
