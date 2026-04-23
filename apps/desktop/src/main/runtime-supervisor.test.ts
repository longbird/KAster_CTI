import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DesktopAuthSession } from './auth-client';
import type { CtiEvent } from '../shared/cti';
import { RuntimeSupervisor } from './runtime-supervisor';

describe('RuntimeSupervisor', () => {
  let loadConfig: ReturnType<typeof vi.fn>;
  let loadSession: ReturnType<typeof vi.fn>;
  let saveSession: ReturnType<typeof vi.fn>;
  let refreshSession: ReturnType<typeof vi.fn>;
  let runtimeConnect: ReturnType<typeof vi.fn>;
  let runtimeDisconnect: ReturnType<typeof vi.fn>;
  let createRuntime: ReturnType<typeof vi.fn>;
  let broadcast: ReturnType<typeof vi.fn>;
  let scheduledRecovery: (() => Promise<void>) | null;
  let runtimeLifecycleHandler:
    | ((payload: { state: 'connected' | 'reconnecting' | 'disconnected' | 'error'; reason?: string }) => void)
    | null;

  const storedSession: DesktopAuthSession = {
    accessToken: 'access-1',
    refreshToken: 'refresh-1',
    agent: {
      agentId: 'agent-1',
      agentName: '상담원1',
      extension: '1001',
      role: 'agent',
    },
  };

  beforeEach(() => {
    scheduledRecovery = null;
    runtimeLifecycleHandler = null;
    loadConfig = vi.fn().mockResolvedValue({
      serverUrl: 'https://cti-center-a.example.com',
      channel: 'stable',
      deviceId: 'device-1',
    });
    loadSession = vi.fn().mockResolvedValue(storedSession);
    saveSession = vi.fn().mockResolvedValue(undefined);
    refreshSession = vi.fn().mockResolvedValue({
      ...storedSession,
      accessToken: 'access-2',
      refreshToken: 'refresh-2',
    });
    runtimeConnect = vi.fn((_handlers: {
      onEvent: (event: CtiEvent) => void;
      onConnectionState?: (payload: { state: 'connected' | 'reconnecting' | 'disconnected' | 'error'; reason?: string }) => void;
    }) => {
      runtimeLifecycleHandler = _handlers.onConnectionState ?? null;
    });
    runtimeDisconnect = vi.fn();
    createRuntime = vi.fn().mockReturnValue({
      connect: runtimeConnect,
      disconnect: runtimeDisconnect,
    });
    broadcast = vi.fn();
  });

  it('connect 는 현재 세션으로 runtime 을 시작한다', async () => {
    const supervisor = new RuntimeSupervisor({
      loadConfig,
      loadSession,
      saveSession,
      refreshSession,
      createRuntime,
      broadcast,
      scheduleRecovery: (task) => {
        scheduledRecovery = task;
      },
    });

    await supervisor.connect();

    expect(createRuntime).toHaveBeenCalledWith({
      baseUrl: 'https://cti-center-a.example.com',
      accessToken: 'access-1',
    });
    expect(runtimeConnect).toHaveBeenCalled();
  });

  it('disconnect lifecycle 뒤 recovery 가 refresh 후 runtime 을 다시 시작한다', async () => {
    const supervisor = new RuntimeSupervisor({
      loadConfig,
      loadSession,
      saveSession,
      refreshSession,
      createRuntime,
      broadcast,
      scheduleRecovery: (task) => {
        scheduledRecovery = task;
      },
    });

    await supervisor.connect();
    runtimeLifecycleHandler?.({ state: 'disconnected', reason: 'transport close' });
    await scheduledRecovery?.();

    expect(refreshSession).toHaveBeenCalledWith(storedSession);
    expect(saveSession).toHaveBeenCalledWith({
      ...storedSession,
      accessToken: 'access-2',
      refreshToken: 'refresh-2',
    });
    expect(runtimeDisconnect).toHaveBeenCalled();
    expect(createRuntime).toHaveBeenLastCalledWith({
      baseUrl: 'https://cti-center-a.example.com',
      accessToken: 'access-2',
    });
    expect(broadcast).toHaveBeenCalledWith({
      type: 'runtime.connection.changed',
      payload: {
        state: 'disconnected',
        reason: 'transport close',
      },
    });
  });

  it('refresh 실패 시에는 저장 세션으로 fallback 해서 runtime 을 다시 시작한다', async () => {
    refreshSession.mockRejectedValueOnce(new Error('refresh failed'));
    const supervisor = new RuntimeSupervisor({
      loadConfig,
      loadSession,
      saveSession,
      refreshSession,
      createRuntime,
      broadcast,
      scheduleRecovery: (task) => {
        scheduledRecovery = task;
      },
    });

    await supervisor.connect();
    runtimeLifecycleHandler?.({ state: 'error', reason: 'unauthorized' });
    await scheduledRecovery?.();

    expect(createRuntime).toHaveBeenLastCalledWith({
      baseUrl: 'https://cti-center-a.example.com',
      accessToken: 'access-1',
    });
  });
});
