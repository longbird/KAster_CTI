import { create } from 'zustand';
import type { ActiveCall, AgentStatusCode, CtiEvent } from '../../../shared/cti';
import type {
  DesktopAgentDirectoryItem,
  DesktopAgentProfile,
  DesktopAudioPreferences,
  DesktopCallerIdConfig,
  DesktopConfig,
  DesktopProtocolConnectPayload,
  DesktopSessionSummary,
} from '../../../shared/ipc';
import { normalizeCenterConfig } from '../../../shared/center-config';
import { AudioDeviceController } from '../audio/audio-device-controller';
import { WEB_BASE_URL } from '../config';
import {
  createSoftphoneState,
  type SoftphoneDiagnostic,
  type SoftphoneState,
} from '../softphone/softphone-runtime';
import { SoftphoneMediaController } from '../softphone/softphone-media-controller';
import { SipSoftphoneClient } from '../softphone/sip-softphone-client';

type AudioPermissionState = 'unknown' | 'granted' | 'denied' | 'unsupported';

interface AudioDeviceOption {
  deviceId: string;
  label: string;
}

interface AudioDeviceCatalog {
  inputs: AudioDeviceOption[];
  outputs: AudioDeviceOption[];
}

interface AudioCapabilities {
  sinkSelectionSupported: boolean;
}

interface PairParams {
  serverUrl: string;
  channel?: string;
  handoffToken: string;
}

interface LoginParams {
  serverUrl: string;
  loginId: string;
  extension: string;
  password: string;
}

type AuthView = 'login' | 'pairing';

interface DesktopStore {
  bootstrapped: boolean;
  pairing: boolean;
  authView: AuthView;
  loginPending: boolean;
  authError: string | null;
  agent: DesktopAgentProfile | null;
  agentStatus: AgentStatusCode | null;
  runtimeConnection: 'idle' | 'connected' | 'reconnecting' | 'disconnected' | 'error';
  config: DesktopConfig | null;
  activeCall: ActiveCall | null;
  events: string[];
  audioPermission: AudioPermissionState;
  refreshingAudioDevices: boolean;
  audioPreferences: DesktopAudioPreferences | null;
  audioDevices: AudioDeviceCatalog;
  audioCapabilities: AudioCapabilities;
  softphone: SoftphoneState | null;
  callerIds: string[];
  defaultCallerId: string | null;
  agentDirectory: DesktopAgentDirectoryItem[];
  updateState: {
    message: string;
    mandatory: boolean;
    preparing: boolean;
    preparedFileName?: string | null;
    preparedFilePath?: string | null;
    verified?: boolean;
    applying?: boolean;
  } | null;
  initialize(): Promise<void>;
  login(params: LoginParams): Promise<void>;
  pair(params: PairParams): Promise<void>;
  connectWithProtocol(payload: DesktopProtocolConnectPayload): Promise<void>;
  showPairingDiagnostics(): void;
  showLogin(): void;
  reconnectRuntime(): Promise<void>;
  changeAgentStatus(statusCode: AgentStatusCode): Promise<void>;
  originate(phoneNumber: string, callerId?: string): Promise<void>;
  originateInternal(target: DesktopAgentDirectoryItem): Promise<void>;
  openCallHistoryPopup(): Promise<void>;
  openAgentListPopup(): Promise<void>;
  pickup(): Promise<void>;
  mute(): Promise<void>;
  hangup(): Promise<void>;
  toggleHold(): Promise<void>;
  transfer(target: string, mode: 'blind' | 'attended'): Promise<void>;
  cancelAttendedTransfer(): Promise<void>;
  completeAttendedTransfer(): Promise<void>;
  checkForUpdates(): Promise<void>;
  dismissUpdate(): void;
  prepareUpdate(): Promise<void>;
  applyPreparedUpdate(): Promise<void>;
  refreshAudioDevices(): Promise<void>;
  requestAudioPermission(): Promise<void>;
  updateAudioPreferences(input: DesktopAudioPreferences): Promise<void>;
  playOutputPreview(): Promise<void>;
  playRingPreview(): Promise<void>;
  startSoftphone(): Promise<void>;
  stopSoftphone(): Promise<void>;
  answerSoftphoneCall(): Promise<void>;
  rejectSoftphoneCall(): Promise<void>;
  hangupSoftphoneCall(): Promise<void>;
}

let detachRuntimeListener: (() => void) | null = null;
let audioController: AudioDeviceController | null = null;
let softphoneMediaController: SoftphoneMediaController | null = null;
let softphoneClient: SipSoftphoneClient | null = null;
let lastIncomingAttentionCallId: string | null = null;
const EMPTY_AUDIO_DEVICES: AudioDeviceCatalog = {
  inputs: [],
  outputs: [],
};
const DEFAULT_AUDIO_PREFERENCES: DesktopAudioPreferences = {
  inputDeviceId: null,
  outputDeviceId: null,
  ringDeviceId: null,
  echoCancellation: true,
  noiseSuppression: true,
};
const DEFAULT_AUDIO_CAPABILITIES: AudioCapabilities = {
  sinkSelectionSupported: false,
};
const EMPTY_CALLER_ID_CONFIG: DesktopCallerIdConfig = {
  callerIds: [],
  defaultCallerId: null,
};

function getMediaDevices() {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
    return null;
  }

  return navigator.mediaDevices;
}

async function enumerateAudioDevices(): Promise<AudioDeviceCatalog> {
  const mediaDevices = getMediaDevices();
  if (!mediaDevices?.enumerateDevices) {
    return EMPTY_AUDIO_DEVICES;
  }

  const devices = await mediaDevices.enumerateDevices();
  const inputs = devices
    .filter((device) => device.kind === 'audioinput')
    .map((device, index) => ({
      deviceId: device.deviceId,
      label: device.label || `입력 장치 ${index + 1}`,
    }));
  const outputs = devices
    .filter((device) => device.kind === 'audiooutput')
    .map((device, index) => ({
      deviceId: device.deviceId,
      label: device.label || `출력 장치 ${index + 1}`,
    }));

  return { inputs, outputs };
}

function getAudioController() {
  if (audioController) {
    return audioController;
  }

  const mediaDevices = getMediaDevices();
  if (!mediaDevices || typeof Audio === 'undefined') {
    return null;
  }

  audioController = new AudioDeviceController({
    mediaDevices,
    createAudioElement: () => new Audio(),
  });
  return audioController;
}

function getSoftphoneClient() {
  if (softphoneClient) {
    return softphoneClient;
  }

  softphoneClient = new SipSoftphoneClient({
    onTransportState: (state) => {
      useDesktopStore.setState((current) => ({
        softphone: current.softphone
          ? {
              ...current.softphone,
              transport: state,
            }
          : current.softphone,
      }));
    },
    onRegistrationState: (state) => {
      useDesktopStore.setState((current) => ({
        softphone: current.softphone
          ? {
              ...current.softphone,
              registration: state,
            }
          : current.softphone,
      }));
    },
    onCallState: (call) => {
      if (call?.phase === 'ringing') {
        void getSoftphoneMediaController()?.startRingtone();
        if (call.direction === 'incoming' && call.id !== lastIncomingAttentionCallId) {
          lastIncomingAttentionCallId = call.id;
          const desktopApi = getDesktopApi();
          void desktopApi.notifyIncomingCall({
            title: '착신 전화',
            body: call.remoteUri
              ? `${call.remoteDisplayName} / ${call.remoteUri}`
              : call.remoteDisplayName,
          });
          void desktopApi.focusWindow();
        }
      } else {
        getSoftphoneMediaController()?.stopRingtone();
        lastIncomingAttentionCallId = null;
      }

      useDesktopStore.setState((current) => ({
        softphone: current.softphone
          ? {
              ...current.softphone,
              session: call,
              remoteAudioActive: call ? current.softphone.remoteAudioActive : false,
            }
          : current.softphone,
        events: call
          ? pushEvent(current.events, `softphone ${call.phase} ${call.remoteDisplayName}`)
          : pushEvent(current.events, 'softphone 세션 종료'),
      }));
    },
    onRemoteStream: (stream) => {
      void (async () => {
        const mediaController = getSoftphoneMediaController();
        const outputDeviceId = useDesktopStore.getState().audioPreferences?.outputDeviceId;
        if (!stream) {
          mediaController?.detachRemoteStream();
          useDesktopStore.setState((current) => ({
            softphone: current.softphone
              ? {
                  ...current.softphone,
                  remoteAudioActive: false,
                }
              : current.softphone,
          }));
          return;
        }

        if (mediaController) {
          await mediaController.applyOutputDevice(outputDeviceId);
          await mediaController.attachRemoteStream(stream);
        }

        useDesktopStore.setState((current) => ({
          softphone: current.softphone
            ? {
                ...current.softphone,
                remoteAudioActive: true,
              }
            : current.softphone,
          events: pushEvent(current.events, 'softphone 원격 오디오 연결'),
        }));
      })();
    },
    onError: (message) => {
      useDesktopStore.setState((current) => ({
        softphone: current.softphone
          ? {
              ...current.softphone,
              registration: 'error',
              transport: current.softphone.transport === 'not-configured' ? 'error' : current.softphone.transport,
              lastError: message,
            }
          : current.softphone,
        events: pushEvent(current.events, `softphone 오류 ${message}`),
      }));
    },
    onDiagnostic: (diagnostic) => {
      useDesktopStore.setState((current) => ({
        softphone: current.softphone
          ? {
              ...current.softphone,
              diagnostics: pushSoftphoneDiagnostic(current.softphone.diagnostics, diagnostic),
            }
          : current.softphone,
        events: pushEvent(current.events, `softphone 진단 ${diagnostic.code} / ${diagnostic.message}`),
      }));
    },
  });

  return softphoneClient;
}

function getSoftphoneMediaController() {
  if (softphoneMediaController) {
    return softphoneMediaController;
  }

  if (typeof Audio === 'undefined') {
    return null;
  }

  softphoneMediaController = new SoftphoneMediaController({
    createAudioElement: () => new Audio(),
  });

  return softphoneMediaController;
}

function pushEvent(current: string[], message: string) {
  return [message, ...current].slice(0, 30);
}

function appendEvents(current: string[], messages: string[]) {
  return [...current, ...messages].slice(0, 30);
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return '로그인에 실패했습니다.';
}

function getDesktopApi() {
  const api = typeof window !== 'undefined' ? window.desktopApi : undefined;
  if (!api) {
    throw new Error(
      '데스크톱 브리지를 초기화하지 못했습니다. KAster Agent Desktop 앱에서 다시 실행해 주세요.',
    );
  }

  return api;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(timeoutMessage));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

async function safeBootstrapLoad<T>(
  loader: () => Promise<T>,
  fallback: T,
  label: string,
): Promise<{ value: T; error: string | null }> {
  try {
    return {
      value: await withTimeout(loader(), 1500, `${label} timed out`),
      error: null,
    };
  } catch (error) {
    return {
      value: fallback,
      error: toErrorMessage(error),
    };
  }
}

function pushSoftphoneDiagnostic(
  current: SoftphoneDiagnostic[],
  diagnostic: Omit<SoftphoneDiagnostic, 'occurredAt'>,
) {
  return [
    {
      ...diagnostic,
      occurredAt: new Date().toISOString(),
    },
    ...current,
  ].slice(0, 5);
}

function getUpdateBlockReason(state: Pick<DesktopStore, 'activeCall' | 'softphone' | 'runtimeConnection'>) {
  if (state.activeCall && state.activeCall.sessionStatus !== 'ENDED') {
    return '진행 중인 CTI 통화가 있습니다.';
  }

  if (state.softphone?.session) {
    return '진행 중인 softphone 세션이 있습니다.';
  }

  if (state.runtimeConnection === 'reconnecting') {
    return 'runtime 재연결이 끝난 뒤에 적용할 수 있습니다.';
  }

  return null;
}

function resolveRuntimeConnection(
  hasSession: boolean,
  currentRuntimeConnection: DesktopStore['runtimeConnection'],
): DesktopStore['runtimeConnection'] {
  if (!hasSession) {
    return 'idle';
  }

  return currentRuntimeConnection === 'idle' ? 'connected' : currentRuntimeConnection;
}

function reduceEvent(
  event: CtiEvent,
  currentCall: ActiveCall | null,
  currentEvents: string[],
  currentAgentStatus: AgentStatusCode | null,
  currentRuntimeConnection: DesktopStore['runtimeConnection'],
  currentAgentId?: string | null,
): Pick<DesktopStore, 'activeCall' | 'events' | 'agentStatus' | 'runtimeConnection'> {
  switch (event.type) {
    case 'call.created':
      return {
        activeCall: event.payload,
        agentStatus: currentAgentStatus,
        runtimeConnection: currentRuntimeConnection,
        events: pushEvent(currentEvents, `신규 콜 ${event.payload.ani} / ${event.payload.sessionStatus}`),
      };
    case 'call.updated':
      return {
        activeCall: event.payload,
        agentStatus: currentAgentStatus,
        runtimeConnection: currentRuntimeConnection,
        events: pushEvent(currentEvents, `콜 상태 변경 ${event.payload.ani} / ${event.payload.sessionStatus}`),
      };
    case 'call.ended':
      return {
        activeCall: currentCall?.callId === event.payload.callId ? null : currentCall,
        agentStatus: currentAgentStatus,
        runtimeConnection: currentRuntimeConnection,
        events: pushEvent(currentEvents, `콜 종료 ${event.payload.callId}`),
      };
    case 'screenpop.customer':
      return {
        activeCall: currentCall?.callId === event.payload.callId
          ? {
              ...currentCall,
              customer: event.payload.customer,
            }
          : currentCall,
        agentStatus: currentAgentStatus,
        runtimeConnection: currentRuntimeConnection,
        events: pushEvent(currentEvents, `고객 팝업 ${event.payload.customer.customerName}`),
      };
    case 'agent.status.changed':
      return {
        activeCall: currentCall,
        agentStatus: !currentAgentId || currentAgentId === event.payload.agentId
          ? event.payload.statusCode
          : currentAgentStatus,
        runtimeConnection: currentRuntimeConnection,
        events: pushEvent(currentEvents, `상태 변경 ${event.payload.agentId} / ${event.payload.statusCode}`),
      };
    case 'queue.summary.updated':
      return {
        activeCall: currentCall,
        agentStatus: currentAgentStatus,
        runtimeConnection: currentRuntimeConnection,
        events: pushEvent(currentEvents, `큐 요약 갱신 ${event.payload.length}건`),
      };
    case 'runtime.connection.changed':
      return {
        activeCall: currentCall,
        agentStatus: currentAgentStatus,
        runtimeConnection: event.payload.state,
        events: pushEvent(
          currentEvents,
          `runtime ${event.payload.state}${event.payload.reason ? ` / ${event.payload.reason}` : ''}`,
        ),
      };
  }
}

function bindRuntimeEvents(
  setState: (
    partial:
      | Partial<DesktopStore>
      | ((state: DesktopStore) => Partial<DesktopStore>),
  ) => void,
) {
  detachRuntimeListener?.();
  detachRuntimeListener = getDesktopApi().onEvent((event) => {
    setState((state) => reduceEvent(
      event,
      state.activeCall,
      state.events,
      state.agentStatus,
      state.runtimeConnection,
      state.agent?.agentId,
    ));
  });
}

async function hydrateAuthenticatedDesktopSession(
  set: (
    partial:
      | Partial<DesktopStore>
      | ((state: DesktopStore) => Partial<DesktopStore>),
  ) => void,
  input: {
    session: DesktopSessionSummary;
    config: DesktopConfig;
    eventMessage: string;
  },
) {
  bindRuntimeEvents(set);
  const desktopApi = getDesktopApi();
  await desktopApi.connectRuntime();
  const [audioPreferences, update, callerIdConfig, agentDirectory] = await Promise.all([
    desktopApi.getAudioPreferences(),
    desktopApi.checkForUpdates(),
    desktopApi.getCallerIds().catch(() => EMPTY_CALLER_ID_CONFIG),
    desktopApi.getAgentDirectory().catch(() => []),
  ]);
  const controller = getAudioController();
  if (controller) {
    await controller.applyPreferences(audioPreferences);
  }
  await getSoftphoneMediaController()?.applyOutputDevice(audioPreferences.outputDeviceId);
  await getSoftphoneMediaController()?.applyRingDevice(audioPreferences.ringDeviceId);
  const audioDevices = await enumerateAudioDevices();
  const softphone = input.session.softphoneConfig ? createSoftphoneState(input.session.softphoneConfig) : null;

  set((current) => ({
    pairing: false,
    authView: 'login',
    loginPending: false,
    authError: null,
    bootstrapped: true,
    agent: input.session.agent,
    agentStatus: 'AVAILABLE',
    runtimeConnection: resolveRuntimeConnection(true, current.runtimeConnection),
    config: input.config,
    audioPreferences,
    audioDevices,
    audioPermission: getMediaDevices()?.enumerateDevices ? current.audioPermission : 'unsupported',
    audioCapabilities: controller?.getCapabilities() ?? DEFAULT_AUDIO_CAPABILITIES,
    softphone,
    callerIds: callerIdConfig.callerIds,
    defaultCallerId: callerIdConfig.defaultCallerId,
    agentDirectory,
    events: pushEvent(current.events, input.eventMessage),
    updateState: update
      ? {
          message: `새 버전 ${update.latestVersion} 이 준비되었습니다.`,
          mandatory: update.mandatory,
          preparing: false,
          preparedFileName: null,
          preparedFilePath: null,
          verified: false,
          applying: false,
        }
      : current.updateState,
  }));

  if (softphone?.config.enabled && softphone.config.authorizationPassword) {
    await useDesktopStore.getState().startSoftphone();
  }
}

export const useDesktopStore = create<DesktopStore>((set) => ({
  bootstrapped: false,
  pairing: false,
  authView: 'login',
  loginPending: false,
  authError: null,
  agent: null,
  agentStatus: null,
  runtimeConnection: 'idle',
  config: null,
  activeCall: null,
  events: [],
  audioPermission: 'unknown',
  refreshingAudioDevices: false,
  audioPreferences: null,
  audioDevices: EMPTY_AUDIO_DEVICES,
  audioCapabilities: DEFAULT_AUDIO_CAPABILITIES,
  softphone: null,
  callerIds: [],
  defaultCallerId: null,
  agentDirectory: [],
  updateState: null,
  async initialize() {
    const controller = getAudioController();
    const [configResult, audioPreferencesResult, sessionResult, audioDevicesResult] = await Promise.all([
      safeBootstrapLoad(() => getDesktopApi().getConfig(), null, 'desktop config'),
      safeBootstrapLoad(
        () => getDesktopApi().getAudioPreferences(),
        DEFAULT_AUDIO_PREFERENCES,
        'audio preferences',
      ),
      safeBootstrapLoad(() => getDesktopApi().getSession(), null, 'desktop session'),
      safeBootstrapLoad(() => enumerateAudioDevices(), EMPTY_AUDIO_DEVICES, 'audio devices'),
    ]);
    const config = configResult.value;
    const audioPreferences = audioPreferencesResult.value;
    const storedSession = sessionResult.value;
    const audioDevices = audioDevicesResult.value;
    const bootstrapError =
      configResult.error ??
      audioPreferencesResult.error ??
      sessionResult.error ??
      audioDevicesResult.error;
    if (controller) {
      await controller.applyPreferences(audioPreferences);
    }
    await getSoftphoneMediaController()?.applyOutputDevice(audioPreferences.outputDeviceId);
    await getSoftphoneMediaController()?.applyRingDevice(audioPreferences.ringDeviceId);

    if (!config) {
      set({
        bootstrapped: true,
        authView: 'login',
        loginPending: false,
        authError: bootstrapError,
        audioPreferences,
        audioDevices,
        audioPermission: getMediaDevices()?.enumerateDevices ? 'unknown' : 'unsupported',
        audioCapabilities: controller?.getCapabilities() ?? DEFAULT_AUDIO_CAPABILITIES,
        softphone: storedSession?.softphoneConfig ? createSoftphoneState(storedSession.softphoneConfig) : null,
        callerIds: [],
        defaultCallerId: null,
        agentDirectory: [],
        events: bootstrapError ? [`초기 로딩 실패 / ${bootstrapError}`] : [],
      });
      return;
    }

    let session = storedSession;
    let sessionBootstrapNote: string | null = null;
    let sessionBootstrapError: string | null = null;
    if (storedSession) {
      try {
        const refreshedSession = await getDesktopApi().refreshSession();
        if (refreshedSession) {
          session = refreshedSession;
          sessionBootstrapNote = '저장된 세션을 갱신했습니다.';
        } else {
          sessionBootstrapNote = '저장된 세션으로 시작합니다.';
        }
      } catch {
        sessionBootstrapNote = '저장된 세션으로 시작합니다.';
      }
    }

    if (session) {
      try {
        bindRuntimeEvents(set);
        const desktopApi = getDesktopApi();
        await desktopApi.connectRuntime();
        const [update, callerIdConfig, agentDirectory] = await Promise.all([
          desktopApi.checkForUpdates(),
          desktopApi.getCallerIds().catch(() => EMPTY_CALLER_ID_CONFIG),
          desktopApi.getAgentDirectory().catch(() => []),
        ]);
        if (update) {
          set({
            updateState: {
              message: `새 버전 ${update.latestVersion} 이 준비되었습니다.`,
              mandatory: update.mandatory,
              preparing: false,
              preparedFileName: null,
              preparedFilePath: null,
              verified: false,
              applying: false,
            },
            callerIds: callerIdConfig.callerIds,
            defaultCallerId: callerIdConfig.defaultCallerId,
            agentDirectory,
          });
        } else {
          set({
            callerIds: callerIdConfig.callerIds,
            defaultCallerId: callerIdConfig.defaultCallerId,
            agentDirectory,
          });
        }
      } catch (error) {
        session = null;
        sessionBootstrapError = toErrorMessage(error);
        detachRuntimeListener?.();
        detachRuntimeListener = null;
      }
    }

    const softphone = session?.softphoneConfig ? createSoftphoneState(session.softphoneConfig) : null;

    set((current) => ({
      bootstrapped: true,
      authView: 'login',
      loginPending: false,
      authError: sessionBootstrapError ?? bootstrapError,
      agent: session?.agent ?? null,
      agentStatus: session ? 'AVAILABLE' : null,
      runtimeConnection: sessionBootstrapError
        ? 'error'
        : resolveRuntimeConnection(Boolean(session), current.runtimeConnection),
      config,
      audioPreferences,
      audioDevices,
      audioPermission: getMediaDevices()?.enumerateDevices ? 'unknown' : 'unsupported',
      audioCapabilities: controller?.getCapabilities() ?? DEFAULT_AUDIO_CAPABILITIES,
      softphone,
      callerIds: session ? current.callerIds : [],
      defaultCallerId: session ? current.defaultCallerId : null,
      agentDirectory: session ? current.agentDirectory : [],
      events: appendEvents(
        current.events,
        sessionBootstrapError
          ? [
              `초기 세션 복구 실패 / ${sessionBootstrapError}`,
              `저장된 센터 설정을 불러왔습니다: ${config.serverUrl}`,
            ]
          : bootstrapError
            ? [
                `초기 로딩 실패 / ${bootstrapError}`,
                `저장된 센터 설정을 불러왔습니다: ${config.serverUrl}`,
              ]
          : sessionBootstrapNote
            ? [sessionBootstrapNote, `저장된 센터 설정을 불러왔습니다: ${config.serverUrl}`]
            : [`저장된 센터 설정을 불러왔습니다: ${config.serverUrl}`],
      ),
    }));

    if (softphone?.config.enabled && softphone.config.authorizationPassword) {
      await useDesktopStore.getState().startSoftphone();
    }
  },
  async login(params) {
    set({
      loginPending: true,
      authError: null,
      authView: 'login',
    });

    try {
      const desktopApi = getDesktopApi();
      const result = await desktopApi.login({
        serverUrl: params.serverUrl,
        loginId: params.loginId,
        extension: params.extension,
        password: params.password,
        createWebHandoff: true,
        webBaseUrl: WEB_BASE_URL ?? params.serverUrl,
        redirectPath: '/desktop-handoff',
      });
      const config =
        (await desktopApi.getConfig()) ??
        {
          ...normalizeCenterConfig({ serverUrl: params.serverUrl }),
          deviceId: useDesktopStore.getState().config?.deviceId ?? 'desktop-device',
        };

      await hydrateAuthenticatedDesktopSession(set, {
        session: result.session,
        config,
        eventMessage: `직접 로그인 완료: ${result.session.agent.agentName}`,
      });

      if (result.webHandoff?.url) {
        try {
          await desktopApi.openExternal(result.webHandoff.url);
          set((current) => ({
            events: pushEvent(current.events, '웹 자동 로그인을 시작했습니다.'),
          }));
        } catch (error) {
          set((current) => ({
            events: pushEvent(current.events, `웹 자동 로그인 열기 실패 / ${toErrorMessage(error)}`),
          }));
        }
      }
    } catch (error) {
      set((current) => ({
        loginPending: false,
        authError: toErrorMessage(error),
        events: pushEvent(current.events, `직접 로그인 실패 / ${toErrorMessage(error)}`),
      }));
    }
  },
  async pair(params) {
    set({ pairing: true });

    const desktopApi = getDesktopApi();
    const config = await desktopApi.saveConfig({
      serverUrl: params.serverUrl,
      channel: params.channel,
    });
    const session = await desktopApi.exchangeHandoff(params.handoffToken);
    bindRuntimeEvents(set);
    await desktopApi.connectRuntime();
    const [update, audioPreferences, callerIdConfig, agentDirectory] = await Promise.all([
      desktopApi.checkForUpdates(),
      desktopApi.getAudioPreferences(),
      desktopApi.getCallerIds().catch(() => EMPTY_CALLER_ID_CONFIG),
      desktopApi.getAgentDirectory().catch(() => []),
    ]);
    const softphone = session.softphoneConfig ? createSoftphoneState(session.softphoneConfig) : null;

    set((current) => ({
      pairing: false,
      bootstrapped: true,
      agent: session.agent,
      agentStatus: 'AVAILABLE',
      runtimeConnection: resolveRuntimeConnection(true, current.runtimeConnection),
      config,
      audioPreferences,
      audioCapabilities: getAudioController()?.getCapabilities() ?? DEFAULT_AUDIO_CAPABILITIES,
      softphone,
      callerIds: callerIdConfig.callerIds,
      defaultCallerId: callerIdConfig.defaultCallerId,
      agentDirectory,
      events: appendEvents(current.events, [`센터 설정 저장 완료: ${config.serverUrl}`]),
      updateState: update
        ? {
            message: `새 버전 ${update.latestVersion} 이 준비되었습니다.`,
            mandatory: update.mandatory,
            preparing: false,
            preparedFileName: null,
            preparedFilePath: null,
            verified: false,
            applying: false,
          }
        : null,
    }));

    await useDesktopStore.getState().refreshAudioDevices();
    if (softphone?.config.enabled && softphone.config.authorizationPassword) {
      await useDesktopStore.getState().startSoftphone();
    }
  },
  async connectWithProtocol(payload) {
    set({
      loginPending: true,
      authError: null,
      authView: 'login',
    });

    try {
      const desktopApi = getDesktopApi();
      const session = await desktopApi.connectWithProtocol(payload);
      const config =
        (await desktopApi.getConfig()) ??
        {
          ...normalizeCenterConfig({
            serverUrl: payload.serverUrl,
            channel: payload.channel,
          }),
          deviceId: useDesktopStore.getState().config?.deviceId ?? 'desktop-device',
        };

      await hydrateAuthenticatedDesktopSession(set, {
        session,
        config,
        eventMessage: `웹 연결 완료: ${session.agent.agentName}`,
      });
    } catch (error) {
      set((current) => ({
        loginPending: false,
        authError: toErrorMessage(error),
        events: pushEvent(current.events, `자동 연결 실패 / ${toErrorMessage(error)}`),
      }));
    }
  },
  showPairingDiagnostics() {
    set({
      authView: 'pairing',
      authError: null,
      pairing: false,
    });
  },
  showLogin() {
    set({
      authView: 'login',
      authError: null,
      pairing: false,
    });
  },
  async reconnectRuntime() {
    const current = useDesktopStore.getState();
    if (!current.config || !current.agent) {
      return;
    }

    set((state) => ({
      runtimeConnection: 'reconnecting',
      events: pushEvent(state.events, 'runtime 재연결 요청'),
    }));

    bindRuntimeEvents(set);

    try {
      await getDesktopApi().connectRuntime();
      set((state) => ({
        runtimeConnection: resolveRuntimeConnection(true, state.runtimeConnection),
      }));
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown';
      set((state) => ({
        runtimeConnection: 'error',
        events: pushEvent(state.events, `runtime 재연결 실패 / ${reason}`),
      }));
    }
  },
  async changeAgentStatus(statusCode) {
    const agent = useDesktopStore.getState().agent;
    if (!agent) {
      return;
    }

    const result = await getDesktopApi().changeAgentStatus(agent.agentId, statusCode);
    set((current) => ({
      agentStatus: result.statusCode,
      events: pushEvent(current.events, `상담원 상태 변경 ${result.statusCode}`),
    }));
  },
  async originate(phoneNumber, callerId) {
    const agent = useDesktopStore.getState().agent;
    const normalized = phoneNumber.trim();
    if (!agent || !normalized) {
      return;
    }

    await getDesktopApi().originate({
      agentExtension: agent.extension,
      phoneNumber: normalized,
      callerId: callerId?.trim() || undefined,
    });
    set((current) => ({
      events: pushEvent(
        current.events,
        `외부 발신 요청 ${normalized}${callerId ? ` / 발신번호 ${callerId}` : ''}`,
      ),
    }));
  },
  async originateInternal(target) {
    const normalizedExtension = target.extension.trim();
    if (!target.agentId || !normalizedExtension) {
      return;
    }

    await getDesktopApi().originateInternal({
      targetAgentId: target.agentId,
      targetExtension: normalizedExtension,
    });
    set((current) => ({
      events: pushEvent(current.events, `내선 발신 요청 ${target.agentName} ${normalizedExtension}`),
    }));
  },
  async openCallHistoryPopup() {
    await getDesktopApi().openCallHistoryPopup();
  },
  async openAgentListPopup() {
    await getDesktopApi().openAgentListPopup();
  },
  async pickup() {
    const currentCall = useDesktopStore.getState().activeCall;
    if (!currentCall) {
      return;
    }

    await getDesktopApi().pickup(currentCall.callId);
    set((current) => ({
      activeCall: current.activeCall
        ? {
            ...current.activeCall,
            sessionStatus: 'RINGING_AGENT',
          }
        : current.activeCall,
      events: pushEvent(current.events, `당겨받기 요청 ${currentCall.callId}`),
    }));
  },
  async mute() {
    const callId = useDesktopStore.getState().activeCall?.callId;
    if (!callId) {
      return;
    }

    const nextState = useDesktopStore.getState().activeCall?.isMuted ? 'off' : 'on';
    const result = await getDesktopApi().mute(callId, nextState);
    set((current) => ({
      activeCall: current.activeCall
        ? {
            ...current.activeCall,
            isMuted: result.state === 'on',
          }
        : current.activeCall,
      events: pushEvent(current.events, `음소거 ${result.state === 'on' ? '적용' : '해제'} ${callId}`),
    }));
  },
  async hangup() {
    const callId = useDesktopStore.getState().activeCall?.callId;
    if (!callId) {
      return;
    }

    await getDesktopApi().hangup(callId);
    set((current) => ({
      events: pushEvent(current.events, `종료 요청 ${callId}`),
    }));
  },
  async toggleHold() {
    const currentCall = useDesktopStore.getState().activeCall;
    if (!currentCall) {
      return;
    }

    if (currentCall.sessionStatus === 'HOLD') {
      await getDesktopApi().resume(currentCall.callId);
      set((current) => ({
        events: pushEvent(current.events, `보류 해제 요청 ${currentCall.callId}`),
      }));
      return;
    }

    await getDesktopApi().hold(currentCall.callId);
    set((current) => ({
      events: pushEvent(current.events, `보류 요청 ${currentCall.callId}`),
    }));
  },
  async transfer(target, mode) {
    const currentCall = useDesktopStore.getState().activeCall;
    const agent = useDesktopStore.getState().agent;
    if (!currentCall || !agent || !target.trim()) {
      return;
    }

    await getDesktopApi().transfer(currentCall.callId, {
      target: target.trim(),
      transferType: mode,
      fromExtension: agent.extension,
    });

    set((current) => ({
      activeCall: current.activeCall
        ? {
            ...current.activeCall,
            sessionStatus: 'TRANSFERRING',
            latestTransfer:
              mode === 'attended'
                ? {
                    phase: 'REQUESTED',
                    toExtension: target.trim(),
                    requestedAt: new Date().toISOString(),
                    completedAt: null,
                    expiredAt: null,
                  }
                : current.activeCall.latestTransfer ?? null,
          }
        : current.activeCall,
      events: pushEvent(
        current.events,
        `${mode === 'attended' ? '상담 전환' : '호 전환'} 요청 ${target.trim()}`,
      ),
    }));
  },
  async cancelAttendedTransfer() {
    const currentCall = useDesktopStore.getState().activeCall;
    if (!currentCall) {
      return;
    }

    await getDesktopApi().cancelAttendedTransfer(currentCall.callId);
    set((current) => ({
      activeCall: current.activeCall
        ? {
            ...current.activeCall,
            sessionStatus: current.activeCall.answeredAt ? 'TALKING' : 'RINGING_AGENT',
            latestTransfer: null,
          }
        : current.activeCall,
      events: pushEvent(current.events, `상담 전환 취소 요청 ${currentCall.callId}`),
    }));
  },
  async completeAttendedTransfer() {
    const currentCall = useDesktopStore.getState().activeCall;
    if (!currentCall) {
      return;
    }

    await getDesktopApi().completeAttendedTransfer(currentCall.callId);
    set((current) => ({
      activeCall: current.activeCall
        ? {
            ...current.activeCall,
            sessionStatus: 'TRANSFERRING',
            latestTransfer: current.activeCall.latestTransfer
              ? {
                  ...current.activeCall.latestTransfer,
                  phase: 'REBRIDGING',
                }
              : current.activeCall.latestTransfer,
          }
        : current.activeCall,
      events: pushEvent(current.events, `상담 전환 완료 요청 ${currentCall.callId}`),
    }));
  },
  async checkForUpdates() {
    const update = await getDesktopApi().checkForUpdates();
    if (!update) {
      return;
    }

    set({
      updateState: {
        message: `새 버전 ${update.latestVersion} 이 준비되었습니다.`,
        mandatory: update.mandatory,
        preparing: false,
        preparedFileName: null,
        preparedFilePath: null,
        verified: false,
        applying: false,
      },
    });
  },
  dismissUpdate() {
    set({ updateState: null });
  },
  async prepareUpdate() {
    const currentUpdate = useDesktopStore.getState().updateState;
    if (!currentUpdate) {
      return;
    }

    set({
      updateState: {
        ...currentUpdate,
        preparing: true,
      },
    });

    const prepared = await getDesktopApi().prepareUpdate();
    if (!prepared) {
      set({
        updateState: {
          ...currentUpdate,
          preparing: false,
        },
      });
      return;
    }

    set((current) => ({
      updateState: current.updateState
        ? {
            ...current.updateState,
            preparing: false,
            preparedFileName: prepared.fileName,
            preparedFilePath: prepared.filePath,
            verified: prepared.verified,
            applying: false,
            message: prepared.verified
              ? `새 버전 ${prepared.version} 다운로드 준비가 완료되었습니다.`
              : `새 버전 ${prepared.version} 검증에 실패했습니다.`,
          }
        : current.updateState,
      events: pushEvent(
        current.events,
        prepared.verified
          ? `업데이트 파일 준비 완료 ${prepared.fileName}`
          : `업데이트 검증 실패 ${prepared.fileName}`,
      ),
    }));
  },
  async applyPreparedUpdate() {
    const currentUpdate = useDesktopStore.getState().updateState;
    if (!currentUpdate?.preparedFilePath || !currentUpdate.verified) {
      return;
    }

    const blockReason = getUpdateBlockReason(useDesktopStore.getState());
    if (blockReason) {
      set((current) => ({
        events: pushEvent(current.events, `업데이트 적용 보류 / ${blockReason}`),
      }));
      return;
    }

    set({
      updateState: {
        ...currentUpdate,
        applying: true,
      },
    });

    const result = await getDesktopApi().applyPreparedUpdate();
    set((current) => ({
      updateState: current.updateState
        ? {
            ...current.updateState,
            applying: false,
            message: result
              ? `설치 프로그램을 실행했습니다: ${current.updateState.preparedFileName ?? result.filePath}`
              : current.updateState.message,
          }
        : current.updateState,
      events: result
        ? pushEvent(current.events, `설치 실행 ${result.filePath}`)
        : current.events,
    }));
  },
  async refreshAudioDevices() {
    const mediaDevices = getMediaDevices();
    if (!mediaDevices?.enumerateDevices) {
      set({
        audioPermission: 'unsupported',
        audioDevices: EMPTY_AUDIO_DEVICES,
        refreshingAudioDevices: false,
      });
      return;
    }

    set({ refreshingAudioDevices: true });
    try {
      if (useDesktopStore.getState().audioPermission !== 'granted') {
        const controller = getAudioController();
        const audioPreferences = useDesktopStore.getState().audioPreferences ?? DEFAULT_AUDIO_PREFERENCES;
        const stream = await controller?.requestInputAccess(audioPreferences);
        stream?.getTracks().forEach((track) => track.stop());
      }

      const audioDevices = await enumerateAudioDevices();
      set((current) => ({
        audioDevices,
        audioPermission: 'granted',
        refreshingAudioDevices: false,
        events: pushEvent(current.events, '오디오 장치 목록을 새로 고쳤습니다.'),
      }));
    } catch {
      const audioDevices = await enumerateAudioDevices();
      set((current) => ({
        audioDevices,
        audioPermission: 'denied',
        refreshingAudioDevices: false,
        events: pushEvent(current.events, '마이크 권한이 없어 제한된 장치 목록만 표시됩니다.'),
      }));
    }
  },
  async requestAudioPermission() {
    const audioPreferences = useDesktopStore.getState().audioPreferences;
    const controller = getAudioController();
    if (!controller) {
      set({ audioPermission: 'unsupported' });
      return;
    }

    try {
      const stream = await controller.requestInputAccess(
        audioPreferences ?? {
          inputDeviceId: null,
          outputDeviceId: null,
          ringDeviceId: null,
          echoCancellation: true,
          noiseSuppression: true,
        },
      );
      stream.getTracks().forEach((track) => track.stop());
      const audioDevices = await enumerateAudioDevices();
      set((current) => ({
        audioPermission: 'granted',
        audioDevices,
        events: pushEvent(current.events, '마이크 권한을 확인했습니다.'),
      }));
    } catch {
      set((current) => ({
        audioPermission: 'denied',
        events: pushEvent(current.events, '마이크 권한이 거부되었습니다.'),
      }));
    }
  },
  async updateAudioPreferences(input) {
    const audioPreferences = await getDesktopApi().saveAudioPreferences(input);
    await getAudioController()?.applyPreferences(audioPreferences);
    await getSoftphoneMediaController()?.applyOutputDevice(audioPreferences.outputDeviceId);
    await getSoftphoneMediaController()?.applyRingDevice(audioPreferences.ringDeviceId);
    set((current) => ({
      audioPreferences,
      events: pushEvent(current.events, '오디오 설정을 저장했습니다.'),
    }));
  },
  async playOutputPreview() {
    await getAudioController()?.playOutputPreview();
    set((current) => ({
      events: pushEvent(current.events, '스피커 테스트 톤을 재생했습니다.'),
    }));
  },
  async playRingPreview() {
    await getAudioController()?.playRingPreview();
    set((current) => ({
      events: pushEvent(current.events, '벨소리 테스트 톤을 재생했습니다.'),
    }));
  },
  async startSoftphone() {
    const softphone = useDesktopStore.getState().softphone;
    if (!softphone?.config.enabled || !softphone.config.authorizationPassword) {
      return;
    }

    set((current) => ({
      softphone: current.softphone
        ? {
            ...current.softphone,
            registration: 'registering',
            transport: 'connecting',
            lastError: null,
          }
        : current.softphone,
      events: pushEvent(current.events, 'softphone 등록 시작'),
    }));

    await getSoftphoneClient().start(softphone.config);
  },
  async stopSoftphone() {
    await getSoftphoneClient().stop();
    set((current) => ({
      softphone: current.softphone
        ? {
            ...current.softphone,
            registration: current.softphone.config.enabled ? 'idle' : 'disabled',
            transport: current.softphone.config.enabled ? 'not-connected' : 'not-configured',
            lastError: null,
            session: null,
            remoteAudioActive: false,
          }
        : current.softphone,
      events: pushEvent(current.events, 'softphone 등록 종료'),
    }));
    getSoftphoneMediaController()?.stopRingtone();
  },
  async answerSoftphoneCall() {
    await getSoftphoneClient().answer(useDesktopStore.getState().audioPreferences);
    set((current) => ({
      events: pushEvent(current.events, 'softphone 수신 응답'),
    }));
  },
  async rejectSoftphoneCall() {
    await getSoftphoneClient().reject();
    set((current) => ({
      softphone: current.softphone
        ? {
            ...current.softphone,
            session: null,
            remoteAudioActive: false,
          }
        : current.softphone,
      events: pushEvent(current.events, 'softphone 수신 거절'),
    }));
    getSoftphoneMediaController()?.stopRingtone();
  },
  async hangupSoftphoneCall() {
    await getSoftphoneClient().hangup();
    set((current) => ({
      events: pushEvent(current.events, 'softphone 종료 요청'),
    }));
    getSoftphoneMediaController()?.stopRingtone();
  },
}));
