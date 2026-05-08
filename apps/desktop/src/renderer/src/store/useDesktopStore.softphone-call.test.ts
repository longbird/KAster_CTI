import { beforeEach, describe, expect, it, vi } from 'vitest';

const softphoneClientMocks = vi.hoisted(() => {
  const start = vi.fn(async () => undefined);
  const stop = vi.fn(async () => undefined);
  const answer = vi.fn(async () => undefined);
  const reject = vi.fn(async () => undefined);
  const hangup = vi.fn(async () => undefined);
  const setMuted = vi.fn(() => true);
  const setHeld = vi.fn(async () => true);
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
    setMuted,
    setHeld,
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
      setMuted: softphoneClientMocks.setMuted,
      setHeld: softphoneClientMocks.setHeld,
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
  recordDiagnosticEvent: vi.fn().mockResolvedValue(undefined),
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
    softphoneClientMocks.setMuted.mockClear();
    softphoneClientMocks.setHeld.mockClear();
    softphoneMediaControllerMocks.attachRemoteStream.mockClear();
    softphoneMediaControllerMocks.detachRemoteStream.mockClear();
    softphoneMediaControllerMocks.applyOutputDevice.mockClear();
    softphoneMediaControllerMocks.applyRingDevice.mockClear();
    softphoneMediaControllerMocks.startRingtone.mockClear();
    softphoneMediaControllerMocks.stopRingtone.mockClear();
    desktopApi.notifyIncomingCall.mockClear();
    desktopApi.focusWindow.mockClear();
    desktopApi.originate.mockClear();
    desktopApi.recordDiagnosticEvent.mockClear();
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

  it('softphone 발신 연결 중에는 발신음을 재생하고 active 또는 null 로 바뀌면 멈춘다', async () => {
    await useDesktopStore.getState().initialize();

    softphoneClientMocks.getCallbacks()?.onCallState({
      id: 'invite-1',
      direction: 'outgoing',
      phase: 'establishing',
      remoteDisplayName: '01012345678',
      remoteUri: 'sip:01012345678@pbx.example.com',
    });
    expect(softphoneMediaControllerMocks.startRingtone).toHaveBeenCalled();
    softphoneMediaControllerMocks.stopRingtone.mockClear();

    softphoneClientMocks.getCallbacks()?.onCallState({
      id: 'invite-1',
      direction: 'outgoing',
      phase: 'active',
      remoteDisplayName: '01012345678',
      remoteUri: 'sip:01012345678@pbx.example.com',
    });
    softphoneClientMocks.getCallbacks()?.onCallState(null);

    expect(softphoneMediaControllerMocks.stopRingtone).toHaveBeenCalled();
  });

  it('PBX 발신 직후 들어온 상담원 INVITE 는 수신 알림 없이 발신 연결로 자동 응답한다', async () => {
    await useDesktopStore.getState().initialize();

    await useDesktopStore.getState().originate('01034623453', '07052346380');
    softphoneClientMocks.getCallbacks()?.onCallState({
      id: 'invite-outbound-leg',
      direction: 'incoming',
      phase: 'ringing',
      remoteDisplayName: '07052346380',
      remoteUri: 'sip:07052346380@pbx.example.com',
    });

    expect(useDesktopStore.getState().softphone?.session).toEqual({
      id: 'invite-outbound-leg',
      direction: 'outgoing',
      phase: 'establishing',
      remoteDisplayName: '01034623453',
      remoteUri: 'sip:07052346380@pbx.example.com',
    });
    expect(softphoneClientMocks.answer).toHaveBeenCalledWith({
      inputDeviceId: null,
      outputDeviceId: 'speaker-1',
      ringDeviceId: null,
      echoCancellation: true,
      noiseSuppression: true,
    });
    expect(desktopApi.notifyIncomingCall).not.toHaveBeenCalled();
    expect(desktopApi.focusWindow).not.toHaveBeenCalled();
    expect(desktopApi.recordDiagnosticEvent).toHaveBeenCalledWith({
      stage: 'store:originate-softphone-matched',
      detail: {
        callId: 'invite-outbound-leg',
        phoneNumber: '01034623453',
        callerId: '07052346380',
        remoteDisplayName: '07052346380',
        remoteUri: 'sip:07052346380@pbx.example.com',
      },
    });
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

  it('softphone 세션 중 음소거는 서버 mute 대신 SIP 로컬 마이크를 제어한다', async () => {
    await useDesktopStore.getState().initialize();

    softphoneClientMocks.getCallbacks()?.onCallState({
      id: 'invite-3',
      direction: 'outgoing',
      phase: 'active',
      remoteDisplayName: '01012345678',
      remoteUri: 'sip:01012345678@pbx.example.com',
    });

    await useDesktopStore.getState().mute();

    expect(softphoneClientMocks.setMuted).toHaveBeenCalledWith(true);
    expect(desktopApi.mute).not.toHaveBeenCalled();
    expect(useDesktopStore.getState().softphone?.localMuted).toBe(true);
  });

  it('softphone 세션 중 보류는 서버 hold 대신 SIP re-INVITE 를 요청한다', async () => {
    await useDesktopStore.getState().initialize();

    softphoneClientMocks.getCallbacks()?.onCallState({
      id: 'invite-4',
      direction: 'outgoing',
      phase: 'active',
      remoteDisplayName: '01012345678',
      remoteUri: 'sip:01012345678@pbx.example.com',
    });

    await useDesktopStore.getState().toggleHold();

    expect(softphoneClientMocks.setHeld).toHaveBeenCalledWith(true);
    expect(desktopApi.hold).not.toHaveBeenCalled();
    expect(useDesktopStore.getState().softphone?.localHold).toBe(true);
  });

  it('softphone 세션 중 hangup 은 서버 hangup 대신 SIP hangup 을 호출한다', async () => {
    await useDesktopStore.getState().initialize();

    softphoneClientMocks.getCallbacks()?.onCallState({
      id: 'invite-5',
      direction: 'outgoing',
      phase: 'active',
      remoteDisplayName: '01012345678',
      remoteUri: 'sip:01012345678@pbx.example.com',
    });

    await useDesktopStore.getState().hangup();

    expect(softphoneClientMocks.hangup).toHaveBeenCalled();
    expect(desktopApi.hangup).not.toHaveBeenCalled();
  });
});
