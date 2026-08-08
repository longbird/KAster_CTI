import { HealthSummaryService } from './health-summary.service';
import { OperatingModeService } from '../resilience/operating-mode.service';

const T0 = new Date('2026-08-08T00:00:00.000Z');

function build(options: { dbDown?: boolean; stuck?: number } = {}) {
  const operatingMode = new OperatingModeService({ get: (_k: string, d: any) => d } as any);

  const prisma = {
    $queryRaw: options.dbDown
      ? jest.fn().mockRejectedValue(new Error('db down'))
      : jest.fn().mockResolvedValue([{ ok: 1 }]),
  };
  const redis = { ping: jest.fn().mockResolvedValue('PONG') };
  const ami = { isConnected: () => true };
  const leader = { getNodeId: () => 'node-1', isLeader: () => true };
  const callsHealth = {
    getSummary: jest.fn().mockResolvedValue({
      active: 0, queued: 0, ringing: 0, talking: 0, hold: 0,
      transferring: 0, stuck: options.stuck ?? 0, longestWaitingSeconds: 0,
    }),
  };
  const agentMonitoring = {
    getSummary: jest.fn().mockResolvedValue({
      available: 0, talking: 0, ringing: 0, paused: 0, loggedIn: 0,
    }),
  };
  const queueMonitoring = {
    getSummary: jest.fn().mockResolvedValue({
      waiting: 0, ringing: 0, talking: 0, availableAgents: 0, longestWaitSeconds: 0,
    }),
  };
  const resilienceHealth = {
    getSummary: jest.fn(async () => ({
      operatingMode: operatingMode.getMode(),
      dataFreshness: operatingMode.snapshot().dataFreshness,
      restrictions: operatingMode.snapshot().restrictions,
      resilience: {
        lkgVersion: null, lkgAgeSeconds: null, offlineEventQueueDepth: 0,
        offlineCommandQueueDepth: null, configVersionMismatch: 0,
        dbRole: 'primary' as const, replicationLagSeconds: null,
        walArchiveAgeSeconds: null, backupLastSuccessTimestamp: null,
      },
    })),
  };

  const service = new HealthSummaryService(
    prisma as any, redis as any, ami as any, leader as any,
    callsHealth as any, agentMonitoring as any, queueMonitoring as any,
    resilienceHealth as any, operatingMode,
  );
  return { service, operatingMode, prisma };
}

describe('HealthSummaryService 운영 모드 연동', () => {
  it('정상이면 status 는 ok 이고 operatingMode 는 NORMAL 이다', async () => {
    const { service } = build();

    const health = await service.getHealth('tenant-1');

    expect(health.status).toBe('ok');
    expect(health.operatingMode).toBe('NORMAL');
  });

  it('DB 체크 실패를 운영 모드에 장애로 기록한다', async () => {
    const { service, operatingMode } = build({ dbDown: true });

    await service.getHealth('tenant-1');

    expect(operatingMode.getMode()).toBe('DB_FAILOVER');
  });

  it('DB 체크 성공을 회복 신호로 전달한다', async () => {
    const { service, operatingMode } = build();
    operatingMode.recordDbFailure(T0);
    expect(operatingMode.getMode()).toBe('DB_FAILOVER');

    await service.getHealth('tenant-1');

    expect(operatingMode.getMode()).toBe('RECOVERING');
  });

  it('운영 모드가 NORMAL 이 아니면 DB 가 붙어도 status 를 ok 로 내지 않는다', async () => {
    // 재처리가 안 끝났는데 ok 를 내면 모니터링이 복구 완료로 오독한다.
    const { service, operatingMode } = build();
    operatingMode.recordDbFailure(T0);
    operatingMode.recordDbRecovered(new Date(T0.getTime() + 1000));
    expect(operatingMode.getMode()).toBe('RECOVERING');

    const health = await service.getHealth('tenant-1');

    expect(health.status).toBe('degraded');
  });

  it('resilience 블록을 응답에 포함한다', async () => {
    const { service } = build();

    const health = await service.getHealth('tenant-1');

    expect(health.resilience).toEqual(
      expect.objectContaining({ dbRole: 'primary', offlineCommandQueueDepth: null }),
    );
    expect(health.restrictions.allowExistingCallControl).toBe(true);
  });
});
