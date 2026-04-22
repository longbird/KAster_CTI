export interface DesktopConfig {
  serverUrl: string;
  channel: string;
  deviceId: string;
}

export interface DesktopAgentProfile {
  agentId: string;
  agentName: string;
  extension: string;
  role: string;
}

export interface DesktopSessionSummary {
  agent: DesktopAgentProfile;
}

export interface DesktopApi {
  getConfig(): Promise<DesktopConfig | null>;
  saveConfig(input: { serverUrl: string; channel?: string }): Promise<DesktopConfig>;
  exchangeHandoff(handoffToken: string): Promise<DesktopSessionSummary>;
  getSession(): Promise<DesktopSessionSummary | null>;
  refreshSession(): Promise<DesktopSessionSummary | null>;
  connectRuntime(): Promise<void>;
  mute(
    callId: string,
    state: 'on' | 'off',
  ): Promise<import('./cti').CommandAck & { callId: string; state: 'on' | 'off'; direction: string }>;
  hangup(callId: string): Promise<import('./cti').CommandAck>;
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
  onEvent(listener: (event: import('./cti').CtiEvent) => void): () => void;
}

export interface DesktopWindow extends Window {
  desktopApi: DesktopApi;
}
