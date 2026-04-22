import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopApi } from '../shared/ipc';
import type { CtiEvent } from '../shared/cti';

const desktopApi: DesktopApi = {
  getConfig: () => ipcRenderer.invoke('desktop:get-config'),
  saveConfig: (input) => ipcRenderer.invoke('desktop:save-config', input),
  exchangeHandoff: (handoffToken) => ipcRenderer.invoke('desktop:exchange-handoff', handoffToken),
  getSession: () => ipcRenderer.invoke('desktop:get-session'),
  refreshSession: () => ipcRenderer.invoke('desktop:refresh-session'),
  connectRuntime: () => ipcRenderer.invoke('desktop:connect-runtime'),
  mute: (callId, state) => ipcRenderer.invoke('desktop:mute', callId, state),
  hangup: (callId) => ipcRenderer.invoke('desktop:hangup', callId),
  hold: (callId) => ipcRenderer.invoke('desktop:hold', callId),
  resume: (callId) => ipcRenderer.invoke('desktop:resume', callId),
  checkForUpdates: () => ipcRenderer.invoke('desktop:check-for-updates'),
  prepareUpdate: () => ipcRenderer.invoke('desktop:prepare-update'),
  applyPreparedUpdate: () => ipcRenderer.invoke('desktop:apply-prepared-update'),
  onEvent: (listener) => {
    const handler = (_event: unknown, payload: CtiEvent) => listener(payload);
    ipcRenderer.on('desktop:event', handler);
    return () => {
      ipcRenderer.removeListener('desktop:event', handler);
    };
  },
};

contextBridge.exposeInMainWorld('desktopApi', desktopApi);
