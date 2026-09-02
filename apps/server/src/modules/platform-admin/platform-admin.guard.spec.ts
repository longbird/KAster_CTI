import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as jwt from 'jsonwebtoken';
import { PlatformAdminGuard } from './platform-admin.guard';

const SECRET = 'platform-guard-test-secret';
const ADMIN_ID = '11111111-1111-1111-1111-111111111111';

const ACTIVE_ADMIN = {
  platformAdminId: ADMIN_ID,
  loginId: 'root',
  displayName: '플랫폼 관리자',
  isActive: true,
  mustChangePassword: false,
};

function sign(payload: Record<string, unknown>, secret = SECRET): string {
  return jwt.sign(payload, secret, { expiresIn: '5m' });
}

function buildRequest(token?: string) {
  return { headers: token ? { authorization: `Bearer ${token}` } : {} } as any;
}

function buildContext(request: any): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function buildGuard(admin: unknown = ACTIVE_ADMIN, allowMustChangePassword = false) {
  const config = {
    get: (key: string, fallback?: string) => (key === 'JWT_SECRET' ? SECRET : fallback),
  } as any;
  const findUnique = jest.fn().mockResolvedValue(admin);
  const prisma = { platformAdmins: { findUnique } } as any;
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(allowMustChangePassword),
  } as unknown as Reflector;

  return { guard: new PlatformAdminGuard(config, prisma, reflector), findUnique };
}

describe('PlatformAdminGuard', () => {
  it('플랫폼 토큰이면 통과하고 요청에 관리자를 실어 준다', async () => {
    const { guard, findUnique } = buildGuard();
    const request = buildRequest(sign({ sub: ADMIN_ID, scope: 'platform' }));

    await expect(guard.canActivate(buildContext(request))).resolves.toBe(true);
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { platformAdminId: ADMIN_ID } }),
    );
    expect(request.platformAdmin.platformAdminId).toBe(ADMIN_ID);
  });

  // 같은 JWT_SECRET 을 쓰므로 서명 검증만으로는 상담원 토큰이 그대로 통과한다.
  // 이 검사가 없으면 상담원 access token 으로 전 테넌트 자격을 바꿀 수 있다.
  it('상담원 토큰(scope 없음)은 거부한다', async () => {
    const { guard, findUnique } = buildGuard();
    const token = sign({ sub: 'agent-1', tenantId: 'tenant-1', role: 'admin', extension: '1001' });

    await expect(guard.canActivate(buildContext(buildRequest(token))))
      .rejects.toBeInstanceOf(UnauthorizedException);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('scope 가 platform 이 아닌 토큰도 거부한다', async () => {
    const { guard } = buildGuard();
    const token = sign({ sub: 'agent-1', scope: 'tenant' });

    await expect(guard.canActivate(buildContext(buildRequest(token))))
      .rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('Authorization 헤더가 없으면 거부한다', async () => {
    const { guard } = buildGuard();

    await expect(guard.canActivate(buildContext(buildRequest())))
      .rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('다른 비밀로 서명된 토큰은 거부한다', async () => {
    const { guard } = buildGuard();
    const token = sign({ sub: ADMIN_ID, scope: 'platform' }, 'another-secret');

    await expect(guard.canActivate(buildContext(buildRequest(token))))
      .rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('없거나 비활성인 계정은 거부한다', async () => {
    const token = sign({ sub: ADMIN_ID, scope: 'platform' });

    await expect(buildGuard(null).guard.canActivate(buildContext(buildRequest(token))))
      .rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      buildGuard({ ...ACTIVE_ADMIN, isActive: false }).guard.canActivate(buildContext(buildRequest(token))),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('비밀번호를 바꿔야 하는 계정은 다른 API 에서 403 이다', async () => {
    const { guard } = buildGuard({ ...ACTIVE_ADMIN, mustChangePassword: true });
    const token = sign({ sub: ADMIN_ID, scope: 'platform' });

    await expect(guard.canActivate(buildContext(buildRequest(token))))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('비밀번호 변경 경로는 mustChangePassword 여도 통과한다', async () => {
    const { guard } = buildGuard({ ...ACTIVE_ADMIN, mustChangePassword: true }, true);
    const token = sign({ sub: ADMIN_ID, scope: 'platform' });

    await expect(guard.canActivate(buildContext(buildRequest(token)))).resolves.toBe(true);
  });
});
