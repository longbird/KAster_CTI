import { safeStorage, app, ipcMain, BrowserWindow, shell } from "electron";
import { join } from "node:path";
import axios from "axios";
import { randomUUID, createHash } from "node:crypto";
import { readFile, mkdir, writeFile, rm } from "node:fs/promises";
import { io } from "socket.io-client";
import { createReadStream } from "node:fs";
import __cjs_mod__ from "node:module";
const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
const require2 = __cjs_mod__.createRequire(import.meta.url);
class DesktopAuthClient {
  http;
  constructor(baseUrl) {
    this.http = axios.create({
      baseURL: `${baseUrl}/api/v1`,
      timeout: 1e4
    });
  }
  async exchangeHandoff(handoffToken) {
    return this.requestSession("/auth/handoff/exchange", { handoffToken });
  }
  async refreshSession(refreshToken) {
    return this.requestSession("/auth/refresh", { refreshToken });
  }
  async requestSession(path, body) {
    const response = await this.http.post(path, body);
    return response.data.data;
  }
}
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
const EVENT_NAMES = [
  "call.created",
  "call.updated",
  "call.ended",
  "agent.status.changed",
  "queue.summary.updated"
];
class CtiRuntime {
  constructor(options) {
    this.options = options;
    this.http = axios.create({
      baseURL: `${options.baseUrl}/api/v1`,
      timeout: 1e4,
      headers: {
        Authorization: `Bearer ${options.accessToken}`
      }
    });
  }
  http;
  socket = null;
  connect(listener) {
    this.disconnect();
    const socket = io(`${this.options.baseUrl}/ws`, {
      auth: { token: this.options.accessToken },
      transports: ["websocket"]
    });
    EVENT_NAMES.forEach((eventName) => {
      socket.on(eventName, (payload) => {
        listener({
          type: eventName,
          payload
        });
      });
    });
    this.socket = socket;
  }
  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
  }
  async mute(callId, state) {
    const correlationId = randomUUID();
    const response = await this.http.post(
      `/calls/${callId}/mute`,
      { state, direction: "all" },
      {
        headers: {
          "x-correlation-id": correlationId
        }
      }
    );
    return response.data.data;
  }
  async hangup(callId) {
    const correlationId = randomUUID();
    const response = await this.http.post(
      `/calls/${callId}/hangup`,
      {},
      {
        headers: {
          "x-correlation-id": correlationId
        }
      }
    );
    return response.data.data;
  }
  async hold(callId) {
    return this.sendSimpleCommand(`/calls/${callId}/hold`);
  }
  async resume(callId) {
    return this.sendSimpleCommand(`/calls/${callId}/resume`);
  }
  async sendSimpleCommand(path) {
    const correlationId = randomUUID();
    const response = await this.http.post(
      path,
      {},
      {
        headers: {
          "x-correlation-id": correlationId
        }
      }
    );
    return response.data.data;
  }
}
class TokenVault {
  constructor(userDataDir) {
    this.userDataDir = userDataDir;
    this.filePath = join(userDataDir, "desktop-session.bin");
  }
  filePath;
  async load() {
    try {
      const raw = await readFile(this.filePath);
      const json = this.decode(raw);
      return JSON.parse(json);
    } catch {
      return null;
    }
  }
  async save(session) {
    await mkdir(this.userDataDir, { recursive: true });
    const payload = this.encode(JSON.stringify(session));
    await writeFile(this.filePath, payload);
  }
  async clear() {
    await rm(this.filePath, { force: true });
  }
  encode(json) {
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.encryptString(json);
    }
    return Buffer.from(json, "utf8");
  }
  decode(raw) {
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(raw);
    }
    return raw.toString("utf8");
  }
}
async function persistArtifact(tempDir, fileName, payload) {
  await mkdir(tempDir, { recursive: true });
  const filePath = join(tempDir, fileName);
  await writeFile(filePath, payload);
  return filePath;
}
async function verifySha256(filePath, expectedSha256) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve());
    stream.on("error", reject);
  });
  return hash.digest("hex") === expectedSha256;
}
class UpdateClient {
  constructor(baseUrl, accessToken, artifactTempDir) {
    this.artifactTempDir = artifactTempDir;
    this.http = axios.create({
      baseURL: `${baseUrl}/api/v1`,
      timeout: 15e3,
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
  }
  http;
  async pollManifest(params) {
    const sessionToken = await this.createUpdateSession(params.deviceId, params.currentVersion);
    const manifest = await this.http.get("/agent-updates/manifest", {
      headers: {
        Authorization: `Bearer ${sessionToken}`
      },
      params: {
        currentVersion: params.currentVersion,
        channel: params.channel
      }
    });
    return manifest.data.data ?? null;
  }
  async prepareUpdate(params) {
    if (!this.artifactTempDir) {
      throw new Error("Artifact temp directory is missing.");
    }
    const manifest = await this.pollManifest(params);
    const artifact = manifest?.artifacts?.[0];
    if (!manifest || !artifact) {
      return null;
    }
    const sessionToken = await this.createUpdateSession(params.deviceId, params.currentVersion);
    const downloadInit = await this.http.post(
      "/agent-updates/download-init",
      {
        artifactId: artifact.artifactId,
        currentVersion: params.currentVersion
      },
      {
        headers: {
          Authorization: `Bearer ${sessionToken}`
        }
      }
    );
    const downloadData = downloadInit.data.data;
    await this.report({
      eventType: "download_started",
      currentAppVersion: params.currentVersion,
      targetVersion: downloadData.version,
      artifactId: downloadData.artifactId,
      metadata: { channel: params.channel }
    });
    const artifactResponse = await this.http.get(this.normalizeArtifactUrl(downloadData.downloadUrl), {
      headers: {
        Authorization: `Bearer ${downloadData.downloadToken}`
      },
      responseType: "arraybuffer"
    });
    const filePath = await persistArtifact(
      this.artifactTempDir,
      artifact.fileName,
      new Uint8Array(artifactResponse.data)
    );
    const verified = await verifySha256(filePath, downloadData.sha256);
    await this.report({
      eventType: verified ? "download_completed" : "install_failed",
      currentAppVersion: params.currentVersion,
      targetVersion: downloadData.version,
      artifactId: downloadData.artifactId,
      metadata: verified ? { filePath } : { filePath, reason: "sha256_mismatch" }
    });
    return {
      version: downloadData.version,
      fileName: artifact.fileName,
      filePath,
      verified,
      mandatory: manifest.mandatory
    };
  }
  async createUpdateSession(deviceId, currentVersion) {
    const session = await this.http.post("/agent-updates/session", {
      deviceId,
      currentVersion
    });
    return session.data.data.updateSessionToken;
  }
  async report(params) {
    await this.http.post("/agent-updates/report", params);
  }
  normalizeArtifactUrl(downloadUrl) {
    if (downloadUrl.startsWith("/api/v1/")) {
      return downloadUrl.replace(/^\/api\/v1/, "");
    }
    if (downloadUrl.startsWith("/agent-updates/")) {
      return downloadUrl;
    }
    return `/agent-updates/${downloadUrl.replace(/^\/+/, "")}`;
  }
}
const configStore = new DesktopConfigStore(app.getPath("userData"));
const tokenVault = new TokenVault(app.getPath("userData"));
let runtime = null;
let preparedUpdate = null;
function toSessionSummary(session) {
  if (!session) {
    return null;
  }
  return {
    agent: session.agent
  };
}
function createWindow() {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1100,
    minHeight: 700,
    webPreferences: {
      preload: join(__dirname, "../preload/index.mjs"),
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
  ipcMain.handle("desktop:get-session", async () => toSessionSummary(await tokenVault.load()));
  ipcMain.handle("desktop:exchange-handoff", async (_event, handoffToken) => {
    const config = await configStore.load();
    if (!config) {
      throw new Error("Center config is missing.");
    }
    const authClient = new DesktopAuthClient(config.serverUrl);
    const session = await authClient.exchangeHandoff(handoffToken);
    await tokenVault.save(session);
    return toSessionSummary(session);
  });
  ipcMain.handle("desktop:refresh-session", async () => {
    const config = await configStore.load();
    if (!config) {
      throw new Error("Center config is missing.");
    }
    const current = await tokenVault.load();
    if (!current) {
      return null;
    }
    const authClient = new DesktopAuthClient(config.serverUrl);
    const session = await authClient.refreshSession(current.refreshToken);
    await tokenVault.save(session);
    return toSessionSummary(session);
  });
  ipcMain.handle("desktop:connect-runtime", async () => {
    const config = await configStore.load();
    const session = await tokenVault.load();
    if (!config || !session) {
      throw new Error("Desktop runtime prerequisites are missing.");
    }
    runtime?.disconnect();
    runtime = new CtiRuntime({
      baseUrl: config.serverUrl,
      accessToken: session.accessToken
    });
    runtime.connect((event) => {
      BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send("desktop:event", event);
      });
    });
  });
  ipcMain.handle("desktop:mute", (_event, callId, state) => {
    if (!runtime) {
      throw new Error("Runtime is not connected.");
    }
    return runtime.mute(callId, state);
  });
  ipcMain.handle("desktop:hangup", (_event, callId) => {
    if (!runtime) {
      throw new Error("Runtime is not connected.");
    }
    return runtime.hangup(callId);
  });
  ipcMain.handle("desktop:hold", (_event, callId) => {
    if (!runtime) {
      throw new Error("Runtime is not connected.");
    }
    return runtime.hold(callId);
  });
  ipcMain.handle("desktop:resume", (_event, callId) => {
    if (!runtime) {
      throw new Error("Runtime is not connected.");
    }
    return runtime.resume(callId);
  });
  ipcMain.handle("desktop:check-for-updates", async () => {
    const config = await configStore.load();
    const session = await tokenVault.load();
    if (!config || !session) {
      return null;
    }
    const client = new UpdateClient(config.serverUrl, session.accessToken);
    return client.pollManifest({
      deviceId: config.deviceId,
      currentVersion: app.getVersion(),
      channel: config.channel
    });
  });
  ipcMain.handle("desktop:prepare-update", async () => {
    const config = await configStore.load();
    const session = await tokenVault.load();
    if (!config || !session) {
      return null;
    }
    const client = new UpdateClient(
      config.serverUrl,
      session.accessToken,
      join(app.getPath("temp"), "kaster-agent-updates")
    );
    preparedUpdate = await client.prepareUpdate({
      deviceId: config.deviceId,
      currentVersion: app.getVersion(),
      channel: config.channel
    });
    return preparedUpdate;
  });
  ipcMain.handle("desktop:apply-prepared-update", async () => {
    if (!preparedUpdate?.verified) {
      return null;
    }
    const launchError = await shell.openPath(preparedUpdate.filePath);
    if (launchError) {
      throw new Error(launchError);
    }
    return {
      launched: true,
      filePath: preparedUpdate.filePath
    };
  });
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});
app.on("window-all-closed", () => {
  runtime?.disconnect();
  if (process.platform !== "darwin") {
    app.quit();
  }
});
