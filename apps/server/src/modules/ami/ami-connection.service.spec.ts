import { AmiConnectionService } from './ami-connection.service';

describe('AmiConnectionService pending action handling', () => {
  it('finishes event-list actions immediately when AMI returns an error response', async () => {
    const service = new AmiConnectionService(
      {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any,
    ) as any;
    const resolved: any[] = [];
    const pending = {
      eventList: true,
      frames: [],
      timeout: setTimeout(() => undefined, 10000),
      resolve: (frames: any[]) => resolved.push(frames),
      reject: jest.fn(),
    };
    service.pendingActions.set('probe-1', pending);

    const handled = service.handlePendingActionFrame({
      Response: 'Error',
      ActionID: 'probe-1',
      Message: 'No Contacts found',
    });

    expect(handled).toBe(true);
    expect(service.pendingActions.has('probe-1')).toBe(false);
    expect(resolved).toEqual([[
      {
        Response: 'Error',
        ActionID: 'probe-1',
        Message: 'No Contacts found',
      },
    ]]);
  });
});

describe('AmiConnectionService durable spool integration', () => {
  const NORMALIZED = {
    tenantId: '00000000-0000-0000-0000-000000000001',
    eventName: 'QueueCallerJoin',
    linkedid: '1700000000.1',
    uniqueid: '1700000000.1',
    eventTime: '2026-08-08T00:00:00.000Z',
  };

  function build(options: { isLeader?: boolean; leadershipKnown?: boolean; processThrows?: Error } = {}) {
    const appended = { source: 'REDIS', idempotencyKey: 'fp', redisStreamId: '1-0' };
    const durableSpool = {
      appendAmiEvent: jest.fn().mockResolvedValue(appended),
      markProcessed: jest.fn().mockResolvedValue(undefined),
    };
    const sessionEngine = {
      processNormalizedEvent: options.processThrows
        ? jest.fn().mockRejectedValue(options.processThrows)
        : jest.fn().mockResolvedValue(undefined),
    };
    const sipSecurity = { processAmiEvent: jest.fn().mockResolvedValue(undefined) };
    const leader = {
      isLeader: () => options.isLeader ?? true,
      isLeadershipKnown: () => options.leadershipKnown ?? true,
    };
    const operatingMode = {
      recordDbFailure: jest.fn(),
      recordDbRecovered: jest.fn(),
    };
    const service = new AmiConnectionService(
      {} as any,
      {} as any,
      sessionEngine as any,
      leader as any,
      sipSecurity as any,
      durableSpool as any,
      operatingMode as any,
    ) as any;
    return { service, durableSpool, sessionEngine, sipSecurity, operatingMode, appended };
  }

  it('리더십이 확인된 상태에서 비리더는 스풀하지 않는다', async () => {
    // 모든 노드가 공유 Redis Stream 에 쓰면, 리더가 자기 append ID 로 커서를 올려도
    // 비리더 append 가 커서 뒤에 영구히 남아 offline depth 가 절대 0 이 되지 않는다.
    // Redis 가 살아 있으면 리더 선출이 정상이므로 비리더가 쓸 이유가 없다.
    const { service, durableSpool, sessionEngine } = build({
      isLeader: false, leadershipKnown: true,
    });

    await service.handleNormalizedEvent(NORMALIZED);

    expect(durableSpool.appendAmiEvent).not.toHaveBeenCalled();
    expect(sessionEngine.processNormalizedEvent).not.toHaveBeenCalled();
  });

  it('리더십을 확인할 수 없으면 비리더도 스풀한다', async () => {
    // Redis 장애 구간. 어떤 노드도 리더가 아니므로 아무도 안 쓰면 통째로 유실된다.
    // 이때 Redis append 는 어차피 실패하고 로컬 스풀로 떨어지므로 공유 스트림이
    // 오염되지 않는다.
    const { service, durableSpool, sessionEngine } = build({
      isLeader: false, leadershipKnown: false,
    });

    await service.handleNormalizedEvent(NORMALIZED);

    expect(durableSpool.appendAmiEvent).toHaveBeenCalledTimes(1);
    expect(sessionEngine.processNormalizedEvent).not.toHaveBeenCalled();
  });

  it('스풀 기록이 세션 처리보다 먼저 일어난다', async () => {
    const order: string[] = [];
    const { service, durableSpool, sessionEngine } = build();
    durableSpool.appendAmiEvent.mockImplementation(async () => {
      order.push('spool');
      return { source: 'REDIS', idempotencyKey: 'fp', redisStreamId: '1-0' };
    });
    sessionEngine.processNormalizedEvent.mockImplementation(async () => {
      order.push('session');
    });

    await service.handleNormalizedEvent(NORMALIZED);

    expect(order).toEqual(['spool', 'session']);
  });

  it('처리에 성공하면 스풀 커서를 전진시킨다', async () => {
    const { service, durableSpool, appended } = build();

    await service.handleNormalizedEvent(NORMALIZED);

    expect(durableSpool.markProcessed).toHaveBeenCalledWith(NORMALIZED.tenantId, appended);
  });

  it('세션 처리가 실패하면 커서를 전진시키지 않고 DB 장애로 기록한다', async () => {
    const { service, durableSpool, operatingMode } = build({
      processThrows: new Error('db down'),
    });

    await expect(service.handleNormalizedEvent(NORMALIZED)).resolves.toBeUndefined();

    expect(durableSpool.markProcessed).not.toHaveBeenCalled();
    expect(operatingMode.recordDbFailure).toHaveBeenCalled();
  });

  it('처리에 성공하면 DB 회복 신호를 보낸다', async () => {
    const { service, operatingMode } = build();

    await service.handleNormalizedEvent(NORMALIZED);

    expect(operatingMode.recordDbRecovered).toHaveBeenCalled();
  });
});
