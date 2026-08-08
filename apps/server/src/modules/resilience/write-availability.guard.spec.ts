import { ServiceUnavailableException } from '@nestjs/common';
import { WriteAvailabilityGuard } from './write-availability.guard';
import { OperatingModeService } from './operating-mode.service';

const T0 = new Date('2026-08-08T00:00:00.000Z');

function buildMode(degradedAfterMs = 0) {
  const config = {
    get: (key: string, fallback: any) =>
      key === 'RESILIENCE_DEGRADED_AFTER_MS' ? String(degradedAfterMs) : fallback,
  };
  return new OperatingModeService(config as any);
}

function buildContext(method = 'POST') {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ method }) }),
  } as any;
}

function buildGuard(kind: 'general' | 'emergency' | undefined, mode: OperatingModeService) {
  const reflector = { getAllAndOverride: () => kind } as any;
  return new WriteAvailabilityGuard(reflector, mode);
}

describe('WriteAvailabilityGuard', () => {
  it('데코레이터가 없는 엔드포인트는 그대로 통과시킨다', () => {
    const guard = buildGuard(undefined, buildMode());

    expect(guard.canActivate(buildContext())).toBe(true);
  });

  it('NORMAL 에서는 일반 쓰기를 통과시킨다', () => {
    const guard = buildGuard('general', buildMode());

    expect(guard.canActivate(buildContext())).toBe(true);
  });

  it('DB_FAILOVER 에서는 일반 쓰기를 막는다', () => {
    const mode = buildMode();
    mode.recordDbFailure(T0);
    const guard = buildGuard('general', mode);

    expect(() => guard.canActivate(buildContext())).toThrow(ServiceUnavailableException);
  });

  it('DEGRADED 에서도 긴급 쓰기는 통과시킨다', () => {
    const mode = buildMode(0);
    mode.recordDbFailure(T0);
    mode.recordDbFailure(new Date(T0.getTime() + 1000));
    expect(mode.getMode()).toBe('DEGRADED');
    const guard = buildGuard('emergency', mode);

    expect(guard.canActivate(buildContext())).toBe(true);
  });

  it('차단 시 코드와 현재 운영 모드를 응답에 담는다', () => {
    const mode = buildMode();
    mode.recordDbFailure(T0);
    const guard = buildGuard('general', mode);

    try {
      guard.canActivate(buildContext());
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ServiceUnavailableException);
      expect((err as ServiceUnavailableException).getResponse()).toEqual(
        expect.objectContaining({
          code: 'OPERATING_MODE_RESTRICTED',
          operatingMode: 'DB_FAILOVER',
        }),
      );
    }
  });

  it('RECOVERING 에서도 일반 쓰기를 막는다', () => {
    const mode = buildMode();
    mode.recordDbFailure(T0);
    mode.recordDbRecovered(new Date(T0.getTime() + 60_000));
    expect(mode.getMode()).toBe('RECOVERING');
    const guard = buildGuard('general', mode);

    expect(() => guard.canActivate(buildContext())).toThrow(ServiceUnavailableException);
  });
});

describe('WriteAvailabilityGuard HTTP 메서드', () => {
  // 컨트롤러 클래스 전체에 데코레이터를 붙여도 조회는 막히면 안 된다.
  // 장애 중에도 관리자 화면은 읽을 수 있어야 상황을 파악한다.
  it.each(['GET', 'HEAD', 'OPTIONS'])('%s 는 제한 모드에서도 통과시킨다', (method) => {
    const mode = buildMode();
    mode.recordDbFailure(T0);
    const guard = buildGuard('general', mode);

    expect(guard.canActivate(buildContext(method))).toBe(true);
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('%s 는 제한 모드에서 막는다', (method) => {
    const mode = buildMode();
    mode.recordDbFailure(T0);
    const guard = buildGuard('general', mode);

    expect(() => guard.canActivate(buildContext(method))).toThrow(ServiceUnavailableException);
  });
});
