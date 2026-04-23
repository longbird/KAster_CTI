import { beforeEach, describe, expect, it, vi } from 'vitest';
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
      displayName: '상담원1',
      iceServers: [],
    },
  }),
  saveConfig: vi.fn(),
  exchangeHandoff: vi.fn(),
  refreshSession: vi.fn(),
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

describe('useDesktopStore softphone bootstrap', () => {
  beforeEach(() => {
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
      answerSoftphoneCall: useDesktopStore.getState().answerSoftphoneCall,
      rejectSoftphoneCall: useDesktopStore.getState().rejectSoftphoneCall,
      hangupSoftphoneCall: useDesktopStore.getState().hangupSoftphoneCall,
    });
  });

  it('initialize 는 세션의 softphoneConfig 로 softphone 상태를 만든다', async () => {
    await useDesktopStore.getState().initialize();

    expect(useDesktopStore.getState().softphone).toEqual({
      registration: 'idle',
      transport: 'not-connected',
      config: {
        enabled: true,
        sipUri: 'sip:1001@pbx.example.com',
        wsServer: 'wss://pbx.example.com:8089/ws',
        authorizationUsername: '1001',
        displayName: '상담원1',
        iceServers: [],
      },
      lastError: null,
      diagnostics: [],
      session: null,
      remoteAudioActive: false,
    });
  });
});
