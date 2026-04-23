import { beforeEach, describe, expect, it, vi } from 'vitest';

const softphoneClientMocks = vi.hoisted(() => {
  const start = vi.fn(async () => undefined);
  const stop = vi.fn(async () => undefined);
  let callbacks:
    | {
        onDiagnostic: (diagnostic: {
          code: string;
          message: string;
          hint: string | null;
          source: 'config' | 'transport' | 'registration';
          severity: 'warning' | 'error';
        }) => void;
      }
    | undefined;
  return {
    start,
    stop,
    setCallbacks(input: typeof callbacks) {
      callbacks = input;
    },
    getCallbacks() {
      return callbacks;
    },
  };
});

vi.mock('../softphone/sip-softphone-client', () => ({
  SipSoftphoneClient: vi.fn().mockImplementation((callbacks) => {
    softphoneClientMocks.setCallbacks(callbacks);
    return {
      start: softphoneClientMocks.start,
      stop: softphoneClientMocks.stop,
    };
  }),
}));

import { useDesktopStore } from './useDesktopStore';

const desktopApi = {
  getConfig: vi.fn().mockResolvedValue({
    serverUrl: 'https://cti-center-a.example.com',
    channel: 'stable',
    deviceId: 'device-1',
  }),
  getAudioPreferences: vi.fn().mockResolvedValue({
    inputDeviceId: null,
    outputDeviceId: null,
    ringDeviceId: null,
    echoCancellation: true,
    noiseSuppression: true,
  }),
  saveAudioPreferences: vi.fn(async (input) => input),
  getSession: vi.fn().mockResolvedValue({
    agent: {
      agentId: 'agent-1',
      agentName: '상담원1',
      extension: '1001',
      role: 'agent',
    },
    softphoneConfig: {
      enabled: true,
      sipUri: 'sip:1001@pbx.example.com',
      wsServer: 'wss://pbx.example.com:8089/ws',
      authorizationUsername: '1001',
      authorizationPassword: 'sip-secret-1001',
      displayName: '상담원1',
      iceServers: [],
    },
  }),
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
    softphoneConfig: {
      enabled: true,
      sipUri: 'sip:1001@pbx.example.com',
      wsServer: 'wss://pbx.example.com:8089/ws',
      authorizationUsername: '1001',
      authorizationPassword: 'sip-secret-1001',
      displayName: '상담원1',
      iceServers: [],
    },
  }),
  refreshSession: vi.fn().mockResolvedValue(null),
  connectRuntime: vi.fn().mockResolvedValue(undefined),
  mute: vi.fn(),
  hangup: vi.fn(),
  pickup: vi.fn(),
  originate: vi.fn(),
  transfer: vi.fn(),
  cancelAttendedTransfer: vi.fn(),
  completeAttendedTransfer: vi.fn(),
  hold: vi.fn(),
  resume: vi.fn(),
  checkForUpdates: vi.fn().mockResolvedValue(null),
  prepareUpdate: vi.fn().mockResolvedValue(null),
  applyPreparedUpdate: vi.fn().mockResolvedValue(null),
  getDesktopSession: vi.fn(),
  onEvent: vi.fn(() => () => undefined),
};

vi.stubGlobal('window', { desktopApi });
vi.stubGlobal('navigator', {
  mediaDevices: {
    enumerateDevices: vi.fn(async () => []),
  },
});
vi.stubGlobal(
  'Audio',
  class FakeAudio {
    src = '';
    loop = false;
    currentTime = 0;
    async play() {
      return undefined;
    }
    pause() {}
    async setSinkId(_sinkId: string) {
      return undefined;
    }
  },
);

function resetStore() {
  useDesktopStore.setState({
    bootstrapped: false,
    pairing: false,
    agent: null,
    agentStatus: null,
    config: null,
    activeCall: null,
    events: [],
    audioPermission: 'unknown',
    refreshingAudioDevices: false,
    audioPreferences: null,
    audioDevices: { inputs: [], outputs: [] },
    audioCapabilities: { sinkSelectionSupported: false },
      softphone: null,
      updateState: null,
      initialize: useDesktopStore.getState().initialize,
      pair: useDesktopStore.getState().pair,
      reconnectRuntime: useDesktopStore.getState().reconnectRuntime,
      originate: useDesktopStore.getState().originate,
    pickup: useDesktopStore.getState().pickup,
    mute: useDesktopStore.getState().mute,
    hangup: useDesktopStore.getState().hangup,
    toggleHold: useDesktopStore.getState().toggleHold,
    transfer: useDesktopStore.getState().transfer,
    cancelAttendedTransfer: useDesktopStore.getState().cancelAttendedTransfer,
    completeAttendedTransfer: useDesktopStore.getState().completeAttendedTransfer,
    checkForUpdates: useDesktopStore.getState().checkForUpdates,
    prepareUpdate: useDesktopStore.getState().prepareUpdate,
    applyPreparedUpdate: useDesktopStore.getState().applyPreparedUpdate,
    refreshAudioDevices: useDesktopStore.getState().refreshAudioDevices,
    requestAudioPermission: useDesktopStore.getState().requestAudioPermission,
    updateAudioPreferences: useDesktopStore.getState().updateAudioPreferences,
    playOutputPreview: useDesktopStore.getState().playOutputPreview,
    playRingPreview: useDesktopStore.getState().playRingPreview,
    startSoftphone: useDesktopStore.getState().startSoftphone,
    stopSoftphone: useDesktopStore.getState().stopSoftphone,
  });
}

describe('useDesktopStore softphone runtime', () => {
  beforeEach(() => {
    softphoneClientMocks.start.mockClear();
    softphoneClientMocks.stop.mockClear();
    resetStore();
  });

  it('initialize 는 desktop softphone credential 이 있으면 SIP runtime 시작을 시도한다', async () => {
    await useDesktopStore.getState().initialize();

    expect(softphoneClientMocks.start).toHaveBeenCalledWith({
      enabled: true,
      sipUri: 'sip:1001@pbx.example.com',
      wsServer: 'wss://pbx.example.com:8089/ws',
      authorizationUsername: '1001',
      authorizationPassword: 'sip-secret-1001',
      displayName: '상담원1',
      iceServers: [],
    });
  });

  it('softphone diagnostic callback 이 들어오면 store 에 최근 진단 정보를 쌓는다', async () => {
    await useDesktopStore.getState().initialize();

    softphoneClientMocks.getCallbacks()?.onDiagnostic({
      code: 'REGISTER_FAILED',
      message: 'SIP 등록에 실패했습니다.',
      hint: '내선 인증 정보와 PBX 응답을 확인하세요.',
      source: 'registration',
      severity: 'error',
    });

    expect(useDesktopStore.getState().softphone?.diagnostics[0]).toEqual({
      code: 'REGISTER_FAILED',
      message: 'SIP 등록에 실패했습니다.',
      hint: '내선 인증 정보와 PBX 응답을 확인하세요.',
      source: 'registration',
      severity: 'error',
      occurredAt: expect.any(String),
    });
    expect(useDesktopStore.getState().events[0]).toContain('softphone 진단 REGISTER_FAILED');
  });
});
