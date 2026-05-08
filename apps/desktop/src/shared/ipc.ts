export interface DesktopConfig {
  serverUrl: string;
  channel: string;
  deviceId: string;
}

export type DesktopWindowMode =
  | 'compact'
  | 'full'
  | 'idle'
  | 'ringing'
  | 'talking'
  | 'transferring'
  | 'afterCall'
  | 'settings';

export interface DesktopAudioPreferences {
  inputDeviceId: string | null;
  outputDeviceId: string | null;
  ringDeviceId: string | null;
  echoCancellation: boolean;
  noiseSuppression: boolean;
}

export interface DesktopCallPreferences {
  /** 0 = off, 1~60 = 자동 응답까지 남은 초 */
  autoAnswerSeconds: number;
  /** 0 = off, 1~60 = 자동 거절까지 남은 초 */
  autoRejectSeconds: number;
  /** 통화 종료 후 후처리(AFTER_CALL_WORK) → 자동으로 다음 상태 전환할 초 (0=off) */
  autoStatusAfterCallSeconds: number;
}

export type DesktopRingTonePresetId = 'classic' | 'soft' | 'urgent' | 'silent';

export interface DesktopGeneralPreferences {
  /** 부팅 시 자동 시작 (OS 로그인 항목 등록) */
  autoStart: boolean;
  /** 저장된 세션으로 자동 로그인. false 면 매 실행 시 로그인 화면 강제 */
  autoLogin: boolean;
  /** 메인 창 항상 위 표시 */
  alwaysOnTop: boolean;
  /** 닫기 버튼 누를 때 종료 대신 트레이 최소화 (기본 true — 기존 동작 유지) */
  closeToTray: boolean;
  /** 벨소리 음원 프리셋 */
  ringTonePresetId: DesktopRingTonePresetId;
}

export type DesktopTransferHotkeyMode = 'blind' | 'attended';

export interface DesktopTransferHotkeySlot {
  /** 1~9 — 통화 중 키보드 1~9 키와 매핑 */
  slot: number;
  /** UI 표시용 라벨 (예: "팀장님", "지사 A") */
  label: string;
  /** 전환 대상 내선/번호 */
  target: string;
  mode: DesktopTransferHotkeyMode;
}

export interface DesktopAgentProfile {
  agentId: string;
  agentName: string;
  extension: string;
  role: string;
}

export interface DesktopAgentGroupSummary {
  agentGroupId: string;
  groupCode: string;
  groupName: string;
}

export interface DesktopAgentDirectoryItem {
  agentId: string;
  agentName: string;
  extension: string;
  role: string;
  isActive: boolean;
  loginStatus: 'LOGGED_IN' | 'LOGGED_OUT' | 'UNKNOWN';
  sipRegistration: {
    registered: boolean;
    registrationStatus: string;
    contactUri: string | null;
    userAgent: string | null;
    roundtripUsec: number | null;
  };
  canCall: boolean;
  currentStatus?: {
    statusCode: import('./cti').AgentStatusCode;
  } | null;
  agentGroup?: DesktopAgentGroupSummary | null;
}

export interface DesktopCallerIdConfig {
  callerIds: string[];
  defaultCallerId: string | null;
}

export interface DesktopCallHistoryItem {
  callId: string;
  ani: string | null;
  dnis: string | null;
  didNumber?: string | null;
  representativeNumber?: string | null;
  queueName: string | null;
  sessionStatus: string;
  direction: string | null;
  startedAt: string;
  answeredAt: string | null;
  endedAt: string | null;
  talkSeconds: number | null;
  waitSeconds?: number | null;
  primaryAgent?: {
    agentName: string;
  } | null;
  customer?: {
    customerName: string;
  } | null;
}

export interface DesktopHistoryOriginateRequest {
  requestId: string;
  phoneNumber: string;
}

export interface DesktopCallContextHistoryItem {
  callId: string;
  direction: string | null;
  sessionStatus: string;
  startedAt: string;
  answeredAt: string | null;
  endedAt: string | null;
  talkSeconds: number | null;
  queueName: string | null;
  primaryAgentName: string | null;
}

export interface DesktopCallContextMemo {
  callMemoId: string;
  agentId: string | null;
  memoType: string | null;
  resultCode: string | null;
  subResultCode: string | null;
  memoText: string | null;
  isFinal: boolean | null;
  createdAt: string;
}

export interface DesktopCallContext {
  callId: string;
  customer: {
    customerId: string;
    customerName: string;
    grade: string | null;
    memo: string | null;
    primaryPhoneNumber: string | null;
    extraPhoneNumbers: string[];
  } | null;
  representativeNumber: string | null;
  history: DesktopCallContextHistoryItem[];
  memos: DesktopCallContextMemo[];
}

export interface DesktopSaveCallMemoInput {
  callId: string;
  agentId: string;
  memoText?: string;
  resultCode?: string;
  subResultCode?: string;
  memoType?: string;
  isFinal?: boolean;
}

export interface DesktopHistoryOriginateResult {
  requestId: string;
  ok: boolean;
  message?: string;
}

export interface DesktopSoftphoneConfig {
  enabled: boolean;
  sipUri: string | null;
  wsServer: string | null;
  authorizationUsername: string | null;
  authorizationPassword?: string | null;
  displayName: string;
  iceServers: Array<{
    urls: string | string[];
    username?: string;
    credential?: string;
  }>;
}

export interface DesktopSessionSummary {
  agent: DesktopAgentProfile;
  softphoneConfig?: DesktopSoftphoneConfig;
}

export interface DesktopProtocolConnectPayload {
  type: 'connect';
  serverUrl: string;
  handoffToken: string;
  channel?: string;
}

export interface DesktopDirectLoginResult {
  session: DesktopSessionSummary;
  webHandoff?: {
    handoffToken: string;
    expiresIn: number;
    redirectPath?: string;
    url?: string;
  };
}

export interface DesktopApi {
  setWindowMode(mode: DesktopWindowMode): Promise<void>;
  getConfig(): Promise<DesktopConfig | null>;
  saveConfig(input: { serverUrl: string; channel?: string }): Promise<DesktopConfig>;
  getAudioPreferences(): Promise<DesktopAudioPreferences>;
  saveAudioPreferences(input: DesktopAudioPreferences): Promise<DesktopAudioPreferences>;
  getCallPreferences(): Promise<DesktopCallPreferences>;
  saveCallPreferences(input: DesktopCallPreferences): Promise<DesktopCallPreferences>;
  getGeneralPreferences(): Promise<DesktopGeneralPreferences>;
  saveGeneralPreferences(input: DesktopGeneralPreferences): Promise<DesktopGeneralPreferences>;
  getTransferHotkeys(): Promise<DesktopTransferHotkeySlot[]>;
  saveTransferHotkeys(input: DesktopTransferHotkeySlot[]): Promise<DesktopTransferHotkeySlot[]>;
  exchangeHandoff(handoffToken: string): Promise<DesktopSessionSummary>;
  login(input: {
    serverUrl: string;
    loginId: string;
    password: string;
    extension?: string;
    channel?: string;
    webBaseUrl?: string;
    createWebHandoff?: boolean;
    redirectPath?: string;
  }): Promise<DesktopDirectLoginResult>;
  getSession(): Promise<DesktopSessionSummary | null>;
  refreshSession(): Promise<DesktopSessionSummary | null>;
  connectWithProtocol(payload: DesktopProtocolConnectPayload): Promise<DesktopSessionSummary>;
  connectRuntime(): Promise<void>;
  changeAgentStatus(
    agentId: string,
    statusCode: import('./cti').AgentStatusCode,
    reasonCode?: string,
  ): Promise<{ statusCode: import('./cti').AgentStatusCode }>;
  mute(
    callId: string,
    state: 'on' | 'off',
  ): Promise<import('./cti').CommandAck & { callId: string; state: 'on' | 'off'; direction: string }>;
  hangup(callId: string): Promise<import('./cti').CommandAck>;
  pickup(callId: string): Promise<import('./cti').CommandAck>;
  originate(params: {
    agentExtension: string;
    phoneNumber: string;
    callerId?: string;
  }): Promise<import('./cti').CommandAck & { channel?: string }>;
  originateInternal(input: {
    targetAgentId: string;
    targetExtension: string;
  }): Promise<import('./cti').CommandAck>;
  getCallerIds(): Promise<DesktopCallerIdConfig>;
  getAgentDirectory(): Promise<DesktopAgentDirectoryItem[]>;
  getCallHistory(): Promise<DesktopCallHistoryItem[]>;
  getCallContext(callId: string): Promise<DesktopCallContext | null>;
  saveCallMemo(input: DesktopSaveCallMemoInput): Promise<DesktopCallContextMemo>;
  requestHistoryOriginate(input: { phoneNumber: string }): Promise<DesktopHistoryOriginateResult>;
  completeHistoryOriginateRequest(input: DesktopHistoryOriginateResult): Promise<void>;
  openCallHistoryPopup(): Promise<void>;
  openAgentListPopup(): Promise<void>;
  openDialpadPopup(): Promise<void>;
  transfer(
    callId: string,
    params: {
      target: string;
      transferType: 'blind' | 'attended';
      fromExtension: string;
    },
  ): Promise<import('./cti').CommandAck>;
  cancelAttendedTransfer(callId: string): Promise<import('./cti').CommandAck>;
  completeAttendedTransfer(callId: string): Promise<import('./cti').CommandAck>;
  hold(callId: string): Promise<import('./cti').CommandAck>;
  resume(callId: string): Promise<import('./cti').CommandAck>;
  checkForUpdates(): Promise<{ latestVersion: string; mandatory: boolean } | null>;
  prepareUpdate(): Promise<{
    version: string;
    fileName: string;
    filePath: string;
    verified: boolean;
    mandatory: boolean;
  } | null>;
  applyPreparedUpdate(): Promise<{
    launched: boolean;
    filePath: string;
  } | null>;
  getDesktopSession(accessToken?: string): Promise<DesktopSessionSummary>;
  notifyIncomingCall(input: { title: string; body: string }): Promise<void>;
  focusWindow(): Promise<void>;
  openExternal(url: string): Promise<void>;
  onHistoryOriginateRequest(listener: (input: DesktopHistoryOriginateRequest) => void): () => void;
  onProtocolConnect(listener: (payload: DesktopProtocolConnectPayload) => void): () => void;
  onEvent(listener: (event: import('./cti').CtiEvent) => void): () => void;
}

export interface DesktopWindow extends Window {
  desktopApi: DesktopApi;
}
