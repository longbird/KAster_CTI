import { create } from 'zustand';
import type { ActiveCall, AgentStatusCode, CtiEvent } from '../../../shared/cti';
import type { DesktopAgentProfile, DesktopConfig } from '../../../shared/ipc';

interface PairParams {
  serverUrl: string;
  channel?: string;
  handoffToken: string;
}

interface DesktopStore {
  bootstrapped: boolean;
  pairing: boolean;
  agent: DesktopAgentProfile | null;
  agentStatus: AgentStatusCode | null;
  config: DesktopConfig | null;
  activeCall: ActiveCall | null;
  events: string[];
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
  pair(params: PairParams): Promise<void>;
  mute(): Promise<void>;
  hangup(): Promise<void>;
  toggleHold(): Promise<void>;
  checkForUpdates(): Promise<void>;
  prepareUpdate(): Promise<void>;
  applyPreparedUpdate(): Promise<void>;
}

let detachRuntimeListener: (() => void) | null = null;

function pushEvent(current: string[], message: string) {
  return [message, ...current].slice(0, 30);
}

function reduceEvent(
  event: CtiEvent,
  currentCall: ActiveCall | null,
  currentEvents: string[],
  currentAgentStatus: AgentStatusCode | null,
): Pick<DesktopStore, 'activeCall' | 'events' | 'agentStatus'> {
  switch (event.type) {
    case 'call.created':
      return {
        activeCall: event.payload,
        agentStatus: currentAgentStatus,
        events: pushEvent(currentEvents, `신규 콜 ${event.payload.ani} / ${event.payload.sessionStatus}`),
      };
    case 'call.updated':
      return {
        activeCall: event.payload,
        agentStatus: currentAgentStatus,
        events: pushEvent(currentEvents, `콜 상태 변경 ${event.payload.ani} / ${event.payload.sessionStatus}`),
      };
    case 'call.ended':
      return {
        activeCall: currentCall?.callId === event.payload.callId ? null : currentCall,
        agentStatus: currentAgentStatus,
        events: pushEvent(currentEvents, `콜 종료 ${event.payload.callId}`),
      };
    case 'agent.status.changed':
      return {
        activeCall: currentCall,
        agentStatus: event.payload.statusCode,
        events: pushEvent(currentEvents, `상태 변경 ${event.payload.agentId} / ${event.payload.statusCode}`),
      };
    case 'queue.summary.updated':
      return {
        activeCall: currentCall,
        agentStatus: currentAgentStatus,
        events: pushEvent(currentEvents, `큐 요약 갱신 ${event.payload.length}건`),
      };
  }
}

export const useDesktopStore = create<DesktopStore>((set) => ({
  bootstrapped: false,
  pairing: false,
  agent: null,
  agentStatus: null,
  config: null,
  activeCall: null,
  events: [],
  updateState: null,
  async initialize() {
    const [config, session] = await Promise.all([
      window.desktopApi.getConfig(),
      window.desktopApi.getSession(),
    ]);

    if (!config) {
      return;
    }

    if (session) {
      await window.desktopApi.connectRuntime();
      detachRuntimeListener?.();
      detachRuntimeListener = window.desktopApi.onEvent((event) => {
        set((state) => reduceEvent(event, state.activeCall, state.events, state.agentStatus));
      });
      const update = await window.desktopApi.checkForUpdates();
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
        });
      }
    }

    set({
      bootstrapped: true,
      agent: session?.agent ?? null,
      agentStatus: session ? 'AVAILABLE' : null,
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
    const session = await window.desktopApi.exchangeHandoff(params.handoffToken);
    await window.desktopApi.connectRuntime();
    detachRuntimeListener?.();
    detachRuntimeListener = window.desktopApi.onEvent((event) => {
      set((state) => reduceEvent(event, state.activeCall, state.events, state.agentStatus));
    });
    const update = await window.desktopApi.checkForUpdates();

    set({
      pairing: false,
      bootstrapped: true,
      agent: session.agent,
      agentStatus: 'AVAILABLE',
      config,
      events: [`센터 설정 저장 완료: ${config.serverUrl}`],
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
    });
  },
  async mute() {
    const callId = useDesktopStore.getState().activeCall?.callId;
    if (!callId) {
      return;
    }

    const nextState = useDesktopStore.getState().activeCall?.isMuted ? 'off' : 'on';
    const result = await window.desktopApi.mute(callId, nextState);
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

    await window.desktopApi.hangup(callId);
    set((current) => ({
      activeCall: null,
      events: pushEvent(current.events, `종료 요청 ${callId}`),
    }));
  },
  async toggleHold() {
    const currentCall = useDesktopStore.getState().activeCall;
    if (!currentCall) {
      return;
    }

    if (currentCall.sessionStatus === 'HOLD') {
      await window.desktopApi.resume(currentCall.callId);
      set((current) => ({
        activeCall: current.activeCall
          ? {
              ...current.activeCall,
              sessionStatus: 'TALKING',
            }
          : current.activeCall,
        events: pushEvent(current.events, `보류 해제 요청 ${currentCall.callId}`),
      }));
      return;
    }

    await window.desktopApi.hold(currentCall.callId);
    set((current) => ({
      activeCall: current.activeCall
        ? {
            ...current.activeCall,
            sessionStatus: 'HOLD',
          }
        : current.activeCall,
      events: pushEvent(current.events, `보류 요청 ${currentCall.callId}`),
    }));
  },
  async checkForUpdates() {
    const update = await window.desktopApi.checkForUpdates();
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

    const prepared = await window.desktopApi.prepareUpdate();
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

    set({
      updateState: {
        ...currentUpdate,
        applying: true,
      },
    });

    const result = await window.desktopApi.applyPreparedUpdate();
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
}));
