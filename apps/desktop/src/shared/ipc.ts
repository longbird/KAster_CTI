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

export interface DesktopAgentProfile {
  agentId: string;
  agentName: string;
  extension: string;
  role: string;
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
  onProtocolConnect(listener: (payload: DesktopProtocolConnectPayload) => void): () => void;
  onEvent(listener: (event: import('./cti').CtiEvent) => void): () => void;
}

export interface DesktopWindow extends Window {
  desktopApi: DesktopApi;
}
