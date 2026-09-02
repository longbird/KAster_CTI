import { PlatformTenantsController } from './platform-tenants.controller';

const TENANT = {
  tenantId: '00000000-0000-0000-0000-000000000001',
  tenantCode: 'demo',
  tenantName: '데모 회사',
  isActive: true,
};

function buildController() {
  const prisma: any = { tenants: { findMany: jest.fn().mockResolvedValue([TENANT]) } };
  return { controller: new PlatformTenantsController(prisma), prisma };
}

describe('PlatformTenantsController', () => {
  it('테넌트 목록을 준다', async () => {
    const { controller } = buildController();

    await expect(controller.list()).resolves.toEqual([TENANT]);
  });

  // 설계 D2 — 플랫폼 관리자는 테넌트 업무 데이터를 읽지 않는다.
  // 이 계정이 뚫리면 모든 테넌트가 뚫리므로 할 수 있는 일을 처음부터 줄여 둔다.
  it('식별 정보 네 개만 조회한다', async () => {
    const { controller, prisma } = buildController();

    await controller.list();

    const [{ select }] = prisma.tenants.findMany.mock.calls[0];
    expect(Object.keys(select).sort()).toEqual(['isActive', 'tenantCode', 'tenantId', 'tenantName']);
  });
});
