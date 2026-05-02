import { describe, expect, it, vi } from 'vitest';
import {
  ADMIN_REALTIME_EVENTS,
  connectAdminRealtime,
  shouldRefreshDashboardForRealtimeEvent,
} from './adminRealtime';

describe('adminRealtime', () => {
  it('connects to the admin websocket namespace with the current bearer token', () => {
    const disconnect = vi.fn();
    const on = vi.fn();
    const io = vi.fn((_: string, __: { auth: unknown; transports: string[] }) => ({
      on,
      disconnect,
    }));
    const onEvent = vi.fn();

    const close = connectAdminRealtime(onEvent, {
      getAccessToken: () => 'access-token',
      io,
      wsBaseUrl: 'http://localhost:3000',
    });

    expect(io).toHaveBeenCalledWith(
      'http://localhost:3000/ws',
      expect.objectContaining({
        auth: expect.any(Function),
        transports: ['websocket', 'polling'],
      }),
    );
    const authCallback = vi.fn();
    const auth = io.mock.calls[0][1].auth;
    expect(typeof auth).toBe('function');
    if (typeof auth === 'function') auth(authCallback);
    expect(authCallback).toHaveBeenCalledWith({ token: 'access-token' });
    expect(on).toHaveBeenCalledTimes(ADMIN_REALTIME_EVENTS.length);

    const callUpdatedHandler = on.mock.calls.find(([event]) => event === 'call.updated')?.[1];
    callUpdatedHandler?.({ callId: 'call-1' });
    expect(onEvent).toHaveBeenCalledWith({ type: 'call.updated', payload: { callId: 'call-1' } });

    close();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('reads a fresh token when Socket.IO asks for reconnect auth', () => {
    const on = vi.fn();
    const io = vi.fn((_: string, __: { auth: unknown; transports: string[] }) => ({
      on,
      disconnect: vi.fn(),
    }));
    const tokens = ['initial-token', 'rotated-token'];

    connectAdminRealtime(vi.fn(), {
      getAccessToken: () => tokens.shift() ?? null,
      io,
      wsBaseUrl: 'http://localhost:3000',
    });

    const authCallback = vi.fn();
    const auth = io.mock.calls[0][1].auth;
    expect(typeof auth).toBe('function');
    if (typeof auth === 'function') auth(authCallback);

    expect(authCallback).toHaveBeenCalledWith({ token: 'rotated-token' });
  });

  it('does not connect when there is no access token', () => {
    const io = vi.fn();

    const close = connectAdminRealtime(vi.fn(), {
      getAccessToken: () => null,
      io,
      wsBaseUrl: 'http://localhost:3000',
    });

    expect(io).not.toHaveBeenCalled();
    expect(close()).toBeUndefined();
  });

  it('refreshes dashboard data for operational realtime events', () => {
    expect(shouldRefreshDashboardForRealtimeEvent('call.created')).toBe(true);
    expect(shouldRefreshDashboardForRealtimeEvent('call.updated')).toBe(true);
    expect(shouldRefreshDashboardForRealtimeEvent('call.ended')).toBe(true);
    expect(shouldRefreshDashboardForRealtimeEvent('agent.status.changed')).toBe(true);
    expect(shouldRefreshDashboardForRealtimeEvent('queue.summary.updated')).toBe(true);
    expect(shouldRefreshDashboardForRealtimeEvent('screenpop.customer')).toBe(false);
  });
});
