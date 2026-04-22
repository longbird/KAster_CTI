import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDesktopStore } from './useDesktopStore';

const desktopApi = {
  getConfig: vi.fn().mockResolvedValue(null),
  getSession: vi.fn().mockResolvedValue(null),
  saveConfig: vi.fn().mockResolvedValue({
    serverUrl: 'https://cti-center-a.example.com',
    channel: 'stable',
    deviceId: 'device-1',
  }),
  exchangeHandoff: vi.fn().mockResolvedValue({
    agent: {
      agentId: 'agent-1',
      agentName: '상담원1',
      extension: '1001',
      role: 'agent',
    },
  }),
  refreshSession: vi.fn().mockResolvedValue(null),
  connectRuntime: vi.fn().mockResolvedValue(undefined),
  mute: vi.fn(),
  hangup: vi.fn(),
  hold: vi.fn(),
  resume: vi.fn(),
  checkForUpdates: vi.fn().mockResolvedValue(null),
  prepareUpdate: vi.fn().mockResolvedValue(null),
  applyPreparedUpdate: vi.fn().mockResolvedValue(null),
  onEvent: vi.fn(() => () => undefined),
};

vi.stubGlobal('window', { desktopApi });

describe('useDesktopStore pairing', () => {
  beforeEach(() => {
    useDesktopStore.setState({
      bootstrapped: false,
      pairing: false,
      agent: null,
      agentStatus: null,
      config: null,
      activeCall: null,
      events: [],
      updateState: null,
      initialize: useDesktopStore.getState().initialize,
      pair: useDesktopStore.getState().pair,
      mute: useDesktopStore.getState().mute,
      hangup: useDesktopStore.getState().hangup,
      toggleHold: useDesktopStore.getState().toggleHold,
      checkForUpdates: useDesktopStore.getState().checkForUpdates,
      prepareUpdate: useDesktopStore.getState().prepareUpdate,
      applyPreparedUpdate: useDesktopStore.getState().applyPreparedUpdate,
    });
  });

  it('pair 는 config 저장 후 handoff 교환과 runtime 연결까지 수행한다', async () => {
    await useDesktopStore.getState().pair({
      serverUrl: 'cti-center-a.example.com',
      channel: 'stable',
      handoffToken: 'handoff-1',
    });

    const state = useDesktopStore.getState();
    expect(state.config?.serverUrl).toBe('https://cti-center-a.example.com');
    expect(state.agent?.agentId).toBe('agent-1');
    expect(desktopApi.connectRuntime).toHaveBeenCalled();
  });

  it('toggleHold 는 HOLD 상태에 따라 hold 또는 resume 을 호출한다', async () => {
    useDesktopStore.setState({
      bootstrapped: true,
      pairing: false,
      agent: {
        agentId: 'agent-1',
        agentName: '상담원1',
        extension: '1001',
        role: 'agent',
      },
      agentStatus: 'TALKING',
      config: {
        serverUrl: 'https://cti-center-a.example.com',
        channel: 'stable',
        deviceId: 'device-1',
      },
      activeCall: {
        callId: 'call-1',
        linkedid: 'linked-1',
        ani: '01012345678',
        dnis: '15880000',
        queueName: '대표',
        sessionStatus: 'TALKING',
        startedAt: '2026-04-22T12:00:00.000Z',
      },
      events: [],
      updateState: null,
      initialize: useDesktopStore.getState().initialize,
      pair: useDesktopStore.getState().pair,
      mute: useDesktopStore.getState().mute,
      hangup: useDesktopStore.getState().hangup,
      toggleHold: useDesktopStore.getState().toggleHold,
      checkForUpdates: useDesktopStore.getState().checkForUpdates,
      prepareUpdate: useDesktopStore.getState().prepareUpdate,
      applyPreparedUpdate: useDesktopStore.getState().applyPreparedUpdate,
    });

    await useDesktopStore.getState().toggleHold();
    expect(desktopApi.hold).toHaveBeenCalledWith('call-1');
    expect(useDesktopStore.getState().activeCall?.sessionStatus).toBe('HOLD');

    await useDesktopStore.getState().toggleHold();
    expect(desktopApi.resume).toHaveBeenCalledWith('call-1');
    expect(useDesktopStore.getState().activeCall?.sessionStatus).toBe('TALKING');
  });
});
