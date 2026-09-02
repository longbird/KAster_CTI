import {
  AGENT_PRESENCE_HEARTBEAT_MS,
  AGENT_PRESENCE_TTL_SECONDS,
  AgentPresenceService,
} from './agent-presence.service';

/**
 * presence 는 상담원별 hash 다 — field 가 노드, value 가 그 노드의 만료 시각.
 * 노드 하나가 자기 field 만 지우도록 해야 다른 노드에 붙어 있는 연결이 살아남는다.
 */
function buildRedis() {
  const store = new Map<string, Map<string, string>>();
  const client = {
    hset: jest.fn(async (key: string, field: string, value: string) => {
      const hash = store.get(key) ?? new Map<string, string>();
      hash.set(field, value);
      store.set(key, hash);
      return 1;
    }),
    hdel: jest.fn(async (key: string, field: string) => {
      const hash = store.get(key);
      if (!hash) return 0;
      const removed = hash.delete(field) ? 1 : 0;
      if (hash.size === 0) store.delete(key);
      return removed;
    }),
    hgetall: jest.fn(async (key: string) => Object.fromEntries(store.get(key) ?? new Map())),
    expire: jest.fn(async () => 1),
    pipeline: jest.fn(() => {
      const keys: string[] = [];
      const chain = {
        hgetall: (key: string) => {
          keys.push(key);
          return chain;
        },
        exec: async () =>
          keys.map((key) => [null, Object.fromEntries(store.get(key) ?? new Map())]),
      };
      return chain;
    }),
  };
  return { redis: { getClient: () => client } as any, client, store };
}

describe('AgentPresenceService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('records the agent as connected with a TTL so a dead node expires on its own', async () => {
    const { redis, client } = buildRedis();
    const service = new AgentPresenceService(redis);

    await service.markConnected('tenant-1', 'agent-1', 'socket-1');

    expect(client.hset).toHaveBeenCalledWith(
      'presence:tenant-1:agent-1',
      expect.any(String),
      expect.any(String),
    );
    expect(client.expire).toHaveBeenCalledWith(
      'presence:tenant-1:agent-1',
      AGENT_PRESENCE_TTL_SECONDS,
    );
    await expect(service.isConnected('tenant-1', 'agent-1')).resolves.toBe(true);

    await service.onModuleDestroy();
  });

  it('drops this node from the hash on an explicit disconnect instead of waiting for the TTL', async () => {
    const { redis, client } = buildRedis();
    const service = new AgentPresenceService(redis);

    await service.markConnected('tenant-1', 'agent-1', 'socket-1');
    await service.markDisconnected('tenant-1', 'agent-1', 'socket-1');

    expect(client.hdel).toHaveBeenCalledWith('presence:tenant-1:agent-1', expect.any(String));
    await expect(service.isConnected('tenant-1', 'agent-1')).resolves.toBe(false);

    await service.onModuleDestroy();
  });

  /**
   * Redis 를 쓴 이유가 다중 노드다. A 노드의 연결이 끊겼다고 공유 키를 통째로
   * 지우면, B 노드에 붙어 있는 상담원이 pause 된 채로 남는다 — B 의 하트비트가
   * 키를 되살려도 그때는 재계산을 돌릴 계기가 없다.
   */
  it('keeps the agent present while another node still holds a connection', async () => {
    const { redis } = buildRedis();
    const nodeA = new AgentPresenceService(redis);
    const nodeB = new AgentPresenceService(redis);

    await nodeA.markConnected('tenant-1', 'agent-1', 'socket-a');
    await nodeB.markConnected('tenant-1', 'agent-1', 'socket-b');

    await nodeA.markDisconnected('tenant-1', 'agent-1', 'socket-a');

    await expect(nodeA.isConnected('tenant-1', 'agent-1')).resolves.toBe(true);
    await expect(nodeB.isConnected('tenant-1', 'agent-1')).resolves.toBe(true);

    await nodeA.onModuleDestroy();
    await nodeB.onModuleDestroy();
  });

  it('reports the agent gone once every node has let go', async () => {
    const { redis } = buildRedis();
    const nodeA = new AgentPresenceService(redis);
    const nodeB = new AgentPresenceService(redis);

    await nodeA.markConnected('tenant-1', 'agent-1', 'socket-a');
    await nodeB.markConnected('tenant-1', 'agent-1', 'socket-b');
    await nodeA.markDisconnected('tenant-1', 'agent-1', 'socket-a');
    await nodeB.markDisconnected('tenant-1', 'agent-1', 'socket-b');

    await expect(nodeA.isConnected('tenant-1', 'agent-1')).resolves.toBe(false);

    await nodeA.onModuleDestroy();
    await nodeB.onModuleDestroy();
  });

  // 노드가 죽으면 hdel 이 아예 안 돈다. 남은 field 는 자기 만료 시각으로 스스로 무효가 돼야 한다.
  it('ignores a field left behind by a node that died', async () => {
    const { redis, store } = buildRedis();
    store.set(
      'presence:tenant-1:agent-1',
      new Map([['dead-node', String(Date.now() - 1_000)]]),
    );
    const service = new AgentPresenceService(redis);

    await expect(service.isConnected('tenant-1', 'agent-1')).resolves.toBe(false);

    await service.onModuleDestroy();
  });

  // 웹 앱과 데스크톱 소프트폰을 같이 띄운 상담원이 하나를 닫았다고 큐에서 빠지면 안 된다.
  it('keeps the agent present while another socket of theirs is still open', async () => {
    const { redis, client } = buildRedis();
    const service = new AgentPresenceService(redis);
    const seen: boolean[] = [];
    service.onChange((change) => {
      seen.push(change.connected);
    });

    await service.markConnected('tenant-1', 'agent-1', 'socket-web');
    await service.markConnected('tenant-1', 'agent-1', 'socket-desktop');
    await service.markDisconnected('tenant-1', 'agent-1', 'socket-web');

    expect(client.hdel).not.toHaveBeenCalled();
    expect(seen).toEqual([true]);

    await service.markDisconnected('tenant-1', 'agent-1', 'socket-desktop');
    expect(client.hdel).toHaveBeenCalledWith('presence:tenant-1:agent-1', expect.any(String));
    expect(seen).toEqual([true, false]);

    await service.onModuleDestroy();
  });

  it('refreshes the field on a heartbeat so a live connection never expires', async () => {
    const { redis, client } = buildRedis();
    const service = new AgentPresenceService(redis);

    await service.markConnected('tenant-1', 'agent-1', 'socket-1');
    client.hset.mockClear();

    jest.advanceTimersByTime(AGENT_PRESENCE_HEARTBEAT_MS);
    await Promise.resolve();
    await Promise.resolve();

    expect(client.hset).toHaveBeenCalledWith(
      'presence:tenant-1:agent-1',
      expect.any(String),
      expect.any(String),
    );

    await service.onModuleDestroy();
  });

  it('stops the heartbeat once the last connection is gone', async () => {
    const { redis, client } = buildRedis();
    const service = new AgentPresenceService(redis);

    await service.markConnected('tenant-1', 'agent-1', 'socket-1');
    await service.markDisconnected('tenant-1', 'agent-1', 'socket-1');
    client.hset.mockClear();

    jest.advanceTimersByTime(AGENT_PRESENCE_HEARTBEAT_MS * 3);
    await Promise.resolve();

    expect(client.hset).not.toHaveBeenCalled();

    await service.onModuleDestroy();
  });

  // Redis 를 못 읽었다고 상담원을 큐에서 빼면 Redis 장애가 콜센터 정지로 번진다.
  it('treats an unreadable Redis as "connected" rather than emptying the queue', async () => {
    const { redis, client } = buildRedis();
    client.hgetall.mockRejectedValueOnce(new Error('redis down'));
    const service = new AgentPresenceService(redis);

    await expect(service.isConnected('tenant-1', 'agent-1')).resolves.toBe(true);

    await service.onModuleDestroy();
  });

  it('still notifies listeners when Redis refuses the write', async () => {
    const { redis, client } = buildRedis();
    client.hset.mockRejectedValueOnce(new Error('redis down'));
    const service = new AgentPresenceService(redis);
    const changes: unknown[] = [];
    service.onChange((change) => {
      changes.push(change);
    });

    await service.markConnected('tenant-1', 'agent-1', 'socket-1');

    expect(changes).toEqual([{ tenantId: 'tenant-1', agentId: 'agent-1', connected: true }]);

    await service.onModuleDestroy();
  });

  it('lets a listener unsubscribe', async () => {
    const { redis } = buildRedis();
    const service = new AgentPresenceService(redis);
    const listener = jest.fn();
    const unsubscribe = service.onChange(listener);

    unsubscribe();
    await service.markConnected('tenant-1', 'agent-1', 'socket-1');

    expect(listener).not.toHaveBeenCalled();

    await service.onModuleDestroy();
  });
  it('reads many agents in one pipeline and drops the ones whose nodes expired', async () => {
    const { redis, client, store } = buildRedis();
    const service = new AgentPresenceService(redis);

    await service.markConnected('tenant-1', 'agent-live', 'socket-1');
    // 죽은 노드는 hdel 을 못 했으므로 field 가 남는다 — 만료 시각으로 걸러져야 한다.
    store.set('presence:tenant-1:agent-stale', new Map([['dead-node', String(Date.now() - 1000)]]));

    const connected = await service.connectedAgentIds('tenant-1', [
      'agent-live',
      'agent-stale',
      'agent-never',
    ]);

    expect([...connected]).toEqual(['agent-live']);
    expect(client.pipeline).toHaveBeenCalledTimes(1);
  });

  it('assumes connected when the pipeline read fails, like isConnected does', async () => {
    const { redis, client } = buildRedis();
    client.pipeline.mockImplementationOnce(() => {
      throw new Error('redis down');
    });
    const service = new AgentPresenceService(redis);

    const connected = await service.connectedAgentIds('tenant-1', ['agent-1', 'agent-2']);

    expect([...connected]).toEqual(['agent-1', 'agent-2']);
  });
});
