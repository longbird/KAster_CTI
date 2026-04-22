import { create } from 'zustand';
import type { DesktopConfig } from '../../../shared/ipc';

interface PairParams {
  serverUrl: string;
  channel?: string;
}

interface DesktopStore {
  bootstrapped: boolean;
  pairing: boolean;
  config: DesktopConfig | null;
  events: string[];
  initialize(): Promise<void>;
  pair(params: PairParams): Promise<void>;
}

export const useDesktopStore = create<DesktopStore>((set) => ({
  bootstrapped: false,
  pairing: false,
  config: null,
  events: [],
  async initialize() {
    const config = await window.desktopApi.getConfig();
    if (!config) return;

    set({
      bootstrapped: true,
      config,
      events: [`저장된 센터 설정을 불러왔습니다: ${config.serverUrl}`],
    });
  },
  async pair(params) {
    set({ pairing: true });

    const config = await window.desktopApi.saveConfig({
      serverUrl: params.serverUrl,
      channel: params.channel,
    });

    set({
      pairing: false,
      bootstrapped: true,
      config,
      events: [`센터 설정 저장 완료: ${config.serverUrl}`],
    });
  },
}));
