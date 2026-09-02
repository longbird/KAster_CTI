import { PlatformAdminsController } from './platform-admins.controller';

const ADMIN_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_ID = '22222222-2222-2222-2222-222222222222';
const REQ = { platformAdmin: { platformAdminId: ADMIN_ID } };
const ROW = { platformAdminId: OTHER_ID, loginId: 'second' };

function buildController() {
  const service = {
    list: jest.fn().mockResolvedValue([ROW]),
    create: jest.fn().mockResolvedValue(ROW),
    setActive: jest.fn().mockResolvedValue(ROW),
  } as any;
  return { controller: new PlatformAdminsController(service), service };
}

describe('PlatformAdminsController', () => {
  it('목록을 준다', async () => {
    const { controller } = buildController();

    await expect(controller.list()).resolves.toEqual([ROW]);
  });

  it('계정을 만든다', async () => {
    const { controller, service } = buildController();
    const dto = { loginId: 'second', displayName: '두 번째 관리자', password: 'Password123!' };

    await expect(controller.create(dto)).resolves.toEqual(ROW);
    expect(service.create).toHaveBeenCalledWith(dto);
  });

  // 자기 계정 비활성화 방지는 서비스가 판단한다 — 누가 요청했는지를 반드시 넘긴다.
  it('활성 여부를 바꿀 때 요청한 관리자를 함께 넘긴다', async () => {
    const { controller, service } = buildController();

    await expect(controller.update(OTHER_ID, { isActive: false }, REQ)).resolves.toEqual(ROW);
    expect(service.setActive).toHaveBeenCalledWith(OTHER_ID, false, ADMIN_ID);
  });
});
