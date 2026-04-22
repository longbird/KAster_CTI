import { contextBridge, ipcRenderer } from "electron";
const desktopApi = {
  getConfig: () => ipcRenderer.invoke("desktop:get-config"),
  saveConfig: (input) => ipcRenderer.invoke("desktop:save-config", input)
};
contextBridge.exposeInMainWorld("desktopApi", desktopApi);
