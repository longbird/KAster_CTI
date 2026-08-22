import { EventBusService } from './event-bus.service';

function buildDeps() {
  const gateway = { broadcastToTenant: jest.fn() } as any;
  const pubClient = { publish: jest.fn().mockResolvedValue(1) };
  const handlers: Array<(channel: string, raw: string) => void> = [];
  const subClient = {
    subscribe: jest.fn().mockResolvedValue(undefined),
    on: jest.fn((_event: string, handler: (channel: string, raw: string) => void) => {
      handlers.push(handler);
    }),
    quit: jest.fn().mockResolvedValue(undefined),
  };
  const redis = {
    getClient: () => pubClient,
    createSubscriberClient: () => subClient,
  } as any;

  return { gateway, pubClient, redis, handlers };
}

describe('EventBusService tenant scoping', () => {
  it('carries the tenant onto the pub/sub wire', async () => {
    const { gateway, pubClient, redis } = buildDeps();
    const bus = new EventBusService(gateway, redis);

    await bus.publish('queue.summary.updated', { queues: [] }, 'tenant-1');

    const [, raw] = pubClient.publish.mock.calls[0];
    expect(JSON.parse(raw).tenantId).toBe('tenant-1');
  });

  it('hands a received event to the tenant room it came from', async () => {
    const { gateway, redis, handlers } = buildDeps();
    const bus = new EventBusService(gateway, redis);
    await bus.onModuleInit();

    handlers[0]('kaster:cti:events', JSON.stringify({
      event: 'call.updated',
      payload: { callId: 'call-1' },
      sourceNode: 'other-node',
      tenantId: 'tenant-1',
    }));

    expect(gateway.broadcastToTenant).toHaveBeenCalledWith(
      'call.updated',
      { callId: 'call-1' },
      'tenant-1',
    );
  });

  // 구버전 노드가 섞여 있는 배포 중에는 tenantId 없는 메시지가 올 수 있다.
  // 그걸 전체로 뿌리면 회사 경계가 무너진다. 한 주기 놓치는 쪽을 택한다.
  it('drops a wire message with no tenant instead of broadcasting it to everyone', async () => {
    const { gateway, redis, handlers } = buildDeps();
    const listener = jest.fn();
    const bus = new EventBusService(gateway, redis);
    await bus.onModuleInit();
    bus.subscribe(listener);

    handlers[0]('kaster:cti:events', JSON.stringify({
      event: 'call.updated',
      payload: { callId: 'call-1' },
      sourceNode: 'other-node',
    }));

    expect(gateway.broadcastToTenant).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
  });

  it('keeps the tenant scope on the local fallback when redis publish fails', async () => {
    const { gateway, pubClient, redis } = buildDeps();
    pubClient.publish.mockRejectedValue(new Error('redis down'));
    const bus = new EventBusService(gateway, redis);

    await bus.publish('call.ended', { callId: 'call-1' }, 'tenant-1');

    expect(gateway.broadcastToTenant).toHaveBeenCalledWith(
      'call.ended',
      { callId: 'call-1' },
      'tenant-1',
    );
  });
});
