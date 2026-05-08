import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopApi } from '../shared/ipc';
import type { CtiEvent } from '../shared/cti';

const desktopApi: DesktopApi = {
  setWindowMode: (mode) => ipcRenderer.invoke('desktop:set-window-mode', mode),
  getConfig: () => ipcRenderer.invoke('desktop:get-config'),
  saveConfig: (input) => ipcRenderer.invoke('desktop:save-config', input),
  getAudioPreferences: () => ipcRenderer.invoke('desktop:get-audio-preferences'),
  saveAudioPreferences: (input) => ipcRenderer.invoke('desktop:save-audio-preferences', input),
  exchangeHandoff: (handoffToken) => ipcRenderer.invoke('desktop:exchange-handoff', handoffToken),
  login: (input) => ipcRenderer.invoke('desktop:login', input),
  getSession: () => ipcRenderer.invoke('desktop:get-session'),
  refreshSession: () => ipcRenderer.invoke('desktop:refresh-session'),
  connectWithProtocol: (payload) => ipcRenderer.invoke('desktop:connect-with-protocol', payload),
  connectRuntime: () => ipcRenderer.invoke('desktop:connect-runtime'),
  changeAgentStatus: (agentId, statusCode) => ipcRenderer.invoke('desktop:change-agent-status', agentId, statusCode),
  mute: (callId, state) => ipcRenderer.invoke('desktop:mute', callId, state),
  hangup: (callId) => ipcRenderer.invoke('desktop:hangup', callId),
  pickup: (callId) => ipcRenderer.invoke('desktop:pickup', callId),
  originate: (params) => ipcRenderer.invoke('desktop:originate', params),
  originateInternal: (input) => ipcRenderer.invoke('desktop:originate-internal', input),
  getCallerIds: () => ipcRenderer.invoke('desktop:get-caller-ids'),
  getAgentDirectory: () => ipcRenderer.invoke('desktop:get-agent-directory'),
  getCallHistory: () => ipcRenderer.invoke('desktop:get-call-history'),
  getCallContext: (callId) => ipcRenderer.invoke('desktop:get-call-context', callId),
  saveCallMemo: (input) => ipcRenderer.invoke('desktop:save-call-memo', input),
  requestHistoryOriginate: (input) => ipcRenderer.invoke('desktop:request-history-originate', input),
  completeHistoryOriginateRequest: (input) => ipcRenderer.invoke('desktop:complete-history-originate', input),
  openCallHistoryPopup: () => ipcRenderer.invoke('desktop:open-call-history-popup'),
  openAgentListPopup: () => ipcRenderer.invoke('desktop:open-agent-list-popup'),
  transfer: (callId, params) => ipcRenderer.invoke('desktop:transfer', callId, params),
  cancelAttendedTransfer: (callId) => ipcRenderer.invoke('desktop:cancel-attended-transfer', callId),
  completeAttendedTransfer: (callId) => ipcRenderer.invoke('desktop:complete-attended-transfer', callId),
  hold: (callId) => ipcRenderer.invoke('desktop:hold', callId),
  resume: (callId) => ipcRenderer.invoke('desktop:resume', callId),
  checkForUpdates: () => ipcRenderer.invoke('desktop:check-for-updates'),
  prepareUpdate: () => ipcRenderer.invoke('desktop:prepare-update'),
  applyPreparedUpdate: () => ipcRenderer.invoke('desktop:apply-prepared-update'),
  getDesktopSession: (accessToken) => ipcRenderer.invoke('desktop:get-desktop-session', accessToken),
  notifyIncomingCall: (input) => ipcRenderer.invoke('desktop:notify-incoming-call', input),
  focusWindow: () => ipcRenderer.invoke('desktop:focus-window'),
  openExternal: (url) => ipcRenderer.invoke('desktop:open-external', url),
  onHistoryOriginateRequest: (listener) => {
    const handler = (_event: unknown, payload: Parameters<typeof listener>[0]) => listener(payload);
    ipcRenderer.on('desktop:history-originate-request', handler);
    return () => {
      ipcRenderer.removeListener('desktop:history-originate-request', handler);
    };
  },
  onProtocolConnect: (listener) => {
    const handler = (_event: unknown, payload: Parameters<typeof listener>[0]) => listener(payload);
    ipcRenderer.on('desktop:protocol-connect', handler);
    void ipcRenderer.invoke('desktop:protocol-connect-ready');
    return () => {
      ipcRenderer.removeListener('desktop:protocol-connect', handler);
    };
  },
  onEvent: (listener) => {
    const handler = (_event: unknown, payload: CtiEvent) => listener(payload);
    ipcRenderer.on('desktop:event', handler);
    return () => {
      ipcRenderer.removeListener('desktop:event', handler);
    };
  },
};

contextBridge.exposeInMainWorld('desktopApi', desktopApi);
