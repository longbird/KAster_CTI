import { RecoveryCoordinatorService } from './recovery-coordinator.service';
import { OperatingModeService } from './operating-mode.service';

const TENANT = '00000000-0000-0000-0000-000000000001';

function spoolRecord(key: string, linkedid = '1700000000.1') {
  return {
    tenantId: TENANT,
    entryType: 'AMI_EVENT',
    idempotencyKey: key,
    linkedid,
    uniqueid: linkedid,
    receivedAt: '2026-08-08T00:00:00.000Z',
    payload: { tenantId: TENANT, eventName: 'QueueCallerJoin', linkedid },
  };
}

function build(options: {
  pending?: any[];
  processThrows?: Error;
  isLeader?: boolean;
  dbWritable?: boolean;
} = {}) {
  const operatingMode = new OperatingModeService({ get: (_k: string, d: any) => d } as any);
  // 복구 대상이 되려면 먼저 장애 → 복구를 거쳐 RECOVERING 이어야 한다
  operatingMode.recordDbFailure(new Date('2026-08-08T00:00:00.000Z'));
  operatingMode.recordDbRecovered(new Date('2026-08-08T00:01:00.000Z'));

  const sessionEngine = {
    processNormalizedEvent: options.processThrows
      ? jest.fn().mockRejectedValue(options.processThrows)
      : jest.fn().mockResolvedValue(undefined),
  };
  const durableSpool = {
    readPending: jest.fn().mockResolvedValue(options.pending ?? []),
    getPendingDepth: jest.fn().mockResolvedValue(0),
  };
  const batches = {
    openBatch: jest.fn().mockResolvedValue({
      replayBatchId: 'batch-1', tenantId: TENANT, replayType: 'AMI_EVENT',
      status: 'RUNNING', totalCount: 0, successCount: 0, failureCount: 0, cursor: {},
    }),
    recordProgress: jest.fn().mockResolvedValue(undefined),
    closeBatch: jest.fn().mockResolvedValue(undefined),
    writeAudit: jest.fn().mockResolvedValue(undefined),
  };
  const prisma = {
    $queryRaw: options.dbWritable === false
      ? jest.fn().mockRejectedValue(new Error('db down'))
      : jest.fn().mockResolvedValue([{ ok: 1 }]),
  };
  const ami = {
    sendActionWithResponse: jest.fn().mockResolvedValue([{ Event: 'CoreShowChannel' }]),
  };
  const configSnapshot = { load: jest.fn().mockResolvedValue(null) };
  const leader = { isLeader: () => options.isLeader ?? true };

  const service = new RecoveryCoordinatorService(
    prisma as any,
    durableSpool as any,
    batches as any,
    configSnapshot as any,
    operatingMode,
    sessionEngine as any,
    ami as any,
    leader as any,
  );
  return { service, sessionEngine, durableSpool, batches, ami, operatingMode, prisma };
}

describe('RecoveryCoordinatorService replay', () => {
  it('replay 는 replay 플래그를 붙여 세션 엔진을 호출한다', async () => {
    const { service, sessionEngine } = build();

    await service.replayOne(spoolRecord('fp-1') as any);

    expect(sessionEngine.processNormalizedEvent).toHaveBeenCalledWith(
      expect.objectContaining({ linkedid: '1700000000.1' }),
      { replay: true },
    );
  });

  it('raw 중복 여부와 무관하게 세션 엔진을 건너뛰지 않는다', async () => {
    // raw 저장과 상태 전이는 서로 다른 두 번의 쓰기다. raw 가 있다고 상태 전이가
    // 반영됐다는 보장이 없으므로 replay 는 항상 세션 엔진을 통과해야 한다.
    const { service, sessionEngine } = build();

    await service.replayOne(spoolRecord('fp-1') as any);
    await service.replayOne(spoolRecord('fp-1') as any);

    expect(sessionEngine.processNormalizedEvent).toHaveBeenCalledTimes(2);
  });

  it('같은 레코드를 두 번 replay 해도 예외가 없다', async () => {
    const { service } = build();
    const record = spoolRecord('fp-1') as any;

    await service.replayOne(record);
    await expect(service.replayOne(record)).resolves.toBe('replayed');
  });

  it('개별 replay 실패는 예외로 번지지 않고 failed 를 돌려준다', async () => {
    const { service } = build({ processThrows: new Error('still down') });

    await expect(service.replayOne(spoolRecord('fp-1') as any)).resolves.toBe('failed');
  });
});

describe('RecoveryCoordinatorService startRecovery', () => {
  it('리더가 아니면 아무것도 하지 않는다', async () => {
    const { service, batches, durableSpool } = build({ isLeader: false });

    const result = await service.startRecovery(TENANT);

    expect(result.skipped).toBe('NOT_LEADER');
    expect(batches.openBatch).not.toHaveBeenCalled();
    expect(durableSpool.readPending).not.toHaveBeenCalled();
  });

  it('DB 가 아직 안 살아났으면 재처리를 시작하지 않는다', async () => {
    const { service, batches } = build({ dbWritable: false });

    const result = await service.startRecovery(TENANT);

    expect(result.skipped).toBe('DB_UNAVAILABLE');
    expect(batches.openBatch).not.toHaveBeenCalled();
  });

  it('보류된 스풀 레코드를 전부 재처리하고 배치를 닫는다', async () => {
    const { service, batches, sessionEngine } = build({
      pending: [spoolRecord('fp-1'), spoolRecord('fp-2', '1700000000.2')],
    });

    const result = await service.startRecovery(TENANT);

    expect(sessionEngine.processNormalizedEvent).toHaveBeenCalledTimes(2);
    expect(result.total).toBe(2);
    expect(result.success).toBe(2);
    expect(result.failure).toBe(0);
    expect(batches.closeBatch).toHaveBeenCalledWith('batch-1', 'COMPLETED');
  });

  it('전부 성공하면 운영 모드를 NORMAL 로 되돌린다', async () => {
    const { service, operatingMode } = build({ pending: [spoolRecord('fp-1')] });

    await service.startRecovery(TENANT);

    expect(operatingMode.getMode()).toBe('NORMAL');
  });

  it('실패가 하나라도 있으면 NORMAL 로 돌리지 않고 배치를 FAILED 로 닫는다', async () => {
    const { service, operatingMode, batches } = build({
      pending: [spoolRecord('fp-1')],
      processThrows: new Error('still down'),
    });

    const result = await service.startRecovery(TENANT);

    expect(result.failure).toBe(1);
    expect(operatingMode.getMode()).toBe('RECOVERING');
    expect(batches.closeBatch).toHaveBeenCalledWith('batch-1', 'FAILED');
  });

  it('일부가 실패해도 나머지 레코드를 계속 처리한다', async () => {
    const { service, sessionEngine } = build({
      pending: [spoolRecord('fp-1'), spoolRecord('fp-2'), spoolRecord('fp-3')],
    });
    sessionEngine.processNormalizedEvent
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValueOnce(undefined);

    const result = await service.startRecovery(TENANT);

    expect(sessionEngine.processNormalizedEvent).toHaveBeenCalledTimes(3);
    expect(result.success).toBe(2);
    expect(result.failure).toBe(1);
  });

  it('PBX 실제 상태를 조회해 결과에 담는다', async () => {
    const { service, ami } = build();

    const result = await service.startRecovery(TENANT);

    expect(ami.sendActionWithResponse).toHaveBeenCalledWith(
      { Action: 'CoreShowChannels' },
      expect.objectContaining({ eventList: true }),
    );
    expect(ami.sendActionWithResponse).toHaveBeenCalledWith(
      { Action: 'QueueStatus' },
      expect.objectContaining({ eventList: true }),
    );
    expect(result.pbxProbe.reachable).toBe(true);
  });

  it('PBX 조회가 실패해도 재처리는 진행한다', async () => {
    const { service, ami } = build({ pending: [spoolRecord('fp-1')] });
    ami.sendActionWithResponse.mockRejectedValue(new Error('ami down'));

    const result = await service.startRecovery(TENANT);

    expect(result.success).toBe(1);
    expect(result.pbxProbe.reachable).toBe(false);
  });

  it('시작과 종료를 감사 로그에 남긴다', async () => {
    const { service, batches } = build({ pending: [spoolRecord('fp-1')] });

    await service.startRecovery(TENANT);

    const types = batches.writeAudit.mock.calls.map((c: any[]) => c[0].eventType);
    expect(types).toContain('RECOVERY_STARTED');
    expect(types).toContain('RECOVERY_FINISHED');
  });
});
