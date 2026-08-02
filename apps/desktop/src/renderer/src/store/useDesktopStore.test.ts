import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SipSoftphoneClient } from '../softphone/sip-softphone-client';
import { useDesktopStore } from './useDesktopStore';

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
  login: vi.fn().mockResolvedValue({
    session: {
      agent: {
        agentId: 'agent-login',
        agentName: '직접로그인',
        extension: '1001',
        role: 'agent',
      },
    },
    webHandoff: {
      handoffToken: 'web-handoff-1',
      expiresIn: 60,
      redirectPath: '/desktop-handoff',
      url: 'https://cti-center-a.example.com/desktop-handoff?token=web-handoff-1',
    },
  }),
  refreshSession: vi.fn().mockResolvedValue(null),
  connectWithProtocol: vi.fn().mockResolvedValue({
    agent: {
      agentId: 'agent-protocol',
      agentName: '프로토콜상담원',
      extension: '1001',
      role: 'agent',
    },
  }),
  connectRuntime: vi.fn().mockResolvedValue(undefined),
  getCallerIds: vi.fn().mockResolvedValue({
    callerIds: [],
    defaultCallerId: null,
  }),
  getCallCapabilities: vi.fn().mockResolvedValue({
    canOriginateExternal: false,
    canOriginateInternal: false,
    canUsePhoneDirect: false,
    outboundDialPermissions: {
      phoneDirect: false,
      phoneDirectAllowedIps: [],
      domestic: true,
      representative: true,
      paid: false,
      international: false,
    },
    outboundDialOptions: {
      allowedCallerIds: [],
      defaultCallerId: null,
    },
    disabledReasons: ['발신 권한을 조회하지 못했습니다.'],
  }),
  getAgentDirectory: vi.fn().mockResolvedValue([]),
  getCallHistory: vi.fn().mockResolvedValue([]),
  mute: vi.fn(),
  hangup: vi.fn(),
  pickup: vi.fn(),
  originate: vi.fn(),
  originateInternal: vi.fn(),
  transfer: vi.fn(),
  cancelAttendedTransfer: vi.fn(),
  completeAttendedTransfer: vi.fn(),
  changeAgentStatus: vi.fn().mockResolvedValue({ statusCode: 'BREAK' }),
  hold: vi.fn(),
  resume: vi.fn(),
  checkForUpdates: vi.fn().mockResolvedValue(null),
  prepareUpdate: vi.fn().mockResolvedValue(null),
  applyPreparedUpdate: vi.fn().mockResolvedValue(null),
  onEvent: vi.fn(() => () => undefined),
  notifyIncomingCall: vi.fn(),
  focusWindow: vi.fn(),
  openExternal: vi.fn().mockResolvedValue(undefined),
  recordDiagnosticEvent: vi.fn().mockResolvedValue(undefined),
  openCallHistoryPopup: vi.fn().mockResolvedValue(undefined),
  openAgentListPopup: vi.fn().mockResolvedValue(undefined),
};

vi.stubGlobal('window', { desktopApi });

const ENABLED_CALL_CAPABILITIES = {
  canOriginateExternal: true,
  canOriginateInternal: true,
  canUsePhoneDirect: false,
  outboundDialPermissions: {
    phoneDirect: false,
    phoneDirectAllowedIps: [],
    domestic: true,
    representative: true,
    paid: false,
    international: false,
  },
  outboundDialOptions: {
    allowedCallerIds: ['15777893'],
    defaultCallerId: '15777893',
  },
  disabledReasons: [],
};

describe('useDesktopStore pairing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    desktopApi.getConfig.mockResolvedValue(null);
    desktopApi.getSession.mockResolvedValue(null);
    desktopApi.refreshSession.mockResolvedValue(null);
    desktopApi.checkForUpdates.mockResolvedValue(null);
    desktopApi.getCallerIds.mockResolvedValue({
      callerIds: [],
      defaultCallerId: null,
    });
    desktopApi.getAgentDirectory.mockResolvedValue([]);
    desktopApi.login.mockResolvedValue({
      session: {
        agent: {
          agentId: 'agent-login',
          agentName: '직접로그인',
          extension: '1001',
          role: 'agent',
        },
      },
      webHandoff: {
        handoffToken: 'web-handoff-1',
        expiresIn: 60,
        redirectPath: '/desktop-handoff',
        url: 'https://cti-center-a.example.com/desktop-handoff?token=web-handoff-1',
      },
    });
    desktopApi.connectWithProtocol.mockResolvedValue({
      agent: {
        agentId: 'agent-protocol',
        agentName: '프로토콜상담원',
        extension: '1001',
        role: 'agent',
      },
    });
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
      audioDevices: {
        inputs: [],
        outputs: [],
      },
      audioCapabilities: {
        sinkSelectionSupported: false,
      },
      softphone: null,
      callerIds: [],
      defaultCallerId: null,
      agentDirectory: [],
      updateState: null,
      initialize: useDesktopStore.getState().initialize,
      login: useDesktopStore.getState().login,
      pair: useDesktopStore.getState().pair,
      connectWithProtocol: useDesktopStore.getState().connectWithProtocol,
      showPairingDiagnostics: useDesktopStore.getState().showPairingDiagnostics,
      showLogin: useDesktopStore.getState().showLogin,
      reconnectRuntime: useDesktopStore.getState().reconnectRuntime,
      originate: useDesktopStore.getState().originate,
      originateInternal: useDesktopStore.getState().originateInternal,
      openCallHistoryPopup: useDesktopStore.getState().openCallHistoryPopup,
      openAgentListPopup: useDesktopStore.getState().openAgentListPopup,
      pickup: useDesktopStore.getState().pickup,
      mute: useDesktopStore.getState().mute,
      hangup: useDesktopStore.getState().hangup,
      toggleHold: useDesktopStore.getState().toggleHold,
      transfer: useDesktopStore.getState().transfer,
      cancelAttendedTransfer: useDesktopStore.getState().cancelAttendedTransfer,
      completeAttendedTransfer: useDesktopStore.getState().completeAttendedTransfer,
      changeAgentStatus: useDesktopStore.getState().changeAgentStatus,
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
      runtimeConnection: 'idle',
      authView: 'login',
      loginPending: false,
    });
  });

  it('dismissUpdate hides the prepared update banner state', () => {
    useDesktopStore.setState({
      updateState: {
        message: '새 버전이 준비되어 있습니다.',
        mandatory: false,
        preparing: false,
      },
    });

    useDesktopStore.getState().dismissUpdate();

    expect(useDesktopStore.getState().updateState).toBeNull();
  });

  it('changeAgentStatus sends the selected status through the desktop runtime', async () => {
    useDesktopStore.setState({
      agent: {
        agentId: 'agent-login',
        agentName: '직접로그인',
        extension: '1001',
        role: 'agent',
      },
      agentStatus: 'AVAILABLE',
      runtimeConnection: 'connected',
    });

    await useDesktopStore.getState().changeAgentStatus('BREAK');

    expect(desktopApi.changeAgentStatus).toHaveBeenCalledWith('agent-login', 'BREAK', undefined);
    expect(useDesktopStore.getState().agentStatus).toBe('BREAK');
  });

  it('initialize 는 저장된 config 와 세션이 없으면 desktop login 경로로 진입한다', async () => {
    await useDesktopStore.getState().initialize();

    expect(useDesktopStore.getState().bootstrapped).toBe(true);
    expect(useDesktopStore.getState().authView).toBe('login');
    expect(useDesktopStore.getState().config).toBeNull();
    expect(useDesktopStore.getState().agent).toBeNull();
  });

  it('initialize 는 저장된 세션이 있으면 refreshSession 결과를 우선 사용한다', async () => {
    desktopApi.getConfig.mockResolvedValueOnce({
      serverUrl: 'https://cti-center-a.example.com',
      channel: 'stable',
      deviceId: 'device-1',
    });
    desktopApi.getSession.mockResolvedValueOnce({
      agent: {
        agentId: 'agent-stale',
        agentName: '이전상담원',
        extension: '1001',
        role: 'agent',
      },
    });
    desktopApi.refreshSession.mockResolvedValueOnce({
      agent: {
        agentId: 'agent-fresh',
        agentName: '갱신상담원',
        extension: '1001',
        role: 'agent',
      },
    });
    desktopApi.getCallCapabilities.mockResolvedValueOnce({
      ...ENABLED_CALL_CAPABILITIES,
      outboundDialOptions: {
        allowedCallerIds: ['15777893', '07052346380'],
        defaultCallerId: '15777893',
      },
    });
    desktopApi.getAgentDirectory.mockResolvedValueOnce([
      {
        agentId: 'agent-2',
        agentName: '상담원2',
        extension: '1002',
        role: 'agent',
        isActive: true,
        currentStatus: {
          statusCode: 'AVAILABLE',
        },
      },
    ]);

    await useDesktopStore.getState().initialize();

    expect(desktopApi.refreshSession).toHaveBeenCalled();
    expect(useDesktopStore.getState().agent?.agentId).toBe('agent-fresh');
    expect(desktopApi.connectRuntime).toHaveBeenCalled();
    expect(useDesktopStore.getState().callerIds).toEqual(['15777893', '07052346380']);
    expect(useDesktopStore.getState().defaultCallerId).toBe('15777893');
    expect(useDesktopStore.getState().agentDirectory[0]?.extension).toBe('1002');
    expect(useDesktopStore.getState().events[0]).toContain('저장된 세션을 갱신했습니다.');
  });

  it('initialize 는 refreshSession 이 실패하면 저장된 세션으로 fallback 한다', async () => {
    desktopApi.getConfig.mockResolvedValueOnce({
      serverUrl: 'https://cti-center-a.example.com',
      channel: 'stable',
      deviceId: 'device-1',
    });
    desktopApi.getSession.mockResolvedValueOnce({
      agent: {
        agentId: 'agent-fallback',
        agentName: '저장상담원',
        extension: '1001',
        role: 'agent',
      },
    });
    desktopApi.refreshSession.mockRejectedValueOnce(new Error('refresh failed'));

    await useDesktopStore.getState().initialize();

    expect(useDesktopStore.getState().agent?.agentId).toBe('agent-fallback');
    expect(desktopApi.connectRuntime).toHaveBeenCalled();
    expect(useDesktopStore.getState().events[0]).toContain('저장된 세션으로 시작합니다.');
  });

  it('initialize 는 저장된 세션의 runtime 연결이 실패해도 빈 화면에 멈추지 않고 로그인 화면으로 복귀한다', async () => {
    desktopApi.getConfig.mockResolvedValueOnce({
      serverUrl: 'https://cti-center-a.example.com',
      channel: 'stable',
      deviceId: 'device-1',
    });
    desktopApi.getSession.mockResolvedValueOnce({
      agent: {
        agentId: 'agent-stale',
        agentName: '이전상담원',
        extension: '1001',
        role: 'agent',
      },
    });
    desktopApi.refreshSession.mockResolvedValueOnce(null);
    desktopApi.connectRuntime.mockRejectedValueOnce(new Error('runtime connect failed'));

    await useDesktopStore.getState().initialize();

    expect(useDesktopStore.getState().bootstrapped).toBe(true);
    expect(useDesktopStore.getState().authView).toBe('login');
    expect(useDesktopStore.getState().agent).toBeNull();
    expect(useDesktopStore.getState().runtimeConnection).toBe('error');
    expect(useDesktopStore.getState().authError).toContain('runtime connect failed');
    expect(useDesktopStore.getState().events[0]).toContain('초기 세션 복구 실패');
  });

  it('initialize 는 초기 bootstrap 의존성 중 하나가 실패해도 로그인 화면을 표시한다', async () => {
    desktopApi.getAudioPreferences.mockRejectedValueOnce(new Error('audio preferences failed'));

    await useDesktopStore.getState().initialize();

    expect(useDesktopStore.getState().bootstrapped).toBe(true);
    expect(useDesktopStore.getState().authView).toBe('login');
    expect(useDesktopStore.getState().agent).toBeNull();
    expect(useDesktopStore.getState().authError).toContain('audio preferences failed');
    expect(useDesktopStore.getState().events[0]).toContain('초기 로딩 실패');
  });

  it('runtime connection 이벤트는 연결 상태와 이벤트 로그를 갱신한다', async () => {
    desktopApi.getConfig.mockResolvedValueOnce({
      serverUrl: 'https://cti-center-a.example.com',
      channel: 'stable',
      deviceId: 'device-1',
    });
    desktopApi.getSession.mockResolvedValueOnce({
      agent: {
        agentId: 'agent-1',
        agentName: '상담원1',
        extension: '1001',
        role: 'agent',
      },
    });
    desktopApi.onEvent.mockImplementationOnce((listener) => {
      listener({
        type: 'runtime.connection.changed',
        payload: {
          state: 'reconnecting',
          reason: 'attempt:2',
        },
      });
      return () => undefined;
    });

    await useDesktopStore.getState().initialize();

    expect(useDesktopStore.getState().runtimeConnection).toBe('reconnecting');
    expect(useDesktopStore.getState().events[0]).toContain('runtime reconnecting');
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

  it('login 은 저장된 boot 경로를 유지한 채 direct desktop session 으로 연결한다', async () => {
    desktopApi.getConfig.mockResolvedValueOnce({
      serverUrl: 'https://cti-center-a.example.com',
      channel: 'stable',
      deviceId: 'device-1',
    });

    await useDesktopStore.getState().initialize();
    await useDesktopStore.getState().login({
      serverUrl: 'https://cti-center-a.example.com',
      loginId: 'agent1001',
      extension: '1001',
      password: 'Password123!',
    });

    expect(desktopApi.login).toHaveBeenCalledWith({
      serverUrl: 'https://cti-center-a.example.com',
      loginId: 'agent1001',
      extension: '1001',
      password: 'Password123!',
      createWebHandoff: true,
      webBaseUrl: 'https://cti-center-a.example.com',
      redirectPath: '/desktop-handoff',
    });
    expect(useDesktopStore.getState().authView).toBe('login');
    expect(useDesktopStore.getState().agent?.agentId).toBe('agent-login');
    expect(useDesktopStore.getState().config?.serverUrl).toBe('https://cti-center-a.example.com');
    expect(desktopApi.connectRuntime).toHaveBeenCalled();
    expect(desktopApi.openExternal).toHaveBeenCalledWith(
      'https://cti-center-a.example.com/desktop-handoff?token=web-handoff-1',
    );
  });

  it('login 은 desktop bridge 가 없으면 원시 JS 예외 대신 안내 메시지를 표시한다', async () => {
    const originalDesktopApi = window.desktopApi;
    try {
      window.desktopApi = undefined as unknown as typeof window.desktopApi;

      await useDesktopStore.getState().login({
        serverUrl: 'https://cti-center-a.example.com',
        loginId: 'agent1001',
        extension: '1001',
        password: 'Password123!',
      });

      expect(useDesktopStore.getState().authError).toContain('데스크톱 브리지를 초기화하지 못했습니다');
      expect(useDesktopStore.getState().authError).not.toContain('Cannot read properties');
    } finally {
      window.desktopApi = originalDesktopApi;
    }
  });

  it('connectWithProtocol 은 pairing 으로 되돌리지 않고 auto connect 를 완료한다', async () => {
    await useDesktopStore.getState().initialize();
    await useDesktopStore.getState().connectWithProtocol({
      type: 'connect',
      serverUrl: 'https://cti-center-b.example.com',
      handoffToken: 'handoff-2',
      channel: 'stable',
    });

    expect(desktopApi.connectWithProtocol).toHaveBeenCalledWith({
      type: 'connect',
      serverUrl: 'https://cti-center-b.example.com',
      handoffToken: 'handoff-2',
      channel: 'stable',
    });
    expect(useDesktopStore.getState().authView).toBe('login');
    expect(useDesktopStore.getState().agent?.agentId).toBe('agent-protocol');
    expect(desktopApi.connectRuntime).toHaveBeenCalled();
  });

  it('reconnectRuntime 은 수동 재연결 요청 후 runtime 상태를 갱신한다', async () => {
    useDesktopStore.setState({
      bootstrapped: true,
      pairing: false,
      agent: {
        agentId: 'agent-1',
        agentName: '상담원1',
        extension: '1001',
        role: 'agent',
      },
      agentStatus: 'AVAILABLE',
      runtimeConnection: 'disconnected',
      config: {
        serverUrl: 'https://cti-center-a.example.com',
        channel: 'stable',
        deviceId: 'device-1',
      },
      activeCall: null,
      events: [],
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
      updateState: null,
    });
    desktopApi.onEvent.mockImplementationOnce((listener) => {
      listener({
        type: 'runtime.connection.changed',
        payload: {
          state: 'connected',
        },
      });
      return () => undefined;
    });

    await useDesktopStore.getState().reconnectRuntime();

    expect(desktopApi.connectRuntime).toHaveBeenCalled();
    expect(useDesktopStore.getState().runtimeConnection).toBe('connected');
    expect(useDesktopStore.getState().events[0]).toContain('runtime connected');
  });

  it('agent.status.changed 는 현재 상담원 이벤트만 자기 상태로 반영한다', async () => {
    useDesktopStore.setState({
      bootstrapped: true,
      pairing: false,
      agent: {
        agentId: 'agent-1',
        agentName: '상담원1',
        extension: '1001',
        role: 'agent',
      },
      agentStatus: 'AVAILABLE',
      runtimeConnection: 'disconnected',
      config: {
        serverUrl: 'https://cti-center-a.example.com',
        channel: 'stable',
        deviceId: 'device-1',
      },
      activeCall: null,
      events: [],
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
      updateState: null,
    });
    desktopApi.onEvent.mockImplementationOnce((listener) => {
      listener({
        type: 'agent.status.changed',
        payload: {
          agentId: 'agent-2',
          statusCode: 'BREAK',
        },
      });
      expect(useDesktopStore.getState().agentStatus).toBe('AVAILABLE');
      listener({
        type: 'agent.status.changed',
        payload: {
          agentId: 'agent-1',
          statusCode: 'TALKING',
        },
      });
      return () => undefined;
    });

    await useDesktopStore.getState().reconnectRuntime();

    expect(useDesktopStore.getState().agentStatus).toBe('TALKING');
  });

  it('toggleHold 는 hold/resume 요청 후 PBX 이벤트 전까지 통화 상태를 확정하지 않는다', async () => {
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
      callerIds: [],
      defaultCallerId: null,
      agentDirectory: [],
      updateState: null,
      initialize: useDesktopStore.getState().initialize,
      pair: useDesktopStore.getState().pair,
      originate: useDesktopStore.getState().originate,
      originateInternal: useDesktopStore.getState().originateInternal,
      openCallHistoryPopup: useDesktopStore.getState().openCallHistoryPopup,
      openAgentListPopup: useDesktopStore.getState().openAgentListPopup,
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

    await useDesktopStore.getState().toggleHold();
    expect(desktopApi.hold).toHaveBeenCalledWith('call-1');
    expect(useDesktopStore.getState().activeCall?.sessionStatus).toBe('TALKING');

    useDesktopStore.setState((state) => ({
      activeCall: state.activeCall
        ? {
            ...state.activeCall,
            sessionStatus: 'HOLD',
          }
        : state.activeCall,
    }));
    await useDesktopStore.getState().toggleHold();
    expect(desktopApi.resume).toHaveBeenCalledWith('call-1');
    expect(useDesktopStore.getState().activeCall?.sessionStatus).toBe('HOLD');
  });

  it('hangup 은 요청 후 PBX 종료 이벤트 전까지 activeCall 을 제거하지 않는다', async () => {
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
      updateState: null,
      hangup: useDesktopStore.getState().hangup,
    });

    await useDesktopStore.getState().hangup();

    expect(desktopApi.hangup).toHaveBeenCalledWith('call-1');
    expect(useDesktopStore.getState().activeCall?.callId).toBe('call-1');
    expect(useDesktopStore.getState().events[0]).toContain('종료 요청 call-1');
  });

  it('pickup 과 transfer 는 active call 기준으로 desktop api 를 호출한다', async () => {
    useDesktopStore.setState({
      bootstrapped: true,
      pairing: false,
      agent: {
        agentId: 'agent-1',
        agentName: '상담원1',
        extension: '1001',
        role: 'agent',
      },
      agentStatus: 'AVAILABLE',
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
        sessionStatus: 'QUEUED',
        startedAt: '2026-04-22T12:00:00.000Z',
      },
      events: [],
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
    });

    await useDesktopStore.getState().pickup();
    expect(desktopApi.pickup).toHaveBeenCalledWith('call-1');
    expect(useDesktopStore.getState().activeCall?.sessionStatus).toBe('RINGING_AGENT');

    await useDesktopStore.getState().transfer('1002', 'blind');
    expect(desktopApi.transfer).toHaveBeenCalledWith('call-1', {
      target: '1002',
      transferType: 'blind',
      fromExtension: '1001',
    });
    expect(useDesktopStore.getState().activeCall?.sessionStatus).toBe('TRANSFERRING');
  });

  it('originate 는 등록된 softphone 상태여도 PBX runtime 으로 외부 발신을 보낸다', async () => {
    const inviteSpy = vi
      .spyOn(SipSoftphoneClient.prototype, 'invite')
      .mockResolvedValue(undefined);

    useDesktopStore.setState({
      bootstrapped: true,
      pairing: false,
      agent: {
        agentId: 'agent-1',
        agentName: '상담원1',
        extension: '1001',
        role: 'agent',
      },
      agentStatus: 'AVAILABLE',
      config: {
        serverUrl: 'https://cti-center-a.example.com',
        channel: 'stable',
        deviceId: 'device-1',
      },
      activeCall: null,
      events: [],
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
      softphone: {
        registration: 'registered',
        transport: 'connected',
        config: {
          enabled: true,
          wsServer: 'wss://pbx.example.com/ws',
          sipUri: 'sip:1001@pbx.example.com',
          authorizationUsername: '1001',
          authorizationPassword: 'secret',
          displayName: '1001',
          iceServers: [],
        },
        lastError: null,
        diagnostics: [],
        session: null,
        remoteAudioActive: false,
        localMuted: false,
        localHold: false,
      },
      updateState: null,
      callCapabilities: ENABLED_CALL_CAPABILITIES,
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

    await useDesktopStore.getState().originate('01012345678', '15777893');

    expect(inviteSpy).not.toHaveBeenCalled();
    expect(desktopApi.originate).toHaveBeenCalledWith({
      phoneNumber: '01012345678',
      callerId: '15777893',
    });
    expect(useDesktopStore.getState().events[0]).toContain('PBX 외부 발신 01012345678');
    inviteSpy.mockRestore();
  });

  it('originate 는 softphone 미등록 상태에서 PBX runtime 으로 외부 발신을 보낸다', async () => {
    const inviteSpy = vi
      .spyOn(SipSoftphoneClient.prototype, 'invite')
      .mockResolvedValue(undefined);

    useDesktopStore.setState({
      bootstrapped: true,
      pairing: false,
      agent: {
        agentId: 'agent-1',
        agentName: '상담원1',
        extension: '1001',
        role: 'agent',
      },
      agentStatus: 'AVAILABLE',
      config: {
        serverUrl: 'https://cti-center-a.example.com',
        channel: 'stable',
        deviceId: 'device-1',
      },
      activeCall: null,
      audioPreferences: null,
      softphone: {
        registration: 'error',
        transport: 'error',
        config: {
          enabled: true,
          wsServer: 'wss://pbx.example.com/ws',
          sipUri: 'sip:1001@pbx.example.com',
          authorizationUsername: '1001',
          authorizationPassword: 'secret',
          displayName: '1001',
          iceServers: [],
        },
        lastError: 'registration failed',
        diagnostics: [],
        session: null,
        remoteAudioActive: false,
        localMuted: false,
        localHold: false,
      },
      defaultCallerId: '15777893',
      callCapabilities: ENABLED_CALL_CAPABILITIES,
      events: [],
      runtimeConnection: 'connected',
      originate: useDesktopStore.getState().originate,
    });

    await useDesktopStore.getState().originate(' 01012345678 ');

    expect(inviteSpy).not.toHaveBeenCalled();
    expect(desktopApi.originate).toHaveBeenCalledWith({
      phoneNumber: '01012345678',
      callerId: '15777893',
    });
    expect(useDesktopStore.getState().events[0]).toContain('PBX 외부 발신 01012345678');
    inviteSpy.mockRestore();
  });

  it('originate 는 빈 발신번호 선택값을 PBX runtime 으로 넘기지 않는다', async () => {
    useDesktopStore.setState({
      bootstrapped: true,
      pairing: false,
      agent: {
        agentId: 'agent-1',
        agentName: '상담원1',
        extension: '1001',
        role: 'agent',
      },
      agentStatus: 'AVAILABLE',
      config: {
        serverUrl: 'https://cti-center-a.example.com',
        channel: 'stable',
        deviceId: 'device-1',
      },
      activeCall: null,
      audioPreferences: null,
      softphone: null,
      defaultCallerId: null,
      callCapabilities: ENABLED_CALL_CAPABILITIES,
      events: [],
      runtimeConnection: 'connected',
      originate: useDesktopStore.getState().originate,
    });

    await useDesktopStore.getState().originate('01012345678', '');

    expect(desktopApi.originate).toHaveBeenCalledWith({
      phoneNumber: '01012345678',
      callerId: undefined,
    });
  });

  it('originateInternal 은 등록된 softphone 상태여도 PBX runtime 으로 내선 발신을 보낸다', async () => {
    const inviteSpy = vi
      .spyOn(SipSoftphoneClient.prototype, 'invite')
      .mockResolvedValue(undefined);

    useDesktopStore.setState({
      bootstrapped: true,
      pairing: false,
      agent: {
        agentId: 'agent-1',
        agentName: '상담원1',
        extension: '1001',
        role: 'agent',
      },
      agentStatus: 'AVAILABLE',
      config: {
        serverUrl: 'https://cti-center-a.example.com',
        channel: 'stable',
        deviceId: 'device-1',
      },
      activeCall: null,
      audioPreferences: null,
      softphone: {
        registration: 'registered',
        transport: 'connected',
        config: {
          enabled: true,
          wsServer: 'wss://pbx.example.com/ws',
          sipUri: 'sip:1001@pbx.example.com',
          authorizationUsername: '1001',
          authorizationPassword: 'secret',
          displayName: '1001',
          iceServers: [],
        },
        lastError: null,
        diagnostics: [],
        session: null,
        remoteAudioActive: false,
        localMuted: false,
        localHold: false,
      },
      events: [],
      runtimeConnection: 'connected',
      originateInternal: useDesktopStore.getState().originateInternal,
    });

    await useDesktopStore.getState().originateInternal({
      agentId: 'agent-2',
      agentName: '상담원2',
      extension: '1002',
      role: 'agent',
      isActive: true,
      currentStatus: {
        statusCode: 'AVAILABLE',
      },
    });

    expect(inviteSpy).not.toHaveBeenCalled();
    expect(desktopApi.originateInternal).toHaveBeenCalledWith({
      targetAgentId: 'agent-2',
      targetExtension: '1002',
    });
    expect(useDesktopStore.getState().events[0]).toContain('PBX 내선 발신 상담원2 1002');
    inviteSpy.mockRestore();
  });

  it('originateInternal 은 softphone 미등록 상태에서 PBX runtime 으로 내선 발신을 보낸다', async () => {
    const inviteSpy = vi
      .spyOn(SipSoftphoneClient.prototype, 'invite')
      .mockResolvedValue(undefined);

    useDesktopStore.setState({
      bootstrapped: true,
      pairing: false,
      agent: {
        agentId: 'agent-1',
        agentName: '상담원1',
        extension: '1001',
        role: 'agent',
      },
      agentStatus: 'AVAILABLE',
      config: {
        serverUrl: 'https://cti-center-a.example.com',
        channel: 'stable',
        deviceId: 'device-1',
      },
      activeCall: null,
      audioPreferences: null,
      softphone: null,
      events: [],
      runtimeConnection: 'connected',
      originateInternal: useDesktopStore.getState().originateInternal,
    });

    await useDesktopStore.getState().originateInternal({
      agentId: 'agent-2',
      agentName: '상담원2',
      extension: '1002',
      role: 'agent',
      isActive: true,
      currentStatus: {
        statusCode: 'AVAILABLE',
      },
    });

    expect(inviteSpy).not.toHaveBeenCalled();
    expect(desktopApi.originateInternal).toHaveBeenCalledWith({
      targetAgentId: 'agent-2',
      targetExtension: '1002',
    });
    expect(useDesktopStore.getState().events[0]).toContain('PBX 내선 발신 상담원2 1002');
    inviteSpy.mockRestore();
  });

  it('attended transfer cancel/complete 는 latestTransfer 상태를 갱신한다', async () => {
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
        sessionStatus: 'TRANSFERRING',
        startedAt: '2026-04-22T12:00:00.000Z',
        answeredAt: '2026-04-22T12:00:05.000Z',
        latestTransfer: {
          phase: 'REQUESTED',
          toExtension: '1002',
          requestedAt: '2026-04-22T12:01:00.000Z',
          completedAt: null,
          expiredAt: null,
        },
      },
      events: [],
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
    });

    await useDesktopStore.getState().completeAttendedTransfer();
    expect(desktopApi.completeAttendedTransfer).toHaveBeenCalledWith('call-1');
    expect(useDesktopStore.getState().activeCall?.latestTransfer?.phase).toBe('REBRIDGING');

    await useDesktopStore.getState().cancelAttendedTransfer();
    expect(desktopApi.cancelAttendedTransfer).toHaveBeenCalledWith('call-1');
    expect(useDesktopStore.getState().activeCall?.latestTransfer).toBeNull();
  });

  it('announcement.pushed 는 배너에 추가하고 같은 id 갱신은 dedupe 한다', async () => {
    desktopApi.getConfig.mockResolvedValueOnce({
      serverUrl: 'https://cti-center-a.example.com',
      channel: 'stable',
      deviceId: 'device-1',
    });
    desktopApi.getSession.mockResolvedValueOnce({
      agent: {
        agentId: 'agent-1',
        agentName: '상담원1',
        extension: '1001',
        role: 'agent',
      },
    });
    desktopApi.onEvent.mockImplementationOnce((listener) => {
      listener({
        type: 'announcement.pushed',
        payload: {
          action: 'created',
          announcementId: 'a-1',
          title: '점검 안내',
          body: '23시 정기 점검',
          authorName: '운영팀',
          pinned: true,
        },
      });
      listener({
        type: 'announcement.pushed',
        payload: {
          action: 'updated',
          announcementId: 'a-1',
          title: '점검 안내(연기)',
          body: '24시로 변경',
          authorName: '운영팀',
          pinned: true,
        },
      });
      listener({
        type: 'announcement.pushed',
        payload: {
          action: 'created',
          announcementId: 'a-2',
          title: '교육 일정',
          body: '내일 10시',
          pinned: false,
        },
      });
      return () => undefined;
    });

    await useDesktopStore.getState().initialize();

    const state = useDesktopStore.getState();
    expect(state.announcements).toHaveLength(2);
    expect(state.announcements[0].announcementId).toBe('a-2');
    expect(state.announcements[1].announcementId).toBe('a-1');
    expect(state.announcements[1].title).toBe('점검 안내(연기)');

    useDesktopStore.getState().dismissAnnouncement('a-1');
    expect(useDesktopStore.getState().announcements.map((it) => it.announcementId)).toEqual(['a-2']);
  });

  it('queue.summary.updated 는 큐 요약을 저장하고 대기 증가 시 flashAt 을 갱신한다', async () => {
    const dateSpy = vi.spyOn(Date.prototype, 'toISOString');
    let counter = 0;
    dateSpy.mockImplementation(() => {
      counter += 1;
      return `2026-05-08T00:00:${String(counter).padStart(2, '0')}.000Z`;
    });

    try {
      desktopApi.getConfig.mockResolvedValueOnce({
        serverUrl: 'https://cti-center-a.example.com',
        channel: 'stable',
        deviceId: 'device-1',
      });
      desktopApi.getSession.mockResolvedValueOnce({
        agent: {
          agentId: 'agent-1',
          agentName: '상담원1',
          extension: '1001',
          role: 'agent',
        },
      });
      desktopApi.onEvent.mockImplementationOnce((listener) => {
        listener({
          type: 'queue.summary.updated',
          payload: [
            {
              queueId: 'q-1',
              queueName: '대표',
              waitingCount: 1,
              talkingCount: 0,
              availableAgents: 2,
              longestWaitSeconds: 12,
            },
          ],
        });
        return () => undefined;
      });

      await useDesktopStore.getState().initialize();

      const after1 = useDesktopStore.getState();
      expect(after1.queueSummary).toHaveLength(1);
      expect(after1.queueSummary[0]?.waitingCount).toBe(1);
      expect(after1.queueArrivalFlashAt).not.toBeNull();
      const firstFlashAt = after1.queueArrivalFlashAt;

      desktopApi.onEvent.mockImplementationOnce((listener) => {
        listener({
          type: 'queue.summary.updated',
          payload: [
            {
              queueId: 'q-1',
              queueName: '대표',
              waitingCount: 0,
              talkingCount: 1,
              availableAgents: 2,
              longestWaitSeconds: 0,
            },
          ],
        });
        return () => undefined;
      });
      await useDesktopStore.getState().reconnectRuntime();
      const after2 = useDesktopStore.getState();
      expect(after2.queueSummary[0]?.waitingCount).toBe(0);
      expect(after2.queueArrivalFlashAt).toBe(firstFlashAt);

      desktopApi.onEvent.mockImplementationOnce((listener) => {
        listener({
          type: 'queue.summary.updated',
          payload: [
            {
              queueId: 'q-1',
              queueName: '대표',
              waitingCount: 2,
              talkingCount: 1,
              availableAgents: 2,
              longestWaitSeconds: 8,
            },
          ],
        });
        return () => undefined;
      });
      await useDesktopStore.getState().reconnectRuntime();
      const after3 = useDesktopStore.getState();
      expect(after3.queueSummary[0]?.waitingCount).toBe(2);
      expect(after3.queueArrivalFlashAt).not.toBe(firstFlashAt);
      expect(after3.queueArrivalFlashAt).not.toBeNull();
    } finally {
      dateSpy.mockRestore();
    }
  });
});
