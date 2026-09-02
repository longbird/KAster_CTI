import { ConfigService } from '@nestjs/config';
import { CallAnalysisReconcileService } from './call-analysis-reconcile.service';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';

function recording(overrides: Record<string, unknown> = {}) {
  return {
    recordingId: '00000000-0000-0000-0000-0000000000a1',
    tenantId: TENANT_ID,
    callId: '00000000-0000-0000-0000-0000000000c1',
    ...overrides,
  };
}

function buildService(options: {
  recordings?: Array<Record<string, unknown>>;
  env?: Record<string, string>;
  isLeader?: boolean | null;
  enqueue?: jest.Mock;
  entitled?: boolean;
} = {}) {
  const prisma: any = {
    callRecordings: {
      findMany: jest.fn().mockResolvedValue(options.recordings ?? []),
    },
  };
  const env = { CALL_ANALYSIS_ENABLED: 'true', ...(options.env ?? {}) };
  const config = { get: (key: string, fallback?: string) => env[key] ?? fallback } as unknown as ConfigService;
  const enqueue = options.enqueue ?? jest.fn().mockResolvedValue(undefined);
  const sweeper = { enqueue } as any;
  const leader = options.isLeader === null ? undefined : ({ isLeader: () => options.isLeader ?? true } as any);
  const isEnabled = jest.fn().mockResolvedValue(options.entitled ?? true);
  const entitlement = { isEnabled } as any;

  return {
    service: new CallAnalysisReconcileService(prisma, config, sweeper, entitlement, leader),
    prisma,
    enqueue,
    isEnabled,
  };
}

describe('CallAnalysisReconcileService', () => {
  it('확정된 녹취 중 분석 job 이 없는 것을 적재한다', async () => {
    const { service, enqueue } = buildService({ recordings: [recording()] });

    await service.sweep();

    expect(enqueue).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      callId: '00000000-0000-0000-0000-0000000000c1',
      recordingId: '00000000-0000-0000-0000-0000000000a1',
    });
  });

  it('READY 이고 job 이 하나도 없는 녹취만 고른다', async () => {
    const { service, prisma } = buildService();

    await service.sweep();

    const where = prisma.callRecordings.findMany.mock.calls[0][0].where;
    expect(where.recordingStatus).toBe('READY');
    expect(where.analysisJobs).toEqual({ none: {} });
    expect(where.finalizedAt.gte).toBeInstanceOf(Date);
  });

  it('되돌아보는 기간을 env 로 조절한다', async () => {
    const { service, prisma } = buildService({ env: { CALL_ANALYSIS_LOOKBACK_HOURS: '1' } });

    const before = Date.now();
    await service.sweep();

    const gte = prisma.callRecordings.findMany.mock.calls[0][0].where.finalizedAt.gte.getTime();
    expect(before - gte).toBeLessThanOrEqual(3600_000 + 1000);
    expect(before - gte).toBeGreaterThan(3500_000);
  });

  it('리더가 아니면 조회하지 않는다', async () => {
    const { service, prisma } = buildService({ isLeader: false, recordings: [recording()] });

    await service.sweep();

    expect(prisma.callRecordings.findMany).not.toHaveBeenCalled();
  });

  it('리더 선출이 없는 단일 노드에서도 돈다', async () => {
    const { service, prisma } = buildService({ isLeader: null });

    await service.sweep();

    expect(prisma.callRecordings.findMany).toHaveBeenCalled();
  });

  it('기능이 꺼져 있으면 아무것도 하지 않는다', async () => {
    const { service, prisma } = buildService({ env: { CALL_ANALYSIS_ENABLED: 'false' } });

    await service.sweep();

    expect(prisma.callRecordings.findMany).not.toHaveBeenCalled();
  });

  // 자격이 없는 테넌트는 적재하지 않는다. 이미 쌓인 job 은 sweeper 가 마저 처리한다.
  it('기능 자격이 없는 테넌트는 적재하지 않는다', async () => {
    const { service, enqueue } = buildService({ entitled: false, recordings: [recording()] });

    await service.sweep();

    expect(enqueue).not.toHaveBeenCalled();
  });

  it('자격을 그 녹취의 테넌트로 묻는다', async () => {
    const { service, isEnabled } = buildService({ recordings: [recording()] });

    await service.sweep();

    expect(isEnabled).toHaveBeenCalledWith(TENANT_ID, 'call-analysis');
  });

  it('하나가 실패해도 나머지를 계속 적재한다', async () => {
    const enqueue = jest.fn()
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValueOnce(undefined);
    const { service } = buildService({
      enqueue,
      recordings: [recording({ recordingId: 'r1' }), recording({ recordingId: 'r2' })],
    });

    await service.sweep();

    expect(enqueue).toHaveBeenCalledTimes(2);
  });
});
