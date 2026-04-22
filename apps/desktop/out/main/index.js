import { app, ipcMain, BrowserWindow } from "electron";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import __cjs_mod__ from "node:module";
const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
const require2 = __cjs_mod__.createRequire(import.meta.url);
function normalizeCenterConfig(input) {
  const trimmed = input.serverUrl.trim();
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) && !/^https?:\/\//i.test(trimmed)) {
    throw new Error("Center server URL must use http or https.");
  }
  const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(normalized);
  if (!/^https?:$/.test(url.protocol)) {
    throw new Error("Center server URL must use http or https.");
  }
  return {
    serverUrl: url.toString().replace(/\/$/, ""),
    channel: input.channel?.trim() || "stable"
  };
}
class DesktopConfigStore {
  constructor(userDataDir) {
    this.userDataDir = userDataDir;
    this.filePath = join(userDataDir, "desktop-config.json");
  }
  filePath;
  async load() {
    try {
      const raw = await readFile(this.filePath, "utf8");
      return JSON.parse(raw);
    } catch (error) {
      if (typeof error === "object" && error && "code" in error && error.code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }
  async save(input) {
    const normalized = normalizeCenterConfig(input);
    const current = await this.load();
    const next = {
      ...normalized,
      deviceId: current?.deviceId ?? randomUUID()
    };
    await mkdir(this.userDataDir, { recursive: true });
    await writeFile(this.filePath, JSON.stringify(next, null, 2), "utf8");
    return next;
  }
}
const configStore = new DesktopConfigStore(app.getPath("userData"));
function createWindow() {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1100,
    minHeight: 700,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  const rendererUrl = process.env.ELECTRON_RENDERER_URL;
  if (rendererUrl) {
    void win.loadURL(rendererUrl);
  } else {
    void win.loadFile(join(__dirname, "../renderer/index.html"));
  }
}
app.whenReady().then(() => {
  ipcMain.handle("desktop:get-config", () => configStore.load());
  ipcMain.handle("desktop:save-config", (_event, input) => configStore.save(input));
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
