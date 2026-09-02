import { PlatformAuthController } from './platform-auth.controller';

const ADMIN = {
  platformAdminId: '11111111-1111-1111-1111-111111111111',
  loginId: 'root',
  displayName: '플랫폼 관리자',
  mustChangePassword: true,
};

function buildController() {
  const service = {
    login: jest.fn().mockResolvedValue({ accessToken: 'a', refreshToken: 'r', admin: ADMIN }),
    refresh: jest.fn().mockResolvedValue({ accessToken: 'a2', refreshToken: 'r2' }),
    logout: jest.fn().mockResolvedValue({ success: true }),
    changePassword: jest.fn().mockResolvedValue({ changed: true }),
  } as any;
  return { controller: new PlatformAuthController(service), service };
}

describe('PlatformAuthController', () => {
  it('로그인은 user-agent 와 IP 를 함께 넘긴다', async () => {
    const { controller, service } = buildController();
    const dto = { loginId: 'root', password: 'Password123!' };

    await expect(controller.login(dto, 'jest-agent', '10.0.0.1')).resolves.toEqual({
      accessToken: 'a',
      refreshToken: 'r',
      admin: ADMIN,
    });
    expect(service.login).toHaveBeenCalledWith(dto, { userAgent: 'jest-agent', ipAddress: '10.0.0.1' });
  });

  it('refresh 는 새 토큰 쌍만 준다', async () => {
    const { controller, service } = buildController();

    await expect(controller.refresh({ refreshToken: 'r' })).resolves.toEqual({
      accessToken: 'a2',
      refreshToken: 'r2',
    });
    expect(service.refresh).toHaveBeenCalledWith('r');
  });

  it('로그아웃은 토큰이 없어도 호출된다 (멱등)', async () => {
    const { controller, service } = buildController();

    await expect(controller.logout({})).resolves.toEqual({ success: true });
    expect(service.logout).toHaveBeenCalledWith(undefined);
  });

  it('비밀번호 변경은 토큰의 관리자에게만 적용된다', async () => {
    const { controller, service } = buildController();
    const dto = { currentPassword: 'old', newPassword: 'NewPassword123!' };

    await expect(controller.changePassword({ platformAdmin: ADMIN }, dto)).resolves.toEqual({ changed: true });
    expect(service.changePassword).toHaveBeenCalledWith(ADMIN.platformAdminId, dto);
  });

  // 가드가 이미 DB 에서 읽어 실어 준 값이다. 한 번 더 조회하면 두 값이 어긋날 수 있다.
  it('me 는 가드가 실어 준 계약 필드를 그대로 준다', () => {
    const { controller } = buildController();

    expect(controller.me({ platformAdmin: ADMIN })).toEqual(ADMIN);
  });
});
