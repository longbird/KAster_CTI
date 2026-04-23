import { beforeEach, describe, expect, it, vi } from 'vitest';

const softphoneClientMocks = vi.hoisted(() => {
  const start = vi.fn(async () => undefined);
  const stop = vi.fn(async () => undefined);
  const answer = vi.fn(async () => undefined);
  const reject = vi.fn(async () => undefined);
  const hangup = vi.fn(async () => undefined);
  let callbacks:
    | {
        onCallState: (call: unknown) => void;
        onRemoteStream: (stream: unknown) => void;
      }
    | undefined;

  return {
    start,
    stop,
    answer,
    reject,
    hangup,
    setCallbacks(input: typeof callbacks) {
      callbacks = input;
    },
    getCallbacks() {
      return callbacks;
    },
  };
});

const softphoneMediaControllerMocks = vi.hoisted(() => {
  const attachRemoteStream = vi.fn(async () => undefined);
  const detachRemoteStream = vi.fn();
  const applyOutputDevice = vi.fn(async () => undefined);
  const applyRingDevice = vi.fn(async () => undefined);
  const startRingtone = vi.fn(async () => undefined);
  const stopRingtone = vi.fn();

  return {
    attachRemoteStream,
    detachRemoteStream,
    applyOutputDevice,
    applyRingDevice,
    startRingtone,
    stopRingtone,
  };
});

vi.mock('../softphone/sip-softphone-client', () => ({
  SipSoftphoneClient: vi.fn().mockImplementation((callbacks) => {
    softphoneClientMocks.setCallbacks(callbacks);
    return {
      start: softphoneClientMocks.start,
      stop: softphoneClientMocks.stop,
      answer: softphoneClientMocks.answer,
      reject: softphoneClientMocks.reject,
      hangup: softphoneClientMocks.hangup,
    };
  }),
}));

vi.mock('../softphone/softphone-media-controller', () => ({
  SoftphoneMediaController: vi.fn().mockImplementation(() => ({
    attachRemoteStream: softphoneMediaControllerMocks.attachRemoteStream,
    detachRemoteStream: softphoneMediaControllerMocks.detachRemoteStream,
    applyOutputDevice: softphoneMediaControllerMocks.applyOutputDevice,
    applyRingDevice: softphoneMediaControllerMocks.applyRingDevice,
    startRingtone: softphoneMediaControllerMocks.startRingtone,
    stopRingtone: softphoneMediaControllerMocks.stopRingtone,
  })),
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
    outputDeviceId: 'speaker-1',
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
  notifyIncomingCall: vi.fn(),
  focusWindow: vi.fn(),
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
    autoplay = false;
    currentTime = 0;
    srcObject: MediaStream | null = null;
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
    answerSoftphoneCall: useDesktopStore.getState().answerSoftphoneCall,
    rejectSoftphoneCall: useDesktopStore.getState().rejectSoftphoneCall,
    hangupSoftphoneCall: useDesktopStore.getState().hangupSoftphoneCall,
  });
}

describe('useDesktopStore softphone call state', () => {
  beforeEach(() => {
    softphoneClientMocks.start.mockClear();
    softphoneClientMocks.stop.mockClear();
    softphoneClientMocks.answer.mockClear();
    softphoneClientMocks.reject.mockClear();
    softphoneClientMocks.hangup.mockClear();
    softphoneMediaControllerMocks.attachRemoteStream.mockClear();
    softphoneMediaControllerMocks.detachRemoteStream.mockClear();
    softphoneMediaControllerMocks.applyOutputDevice.mockClear();
    softphoneMediaControllerMocks.applyRingDevice.mockClear();
    softphoneMediaControllerMocks.startRingtone.mockClear();
    softphoneMediaControllerMocks.stopRingtone.mockClear();
    desktopApi.notifyIncomingCall.mockClear();
    desktopApi.focusWindow.mockClear();
    resetStore();
  });

  it('softphone callback 이 들어오면 store 가 ringing 세션 상태를 반영한다', async () => {
    await useDesktopStore.getState().initialize();

    softphoneClientMocks.getCallbacks()?.onCallState({
      id: 'invite-1',
      direction: 'incoming',
      phase: 'ringing',
      remoteDisplayName: '고객A',
      remoteUri: 'sip:customer-a@pbx.example.com',
    });

    expect(useDesktopStore.getState().softphone?.session).toEqual({
      id: 'invite-1',
      direction: 'incoming',
      phase: 'ringing',
      remoteDisplayName: '고객A',
      remoteUri: 'sip:customer-a@pbx.example.com',
    });
    expect(softphoneMediaControllerMocks.startRingtone).toHaveBeenCalled();
    expect(desktopApi.notifyIncomingCall).toHaveBeenCalledWith({
      title: '착신 전화',
      body: '고객A / sip:customer-a@pbx.example.com',
    });
    expect(desktopApi.focusWindow).toHaveBeenCalled();
  });

  it('softphone 세션이 active 또는 null 로 바뀌면 벨소리를 멈춘다', async () => {
    await useDesktopStore.getState().initialize();

    softphoneClientMocks.getCallbacks()?.onCallState({
      id: 'invite-1',
      direction: 'incoming',
      phase: 'ringing',
      remoteDisplayName: '고객A',
      remoteUri: 'sip:customer-a@pbx.example.com',
    });
    softphoneMediaControllerMocks.stopRingtone.mockClear();

    softphoneClientMocks.getCallbacks()?.onCallState({
      id: 'invite-1',
      direction: 'incoming',
      phase: 'active',
      remoteDisplayName: '고객A',
      remoteUri: 'sip:customer-a@pbx.example.com',
    });
    softphoneClientMocks.getCallbacks()?.onCallState(null);

    expect(softphoneMediaControllerMocks.stopRingtone).toHaveBeenCalled();
  });

  it('answerSoftphoneCall 은 softphone client answer 를 호출한다', async () => {
    await useDesktopStore.getState().initialize();

    await useDesktopStore.getState().answerSoftphoneCall();

    expect(softphoneClientMocks.answer).toHaveBeenCalledWith({
      inputDeviceId: null,
      outputDeviceId: 'speaker-1',
      ringDeviceId: null,
      echoCancellation: true,
      noiseSuppression: true,
    });
  });

  it('initialize 와 audio preference 변경은 ring device 도 media controller 에 반영한다', async () => {
    await useDesktopStore.getState().initialize();
    expect(softphoneMediaControllerMocks.applyRingDevice).toHaveBeenCalledWith(null);

    await useDesktopStore.getState().updateAudioPreferences({
      inputDeviceId: null,
      outputDeviceId: 'speaker-1',
      ringDeviceId: 'ringer-1',
      echoCancellation: true,
      noiseSuppression: true,
    });

    expect(softphoneMediaControllerMocks.applyRingDevice).toHaveBeenCalledWith('ringer-1');
  });

  it('같은 ringing 세션에 대해서는 알림을 중복 발행하지 않는다', async () => {
    await useDesktopStore.getState().initialize();

    softphoneClientMocks.getCallbacks()?.onCallState({
      id: 'invite-dup',
      direction: 'incoming',
      phase: 'ringing',
      remoteDisplayName: '고객B',
      remoteUri: 'sip:customer-b@pbx.example.com',
    });
    softphoneClientMocks.getCallbacks()?.onCallState({
      id: 'invite-dup',
      direction: 'incoming',
      phase: 'ringing',
      remoteDisplayName: '고객B',
      remoteUri: 'sip:customer-b@pbx.example.com',
    });

    expect(desktopApi.notifyIncomingCall).toHaveBeenCalledTimes(1);
    expect(desktopApi.focusWindow).toHaveBeenCalledTimes(1);
  });

  it('softphone 세션이 있으면 applyPreparedUpdate 를 실행하지 않는다', async () => {
    await useDesktopStore.getState().initialize();
    useDesktopStore.setState({
      updateState: {
        message: '새 버전 1.0.1 이 준비되었습니다.',
        mandatory: false,
        preparing: false,
        preparedFileName: 'KAsterAgent-1.0.1-Setup.exe',
        preparedFilePath: 'C:/temp/KAsterAgent-1.0.1-Setup.exe',
        verified: true,
        applying: false,
      },
    });

    softphoneClientMocks.getCallbacks()?.onCallState({
      id: 'invite-2',
      direction: 'incoming',
      phase: 'active',
      remoteDisplayName: '고객C',
      remoteUri: 'sip:customer-c@pbx.example.com',
    });

    await useDesktopStore.getState().applyPreparedUpdate();

    expect(desktopApi.applyPreparedUpdate).not.toHaveBeenCalled();
    expect(useDesktopStore.getState().events[0]).toContain('업데이트 적용 보류');
  });
});
