import * as jwt from 'jsonwebtoken';
import { RealtimeGateway } from './realtime.gateway';

describe('RealtimeGateway', () => {
  const tenantId = 'tenant-1';

  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret';
  });

  it('joins tenant room when verified JWT has tenantId', () => {
    const gateway = new RealtimeGateway();
    const token = jwt.sign({ sub: 'agent-1', tenantId, role: 'agent' }, 'test-secret');
    const client = {
      id: 'socket-1',
      handshake: { auth: { token } },
      data: {},
      join: jest.fn(),
      disconnect: jest.fn(),
    };

    gateway.handleConnection(client);

    expect(client.join).toHaveBeenCalledWith(`tenant:${tenantId}`);
    expect(client.data).toMatchObject({
      sub: 'agent-1',
      tenantId,
      role: 'agent',
    });
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it('broadcasts to tenant room when tenantId is supplied', () => {
    const gateway = new RealtimeGateway();
    const emit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit });
    gateway.server = { to, emit: jest.fn() };
    const payload = { callId: 'call-1' };

    gateway.broadcast('call.updated', payload, tenantId);

    expect(to).toHaveBeenCalledWith(`tenant:${tenantId}`);
    expect(emit).toHaveBeenCalledWith('call.updated', payload);
    expect(gateway.server.emit).not.toHaveBeenCalled();
  });

  it('keeps global broadcast when tenantId is not supplied', () => {
    const gateway = new RealtimeGateway();
    gateway.server = { to: jest.fn(), emit: jest.fn() };
    const payload = { callId: 'call-1' };

    gateway.broadcast('call.updated', payload);

    expect(gateway.server.emit).toHaveBeenCalledWith('call.updated', payload);
    expect(gateway.server.to).not.toHaveBeenCalled();
  });
});
