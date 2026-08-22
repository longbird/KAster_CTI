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
