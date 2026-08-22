import * as jwt from 'jsonwebtoken';
import { RealtimeGateway } from './realtime.gateway';

function signToken(overrides?: Record<string, unknown>) {
  return jwt.sign(
    {
      sub: 'agent-1',
      tenantId: 'tenant-1',
      role: 'agent',
      extension: '1001',
      ...overrides,
    },
    'change_me',
    { expiresIn: '15m' },
  );
}

function buildClient(token?: string) {
  return {
    id: 'socket-1',
    data: undefined as any,
    handshake: { auth: token ? { token } : {} },
    join: jest.fn(),
    disconnect: jest.fn(),
  };
}

function buildPresence() {
  return {
    markConnected: jest.fn().mockResolvedValue(undefined),
    markDisconnected: jest.fn().mockResolvedValue(undefined),
  } as any;
}

// socket.io 서버를 흉내내되 "어느 방으로 갔는지" 를 기록한다.
// room '*' 은 서버 전체 emit — 즉 남의 회사 소켓까지 받은 경우다.
function buildFakeServer() {
  const delivered: Array<{ room: string; event: string; payload: unknown }> = [];
  return {
    delivered,
    to(room: string) {
      return {
        emit: (event: string, payload: unknown) => delivered.push({ room, event, payload }),
      };
    },
    emit(event: string, payload: unknown) {
      delivered.push({ room: '*', event, payload });
    },
  };
}

describe('RealtimeGateway presence', () => {
  const previousSecret = process.env.JWT_SECRET;

  beforeAll(() => {
    process.env.JWT_SECRET = 'change_me';
  });

  afterAll(() => {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  });

  // 큐 pause 는 내선으로 걸린다. 소켓에 내선이 없으면 접속을 알아도 큐를 못 푼다.
  it('keeps the extension on the socket so the queue member can be found later', async () => {
    const presence = buildPresence();
    const gateway = new RealtimeGateway(presence);
    const client = buildClient(signToken());

    gateway.handleConnection(client);
    await Promise.resolve();

    expect(client.data.extension).toBe('1001');
    expect(client.data.sub).toBe('agent-1');
  });

  it('records the agent as present when their app connects', async () => {
    const presence = buildPresence();
    const gateway = new RealtimeGateway(presence);
    const client = buildClient(signToken());

    gateway.handleConnection(client);
    await Promise.resolve();

    expect(presence.markConnected).toHaveBeenCalledWith('tenant-1', 'agent-1', 'socket-1');
  });

  it('records the agent as gone when their app disconnects', async () => {
    const presence = buildPresence();
    const gateway = new RealtimeGateway(presence);
    const client = buildClient(signToken());

    gateway.handleConnection(client);
    await Promise.resolve();
    gateway.handleDisconnect(client);
    await Promise.resolve();

    expect(presence.markDisconnected).toHaveBeenCalledWith('tenant-1', 'agent-1', 'socket-1');
  });

  // 토큰 없이 붙었다 끊긴 소켓은 어떤 상담원도 대표하지 않는다.
  it('leaves presence untouched for a socket that never authenticated', async () => {
    const presence = buildPresence();
    const gateway = new RealtimeGateway(presence);
    const client = buildClient();

    gateway.handleConnection(client);
    await Promise.resolve();
    gateway.handleDisconnect(client);
    await Promise.resolve();

    expect(client.disconnect).toHaveBeenCalled();
    expect(presence.markConnected).not.toHaveBeenCalled();
    expect(presence.markDisconnected).not.toHaveBeenCalled();
  });
});

describe('RealtimeGateway tenant scoping', () => {
  it('delivers an event only to the room of the tenant it belongs to', () => {
    const gateway = new RealtimeGateway(buildPresence());
    const server = buildFakeServer();
    gateway.server = server;

    gateway.broadcastToTenant('queue.summary.updated', { queues: ['sales'] }, 'tenant-1');

    expect(server.delivered).toEqual([
      { room: 'tenant:tenant-1', event: 'queue.summary.updated', payload: { queues: ['sales'] } },
    ]);
  });

  // 다른 회사 상담원 화면에 남의 큐 이름과 대기 건수가 가면 안 된다.
  it('never reaches another tenant or the whole server', () => {
    const gateway = new RealtimeGateway(buildPresence());
    const server = buildFakeServer();
    gateway.server = server;

    gateway.broadcastToTenant('queue.summary.updated', { queues: ['sales'] }, 'tenant-1');

    expect(server.delivered.some((d) => d.room === '*')).toBe(false);
    expect(server.delivered.some((d) => d.room === 'tenant:tenant-2')).toBe(false);
  });

  // 테넌트를 모르는 이벤트는 전 테넌트로 흘리느니 버린다.
  it('drops an event with no tenant instead of sending it everywhere', () => {
    const gateway = new RealtimeGateway(buildPresence());
    const server = buildFakeServer();
    gateway.server = server;

    gateway.broadcastToTenant('queue.summary.updated', { queues: ['sales'] }, '');

    expect(server.delivered).toEqual([]);
  });
});
