import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDesktopStore } from './useDesktopStore';

const enumerateDevices = vi.fn(async () => [
  {
    deviceId: 'mic-1',
    kind: 'audioinput',
    label: 'USB Headset Mic',
    groupId: 'group-1',
    toJSON: () => ({}),
  },
  {
    deviceId: 'speaker-1',
    kind: 'audiooutput',
    label: 'USB Headset Speaker',
    groupId: 'group-1',
    toJSON: () => ({}),
  },
]);

const getUserMedia = vi.fn(async () => ({
  getTracks: () => [
    {
      stop: vi.fn(),
    },
  ],
}));

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
}

const desktopApi = {
  getConfig: vi.fn().mockResolvedValue(null),
  getAudioPreferences: vi.fn().mockResolvedValue({
    inputDeviceId: null,
    outputDeviceId: null,
    ringDeviceId: null,
    echoCancellation: true,
    noiseSuppression: true,
  }),
  saveAudioPreferences: vi.fn(async (input) => input),
  getSession: vi.fn().mockResolvedValue(null),
  saveConfig: vi.fn(),
  exchangeHandoff: vi.fn(),
  refreshSession: vi.fn(),
  connectRuntime: vi.fn(),
  mute: vi.fn(),
  hangup: vi.fn(),
  pickup: vi.fn(),
  originate: vi.fn(),
  transfer: vi.fn(),
  cancelAttendedTransfer: vi.fn(),
  completeAttendedTransfer: vi.fn(),
  hold: vi.fn(),
  resume: vi.fn(),
  checkForUpdates: vi.fn(),
  prepareUpdate: vi.fn(),
  applyPreparedUpdate: vi.fn(),
  onEvent: vi.fn(() => () => undefined),
};

vi.stubGlobal('window', { desktopApi });
vi.stubGlobal('navigator', {
  mediaDevices: {
    enumerateDevices,
    getUserMedia,
  },
});
vi.stubGlobal('Audio', FakeAudio);

function resetStore() {
  useDesktopStore.setState({
    bootstrapped: false,
    pairing: false,
    agent: null,
    agentStatus: null,
    config: null,
    activeCall: null,
    events: [],
    updateState: null,
    audioPermission: 'unknown',
    refreshingAudioDevices: false,
    audioPreferences: null,
    audioDevices: {
      inputs: [],
      outputs: [],
    },
    audioCapabilities: {
      sinkSelectionSupported: false,
    },
    softphone: null,
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
  });
}

describe('useDesktopStore audio settings', () => {
  beforeEach(() => {
    enumerateDevices.mockClear();
    getUserMedia.mockClear();
    desktopApi.getAudioPreferences.mockClear();
    desktopApi.saveAudioPreferences.mockClear();
    resetStore();
  });

  it('initialize 는 저장된 오디오 설정과 장치 목록을 함께 불러온다', async () => {
    await useDesktopStore.getState().initialize();

    const state = useDesktopStore.getState();
    expect(desktopApi.getAudioPreferences).toHaveBeenCalled();
    expect(state.audioPreferences?.echoCancellation).toBe(true);
    expect(state.audioDevices.inputs).toHaveLength(1);
    expect(state.audioDevices.outputs).toHaveLength(1);
  });

  it('requestAudioPermission 은 권한 요청 뒤 장치 목록을 새로 고친다', async () => {
    await useDesktopStore.getState().requestAudioPermission();

    expect(getUserMedia).toHaveBeenCalledWith({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
      },
    });
    expect(useDesktopStore.getState().audioPermission).toBe('granted');
    expect(useDesktopStore.getState().audioDevices.inputs[0]?.deviceId).toBe('mic-1');
  });

  it('updateAudioPreferences 는 선택값을 저장하고 상태를 갱신한다', async () => {
    await useDesktopStore.getState().initialize();

    await useDesktopStore.getState().updateAudioPreferences({
      inputDeviceId: 'mic-1',
      outputDeviceId: 'speaker-1',
      ringDeviceId: 'speaker-1',
      echoCancellation: false,
      noiseSuppression: false,
    });

    expect(desktopApi.saveAudioPreferences).toHaveBeenCalledWith({
      inputDeviceId: 'mic-1',
      outputDeviceId: 'speaker-1',
      ringDeviceId: 'speaker-1',
      echoCancellation: false,
      noiseSuppression: false,
    });
    expect(useDesktopStore.getState().audioPreferences).toEqual({
      inputDeviceId: 'mic-1',
      outputDeviceId: 'speaker-1',
      ringDeviceId: 'speaker-1',
      echoCancellation: false,
      noiseSuppression: false,
    });
  });

  it('선택한 입력 장치는 이후 권한 요청 시 exact deviceId 로 전달된다', async () => {
    await useDesktopStore.getState().initialize();
    await useDesktopStore.getState().updateAudioPreferences({
      inputDeviceId: 'mic-1',
      outputDeviceId: null,
      ringDeviceId: null,
      echoCancellation: true,
      noiseSuppression: true,
    });
    getUserMedia.mockClear();

    await useDesktopStore.getState().requestAudioPermission();

    expect(getUserMedia).toHaveBeenCalledWith({
      audio: {
        deviceId: { exact: 'mic-1' },
        echoCancellation: true,
        noiseSuppression: true,
      },
    });
  });
});
