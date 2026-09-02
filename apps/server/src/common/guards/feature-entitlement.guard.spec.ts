import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FeatureEntitlementGuard } from './feature-entitlement.guard';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';

function buildContext(user: unknown = { tenantId: TENANT_ID, role: 'admin' }): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function buildGuard(featureKey: string | undefined, enabled = true) {
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(featureKey) } as unknown as Reflector;
  const assertEnabled = jest.fn().mockImplementation(async () => {
    if (!enabled) throw new ForbiddenException('막힘');
  });
  const entitlement = { assertEnabled } as any;
  return { guard: new FeatureEntitlementGuard(reflector, entitlement), assertEnabled };
}

describe('FeatureEntitlementGuard', () => {
  it('데코레이터가 없으면 이 가드의 관심사가 아니다', async () => {
    const { guard, assertEnabled } = buildGuard(undefined);

    await expect(guard.canActivate(buildContext())).resolves.toBe(true);
    expect(assertEnabled).not.toHaveBeenCalled();
  });

  it('자격이 있으면 통과한다', async () => {
    const { guard, assertEnabled } = buildGuard('call-analysis');

    await expect(guard.canActivate(buildContext())).resolves.toBe(true);
    expect(assertEnabled).toHaveBeenCalledWith(TENANT_ID, 'call-analysis');
  });

  it('자격이 없으면 판정 서비스가 던진 예외를 그대로 올린다', async () => {
    const { guard } = buildGuard('call-analysis', false);

    await expect(guard.canActivate(buildContext())).rejects.toBeInstanceOf(ForbiddenException);
  });

  // JwtAuthGuard 보다 먼저 돌면 user 가 없다. 그때 통과시키면 검사가 조용히 사라진다.
  it('테넌트를 알 수 없으면 통과시키지 않는다', async () => {
    const { guard, assertEnabled } = buildGuard('call-analysis');

    await expect(guard.canActivate(buildContext(null))).rejects.toBeInstanceOf(ForbiddenException);
    expect(assertEnabled).not.toHaveBeenCalled();
  });

  it('tenantId 가 없는 사용자도 통과시키지 않는다', async () => {
    const { guard } = buildGuard('call-analysis');

    await expect(guard.canActivate(buildContext({ role: 'admin' }))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('메서드와 클래스 데코레이터를 함께 본다', async () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue('call-analysis') } as unknown as Reflector;
    const guard = new FeatureEntitlementGuard(reflector, { assertEnabled: jest.fn() } as any);

    await guard.canActivate(buildContext());

    const [, targets] = (reflector.getAllAndOverride as jest.Mock).mock.calls[0];
    expect(targets).toHaveLength(2);
  });
});
