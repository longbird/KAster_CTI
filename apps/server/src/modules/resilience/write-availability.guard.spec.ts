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

function buildContext() {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({}) }),
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
