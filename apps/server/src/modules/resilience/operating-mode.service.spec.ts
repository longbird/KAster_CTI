import { OperatingModeService } from './operating-mode.service';

const T0 = new Date('2026-08-08T00:00:00.000Z');
const at = (seconds: number) => new Date(T0.getTime() + seconds * 1000);

function build(degradedAfterMs = 30_000) {
  const config = {
    get: (key: string, fallback: any) =>
      key === 'RESILIENCE_DEGRADED_AFTER_MS' ? String(degradedAfterMs) : fallback,
  };
  return new OperatingModeService(config as any);
}

describe('OperatingModeService 상태 전이', () => {
  it('초기 상태는 NORMAL 이고 아무것도 제한하지 않는다', () => {
    const snapshot = build().snapshot();

    expect(snapshot.mode).toBe('NORMAL');
    expect(snapshot.restrictions).toEqual({
      allowExistingCallControl: true,
      allowGeneralConfigWrites: true,
      allowEmergencyConfigWrites: true,
      allowNewLogin: true,
      allowCustomerCacheMissLookup: true,
    });
  });

  it('첫 DB 실패는 DB_FAILOVER, 임계 시간을 넘기면 DEGRADED 로 간다', () => {
    const service = build(30_000);

    service.recordDbFailure(T0);
    expect(service.snapshot().mode).toBe('DB_FAILOVER');

    service.recordDbFailure(at(31));
    expect(service.snapshot().mode).toBe('DEGRADED');
    expect(service.snapshot().restrictions.allowGeneralConfigWrites).toBe(false);
  });

  it('임계 시간 이내의 반복 실패는 DB_FAILOVER 를 유지한다', () => {
    const service = build(30_000);

    service.recordDbFailure(T0);
    service.recordDbFailure(at(10));
    service.recordDbFailure(at(29));

    expect(service.snapshot().mode).toBe('DB_FAILOVER');
  });

  it('DB_FAILOVER 에서도 기존 통화 제어는 허용하고 일반 설정 저장만 막는다', () => {
    const service = build();
    service.recordDbFailure(T0);

    const { restrictions } = service.snapshot();
    expect(restrictions.allowExistingCallControl).toBe(true);
    expect(restrictions.allowGeneralConfigWrites).toBe(false);
  });

  it('DEGRADED 는 신규 로그인을 막고 긴급 설정 변경만 허용한다', () => {
    const service = build(0);
    service.recordDbFailure(T0);
    service.recordDbFailure(at(1));

    const { restrictions } = service.snapshot();
    expect(restrictions.allowNewLogin).toBe(false);
    expect(restrictions.allowGeneralConfigWrites).toBe(false);
    expect(restrictions.allowEmergencyConfigWrites).toBe(true);
    expect(restrictions.allowExistingCallControl).toBe(true);
  });

  it('복구는 RECOVERING 을 거쳐 NORMAL 로 간다', () => {
    const service = build();

    service.recordDbFailure(T0);
    service.recordDbRecovered(at(60));
    expect(service.snapshot().mode).toBe('RECOVERING');
    expect(service.snapshot().restrictions.allowGeneralConfigWrites).toBe(false);

    service.markRecoveryComplete(at(120));
    expect(service.snapshot().mode).toBe('NORMAL');
  });

  it('복구 중 DB 가 다시 죽으면 새 장애로 취급해 DB_FAILOVER 로 돌아간다', () => {
    const service = build(30_000);

    service.recordDbFailure(T0);
    service.recordDbRecovered(at(60));
    expect(service.snapshot().mode).toBe('RECOVERING');

    service.recordDbFailure(at(70));
    expect(service.snapshot().mode).toBe('DB_FAILOVER');

    // 임계 시간은 최초 장애가 아니라 재장애 시점부터 다시 센다
    service.recordDbFailure(at(95));
    expect(service.snapshot().mode).toBe('DB_FAILOVER');
    service.recordDbFailure(at(101));
    expect(service.snapshot().mode).toBe('DEGRADED');
  });

  it('NORMAL 에서 markRecoveryComplete 를 불러도 상태가 바뀌지 않는다', () => {
    const service = build();

    service.markRecoveryComplete(T0);

    expect(service.snapshot().mode).toBe('NORMAL');
  });

  it('장애가 없었는데 recordDbRecovered 를 불러도 RECOVERING 으로 가지 않는다', () => {
    const service = build();

    service.recordDbRecovered(T0);

    expect(service.snapshot().mode).toBe('NORMAL');
  });

  it('마지막 장애/복구 시각과 상태 진입 시각을 ISO 문자열로 보고한다', () => {
    const service = build();

    service.recordDbFailure(T0);
    service.recordDbRecovered(at(60));
    const snapshot = service.snapshot();

    expect(snapshot.lastDbFailureAt).toBe(T0.toISOString());
    expect(snapshot.lastDbRecoveredAt).toBe(at(60).toISOString());
    expect(snapshot.since).toBe(at(60).toISOString());
  });
});

describe('OperatingModeService dataFreshness', () => {
  it('NORMAL 은 전부 fresh 다', () => {
    expect(build().snapshot().dataFreshness).toEqual({
      db: 'fresh',
      config: 'fresh',
      customer: 'fresh',
    });
  });

  it('DB 장애 중에는 db unavailable, 고객 조회는 캐시 전용이다', () => {
    const service = build();
    service.recordDbFailure(T0);

    const { dataFreshness } = service.snapshot();
    expect(dataFreshness.db).toBe('unavailable');
    expect(dataFreshness.customer).toBe('cache-only');
  });

  it('복구 중에는 db 가 stale 이다', () => {
    const service = build();
    service.recordDbFailure(T0);
    service.recordDbRecovered(at(60));

    expect(service.snapshot().dataFreshness.db).toBe('stale');
  });

  it('설정 출처는 ConfigSnapshotService 가 보고한 값을 그대로 노출한다', () => {
    const service = build();

    service.reportConfigSource('lkg');
    expect(service.snapshot().dataFreshness.config).toBe('lkg');

    service.reportConfigSource('missing');
    expect(service.snapshot().dataFreshness.config).toBe('missing');
  });
});
