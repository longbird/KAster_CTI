import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopApi } from '../shared/ipc';

const desktopApi: DesktopApi = {
  getConfig: () => ipcRenderer.invoke('desktop:get-config'),
  saveConfig: (input) => ipcRenderer.invoke('desktop:save-config', input),
};

contextBridge.exposeInMainWorld('desktopApi', desktopApi);
