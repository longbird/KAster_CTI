export interface DesktopConfig {
  serverUrl: string;
  channel: string;
  deviceId: string;
}

export interface DesktopApi {
  getConfig(): Promise<DesktopConfig | null>;
  saveConfig(input: { serverUrl: string; channel?: string }): Promise<DesktopConfig>;
}
