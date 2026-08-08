import { ResilienceHealthService } from './resilience-health.service';
import { OperatingModeService } from './operating-mode.service';

const TENANT = '00000000-0000-0000-0000-000000000001';

function build(options: {
  queryResults?: any[];
  queryThrows?: boolean;
  lkgVersion?: number | null;
  lkgAge?: number | null;
  depth?: number;
  mismatch?: number;
} = {}) {
  const operatingMode = new OperatingModeService({ get: (_k: string, d: any) => d } as any);

  const results = options.queryResults ?? [
    [{ isStandby: false }],
    [{ lagSeconds: null }],
    [{ ageSeconds: 12 }],
  ];
  let call = 0;
  const prisma = {
    $queryRaw: jest.fn(async () => {
      if (options.queryThrows) throw new Error('db down');
      return results[call++] ?? [];
    }),
    configApplyStatus: {
      count: jest.fn(async () => options.mismatch ?? 0),
    },
  };
  const durableSpool = {
    getPendingDepth: jest.fn(async () => options.depth ?? 0),
  };
  const configSnapshot = {
    load: jest.fn(async () =>
      options.lkgVersion === null ? null : { version: options.lkgVersion ?? 7 },
    ),
    getLkgAgeSeconds: jest.fn(async () => (options.lkgAge === undefined ? 42 : options.lkgAge)),
  };
  const config = { get: (_k: string, d: any) => d };

  const service = new ResilienceHealthService(
    prisma as any,
    durableSpool as any,
    configSnapshot as any,
    operatingMode,
    config as any,
  );
  return { service, prisma, operatingMode, durableSpool, configSnapshot };
}

describe('ResilienceHealthService', () => {
  it('운영 모드 스냅샷을 그대로 노출한다', async () => {
    const { service, operatingMode } = build();

    const result = await service.getSummary(TENANT);

    expect(result.operatingMode).toBe('NORMAL');
    expect(result.restrictions).toEqual(operatingMode.snapshot().restrictions);
    expect(result.dataFreshness).toEqual(operatingMode.snapshot().dataFreshness);
  });

  it('primary 와 standby 를 pg_is_in_recovery 로 구분한다', async () => {
    const primary = build({ queryResults: [[{ isStandby: false }], [{ lagSeconds: null }], [{ ageSeconds: 1 }]] });
    expect((await primary.service.getSummary(TENANT)).resilience.dbRole).toBe('primary');

    const standby = build({ queryResults: [[{ isStandby: true }], [{ lagSeconds: 3 }], [{ ageSeconds: 1 }]] });
    const result = await standby.service.getSummary(TENANT);
    expect(result.resilience.dbRole).toBe('standby');
    expect(result.resilience.replicationLagSeconds).toBe(3);
  });

  it('DB 조회가 실패하면 dbRole 은 unknown 이고 예외를 던지지 않는다', async () => {
    const { service } = build({ queryThrows: true });

    const result = await service.getSummary(TENANT);

    expect(result.resilience.dbRole).toBe('unknown');
    expect(result.resilience.replicationLagSeconds).toBeNull();
    expect(result.resilience.walArchiveAgeSeconds).toBeNull();
  });

  it('LKG 버전과 나이를 노출한다', async () => {
    const { service } = build({ lkgVersion: 12, lkgAge: 99 });

    const result = await service.getSummary(TENANT);

    expect(result.resilience.lkgVersion).toBe('12');
    expect(result.resilience.lkgAgeSeconds).toBe(99);
  });

  it('LKG 가 없으면 null 로 노출한다', async () => {
    const { service } = build({ lkgVersion: null, lkgAge: null });

    const result = await service.getSummary(TENANT);

    expect(result.resilience.lkgVersion).toBeNull();
    expect(result.resilience.lkgAgeSeconds).toBeNull();
  });

  it('스풀 미처리 깊이를 노출한다', async () => {
    const { service } = build({ depth: 17 });

    expect((await service.getSummary(TENANT)).resilience.offlineEventQueueDepth).toBe(17);
  });

  it('명령 스풀은 미구현이므로 0 이 아니라 null 로 노출한다', async () => {
    // 0 으로 보고하면 운영자가 "밀린 명령 없음" 으로 오독한다.
    const { service } = build();

    expect((await service.getSummary(TENANT)).resilience.offlineCommandQueueDepth).toBeNull();
  });

  it('desired/applied 불일치 건수를 센다', async () => {
    const { service } = build({ mismatch: 2 });

    expect((await service.getSummary(TENANT)).resilience.configVersionMismatch).toBe(2);
  });

  it('tenantId 가 없으면 테넌트 종속 지표를 건너뛴다', async () => {
    const { service, durableSpool } = build();

    const result = await service.getSummary(undefined);

    expect(durableSpool.getPendingDepth).not.toHaveBeenCalled();
    expect(result.resilience.offlineEventQueueDepth).toBe(0);
  });
});
