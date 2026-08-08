import { DurableSpoolService } from './durable-spool.service';

const TENANT = '00000000-0000-0000-0000-000000000001';

const NORMALIZED = {
  tenantId: TENANT,
  eventName: 'QueueCallerJoin',
  linkedid: '1700000000.1',
  uniqueid: '1700000000.2',
  eventTime: '2026-08-08T00:00:00.000Z',
};

function build(overrides: { xadd?: jest.Mock; local?: any; config?: any } = {}) {
  const xadd = overrides.xadd ?? jest.fn().mockResolvedValue('1700000000-0');
  const client = {
    xadd,
    xlen: jest.fn().mockResolvedValue(0),
    set: jest.fn().mockResolvedValue('OK'),
    get: jest.fn().mockResolvedValue(null),
    xrange: jest.fn().mockResolvedValue([]),
    xrevrange: jest.fn().mockResolvedValue([]),
  };
  const local = overrides.local ?? {
    append: jest.fn().mockResolvedValue({ path: '/tmp/spool.jsonl', offset: 120 }),
    pendingCount: jest.fn().mockResolvedValue(0),
    readPending: jest.fn().mockResolvedValue({ records: [], nextOffset: 0 }),
    commitCursor: jest.fn().mockResolvedValue(undefined),
    listTenants: jest.fn().mockResolvedValue([]),
  };
  const redis = { getClient: () => client };
  const config = overrides.config ?? { get: (_k: string, d: any) => d };
  const service = new DurableSpoolService(redis as any, local as any, config as any);
  return { service, client, xadd, local };
}

describe('DurableSpoolService', () => {
  it('Redis Streams 에 먼저 기록하고 stream id 를 돌려준다', async () => {
    const { service, xadd, local } = build();

    const result = await service.appendAmiEvent(NORMALIZED, 'fp-1');

    expect(result.source).toBe('REDIS');
    expect(result.redisStreamId).toBe('1700000000-0');
    expect(local.append).not.toHaveBeenCalled();
    expect(xadd).toHaveBeenCalledWith(
      `kcti:spool:${TENANT}:ami`,
      'MAXLEN',
      '~',
      expect.any(Number),
      '*',
      'payload',
      expect.any(String),
    );
  });

  it('Redis 가 죽으면 로컬 append-only 스풀로 넘어간다', async () => {
    const { service, local } = build({
      xadd: jest.fn().mockRejectedValue(new Error('redis down')),
    });

    const result = await service.appendAmiEvent(NORMALIZED, 'fp-1');

    expect(result.source).toBe('LOCAL');
    expect(result.localSpoolPath).toBe('/tmp/spool.jsonl');
    expect(local.append).toHaveBeenCalled();
  });

  it('idempotencyKey 로 eventFingerprint 를 그대로 쓴다', async () => {
    const { service, xadd } = build();

    await service.appendAmiEvent(NORMALIZED, 'fingerprint-abc');

    const payload = JSON.parse(xadd.mock.calls[0][6]);
    expect(payload.idempotencyKey).toBe('fingerprint-abc');
    expect(payload.entryType).toBe('AMI_EVENT');
    expect(payload.linkedid).toBe('1700000000.1');
  });

  it('Redis 와 로컬이 모두 실패해도 예외를 던지지 않는다', async () => {
    // spool 실패로 AMI 수신 루프를 멈추면 안 된다. 관측만 하고 계속 간다.
    const { service } = build({
      xadd: jest.fn().mockRejectedValue(new Error('redis down')),
      local: {
        append: jest.fn().mockRejectedValue(new Error('disk full')),
        pendingCount: jest.fn().mockResolvedValue(0),
        readPending: jest.fn(),
        commitCursor: jest.fn(),
        listTenants: jest.fn().mockResolvedValue([]),
      },
    });

    const result = await service.appendAmiEvent(NORMALIZED, 'fp-1');

    expect(result.source).toBe('NONE');
  });

  it('tenantId 가 없는 이벤트는 스풀하지 않는다', async () => {
    const { service, xadd } = build();

    const result = await service.appendAmiEvent({ ...NORMALIZED, tenantId: '' }, 'fp-1');

    expect(result.source).toBe('NONE');
    expect(xadd).not.toHaveBeenCalled();
  });

  it('markProcessed 는 Redis 커서를 전진시킨다', async () => {
    const { service, client } = build();

    await service.markProcessed(TENANT, { source: 'REDIS', redisStreamId: '17-0' } as any);

    expect(client.set).toHaveBeenCalledWith(`kcti:spool:${TENANT}:ami:cursor`, '17-0');
  });

  it('로컬 스풀 레코드의 markProcessed 는 파일 커서를 전진시킨다', async () => {
    const { service, local } = build();

    await service.markProcessed(TENANT, {
      source: 'LOCAL',
      localSpoolPath: '/tmp/spool.jsonl',
      localOffset: 240,
    } as any);

    expect(local.commitCursor).toHaveBeenCalledWith(TENANT, 240);
  });

  it('큐 깊이는 Redis 미처리분과 로컬 미처리분의 합이다', async () => {
    const { service, client, local } = build();
    client.get.mockResolvedValue('17-0');
    client.xrange.mockResolvedValue([['18-0', []], ['19-0', []]]);
    local.pendingCount.mockResolvedValue(3);

    expect(await service.getPendingDepth(TENANT)).toBe(5);
  });

  it('Redis 가 죽어 있으면 큐 깊이는 로컬 분만 센다', async () => {
    const { service, client, local } = build();
    client.get.mockRejectedValue(new Error('redis down'));
    local.pendingCount.mockResolvedValue(7);

    expect(await service.getPendingDepth(TENANT)).toBe(7);
  });

  it('drainCursor 는 커서를 스트림의 마지막 ID 로 민다', async () => {
    const { service, client } = build();
    client.xrevrange.mockResolvedValue([['99-0', ['payload', '{}']]]);

    await service.drainCursor(TENANT);

    expect(client.set).toHaveBeenCalledWith(`kcti:spool:${TENANT}:ami:cursor`, '99-0');
  });

  it('스트림이 비어 있으면 drainCursor 는 커서를 건드리지 않는다', async () => {
    const { service, client } = build();
    client.xrevrange.mockResolvedValue([]);

    await service.drainCursor(TENANT);

    expect(client.set).not.toHaveBeenCalled();
  });

  it('Redis 가 죽어 있어도 drainCursor 는 예외를 던지지 않는다', async () => {
    const { service, client } = build();
    client.xrevrange.mockRejectedValue(new Error('redis down'));

    await expect(service.drainCursor(TENANT)).resolves.toBeUndefined();
  });
});
