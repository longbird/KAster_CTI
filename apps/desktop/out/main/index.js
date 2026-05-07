import { safeStorage, app, Menu, ipcMain, shell, BrowserWindow, session, Notification, nativeImage, Tray } from "electron";
import { randomUUID, createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { join } from "node:path";
import { readFile, mkdir, writeFile, rm } from "node:fs/promises";
import axios from "axios";
import { createServer } from "node:http";
import { io } from "socket.io-client";
import __cjs_mod__ from "node:module";
const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
const require2 = __cjs_mod__.createRequire(import.meta.url);
class AttentionService {
  constructor(options) {
    this.options = options;
  }
  notifyIncomingCall(input) {
    const notification = new this.options.NotificationCtor({
      title: input.title,
      body: input.body
    });
    notification.on("click", () => {
      this.focusWindow();
    });
    notification.show();
  }
  focusWindow() {
    const win = this.options.getWindow();
    if (!win) {
      return;
    }
    if (win.isMinimized?.()) {
      win.restore();
    }
    win.show();
    win.focus();
  }
}
const DEFAULT_AUDIO_PREFERENCES = {
  inputDeviceId: null,
  outputDeviceId: null,
  ringDeviceId: null,
  echoCancellation: true,
  noiseSuppression: true
};
class AudioPreferencesStore {
  constructor(userDataDir) {
    this.userDataDir = userDataDir;
    this.filePath = join(userDataDir, "audio-preferences.json");
  }
  filePath;
  async load() {
    try {
      const raw = await readFile(this.filePath, "utf8");
      return {
        ...DEFAULT_AUDIO_PREFERENCES,
        ...JSON.parse(raw)
      };
    } catch (error) {
      if (typeof error === "object" && error && "code" in error && error.code === "ENOENT") {
        return DEFAULT_AUDIO_PREFERENCES;
      }
      throw error;
    }
  }
  async save(input) {
    const next = {
      ...DEFAULT_AUDIO_PREFERENCES,
      ...input
    };
    await mkdir(this.userDataDir, { recursive: true });
    await writeFile(this.filePath, JSON.stringify(next, null, 2), "utf8");
    return next;
  }
}
function toDesktopAuthError(error) {
  if (error && typeof error === "object" && "response" in error && error.response && typeof error.response === "object") {
    const response = error.response;
    if (response.status === 401) {
      return new Error("로그인 정보가 올바르지 않습니다. 로그인 ID, 내선, 비밀번호를 확인하세요.");
    }
    if (response.data?.error?.message) {
      return new Error(response.data.error.message);
    }
  }
  return error instanceof Error ? error : new Error("로그인에 실패했습니다.");
}
class DesktopAuthClient {
  http;
  constructor(baseUrl) {
    this.http = axios.create({
      baseURL: `${baseUrl}/api/v1`,
      timeout: 1e4
    });
  }
  async exchangeHandoff(handoffToken) {
    const tokens = await this.requestTokens("/auth/handoff/exchange", { handoffToken });
    return this.hydrateDesktopSession(tokens);
  }
  async refreshSession(refreshToken) {
    const tokens = await this.requestTokens("/auth/refresh", { refreshToken });
    return this.hydrateDesktopSession(tokens);
  }
  async loginWithCredentials(input) {
    const tokens = await this.requestTokens("/auth/login", {
      ...input,
      clientType: "desktop"
    });
    return this.hydrateDesktopSession(tokens);
  }
  async createWebHandoff(accessToken, input) {
    const response = await this.http.post("/auth/web-handoff", input ?? {}, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
    return response.data.data;
  }
  async getDesktopSession(accessToken) {
    const response = await this.http.get("/auth/desktop/session", {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
    return response.data.data;
  }
  async hydrateDesktopSession(tokens) {
    const desktopSession = await this.getDesktopSession(tokens.accessToken);
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      agent: desktopSession.agent,
      softphoneConfig: desktopSession.softphoneConfig
    };
  }
  async requestTokens(path, body) {
    try {
      const response = await this.http.post(path, body);
      return response.data.data;
    } catch (error) {
      throw toDesktopAuthError(error);
    }
  }
}
class DesktopBridgeServer {
  host;
  port;
  server = null;
  address = null;
  startPromise = null;
  handoffStatuses = /* @__PURE__ */ new Map();
  constructor(options) {
    this.host = options?.host ?? "127.0.0.1";
    this.port = options?.port ?? 48125;
  }
  async start() {
    if (this.server && this.address) {
      return;
    }
    if (this.startPromise) {
      await this.startPromise;
      return;
    }
    this.startPromise = this.startInternal();
    try {
      await this.startPromise;
    } finally {
      this.startPromise = null;
    }
  }
  async startInternal() {
    const server = createServer((request, response) => {
      this.handleRequest(request, response);
    });
    try {
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(this.port, this.host, () => {
          server.off("error", reject);
          resolve();
        });
      });
    } catch (error) {
      server.close();
      throw error;
    }
    const address = server.address();
    if (!address || typeof address === "string") {
      server.close();
      throw new Error("Desktop bridge address is unavailable.");
    }
    this.server = server;
    this.address = {
      host: this.host,
      port: address.port
    };
  }
  async stop() {
    if (this.startPromise) {
      await this.startPromise;
    }
    if (!this.server) {
      this.address = null;
      return;
    }
    const server = this.server;
    this.server = null;
    this.address = null;
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        server.off("error", reject);
        resolve();
      });
    });
  }
  getAddress() {
    if (!this.address) {
      throw new Error("Desktop bridge server is not running.");
    }
    return this.address;
  }
  markHandoffStatus(handoffToken, status) {
    if (!handoffToken) {
      return;
    }
    this.handoffStatuses.set(handoffToken, status);
  }
  handleRequest(request, response) {
    const requestUrl = new URL(request.url ?? "/", `http://${this.host}:${this.port}`);
    if (request.method === "GET" && requestUrl.pathname === "/health") {
      const address = this.getAddress();
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({
        ok: true,
        status: "ok",
        app: "kaster-agent-desktop",
        protocol: "kaster-agent",
        host: address.host,
        port: address.port,
        pid: process.pid
      }));
      return;
    }
    if (request.method === "GET" && requestUrl.pathname === "/handoff-status") {
      const handoffToken = requestUrl.searchParams.get("handoffToken") ?? "";
      const status = this.handoffStatuses.get(handoffToken) ?? { state: "unknown" };
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({
        ok: true,
        handoffToken,
        ...status
      }));
      return;
    }
    if (request.method !== "GET") {
      response.writeHead(404, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: false }));
      return;
    }
    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ ok: false }));
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
  "screenpop.customer",
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
  connect(handlers) {
    this.disconnect();
    const socket = io(`${this.options.baseUrl}/ws`, {
      auth: { token: this.options.accessToken },
      transports: ["websocket"]
    });
    EVENT_NAMES.forEach((eventName) => {
      socket.on(eventName, (payload) => {
        handlers.onEvent({
          type: eventName,
          payload
        });
      });
    });
    socket.on("connect", () => {
      handlers.onConnectionState?.({ state: "connected" });
    });
    socket.on("reconnect_attempt", (attempt) => {
      handlers.onConnectionState?.({ state: "reconnecting", reason: `attempt:${attempt}` });
    });
    socket.on("disconnect", (reason) => {
      handlers.onConnectionState?.({ state: "disconnected", reason });
    });
    socket.on("connect_error", (error) => {
      handlers.onConnectionState?.({ state: "error", reason: error.message });
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
  async pickup(callId) {
    return this.sendSimpleCommand(`/calls/${callId}/pickup`);
  }
  async changeAgentStatus(agentId, statusCode) {
    const response = await this.http.post(`/agents/${agentId}/status`, { statusCode });
    return response.data.data;
  }
  async originate(params) {
    const correlationId = randomUUID();
    const response = await this.http.post(
      "/calls/originate",
      params,
      {
        headers: {
          "x-correlation-id": correlationId
        }
      }
    );
    return response.data.data;
  }
  async originateInternal(input) {
    const correlationId = randomUUID();
    const response = await this.http.post(
      "/calls/originate/internal",
      input,
      {
        headers: {
          "x-correlation-id": correlationId
        }
      }
    );
    return response.data.data;
  }
  async getCallerIds() {
    const response = await this.http.get("/me/session");
    const outboundDialOptions = response.data?.data?.outboundDialOptions;
    const callerIds = Array.isArray(outboundDialOptions?.allowedCallerIds) ? outboundDialOptions.allowedCallerIds.filter((value) => typeof value === "string") : [];
    const defaultCallerId = typeof outboundDialOptions?.defaultCallerId === "string" ? outboundDialOptions.defaultCallerId : null;
    return {
      callerIds,
      defaultCallerId: defaultCallerId && callerIds.includes(defaultCallerId) ? defaultCallerId : callerIds[0] ?? null
    };
  }
  async getAgentDirectory() {
    const response = await this.http.get("/agents");
    const raw = response.data?.data;
    const rows = Array.isArray(raw?.agents) ? raw.agents : Array.isArray(raw) ? raw : [];
    return rows.map((agent) => ({
      agentId: agent.agentId ?? "",
      agentName: agent.agentName ?? "",
      extension: agent.extension ?? "",
      role: agent.role ?? "agent",
      isActive: agent.isActive !== false,
      loginStatus: agent.loginStatus ?? "UNKNOWN",
      sipRegistration: {
        registered: agent.sipRegistration?.registered === true,
        registrationStatus: agent.sipRegistration?.registrationStatus ?? "UNKNOWN",
        contactUri: agent.sipRegistration?.contactUri ?? null,
        userAgent: agent.sipRegistration?.userAgent ?? null,
        roundtripUsec: agent.sipRegistration?.roundtripUsec ?? null
      },
      canCall: agent.canCall === true,
      currentStatus: agent.currentStatus?.statusCode ? { statusCode: agent.currentStatus.statusCode } : null
    }));
  }
  async getCallHistory() {
    const response = await this.http.get("/calls/history");
    const rows = Array.isArray(response.data?.data) ? response.data.data : [];
    return rows.map((row) => ({
      callId: row.callId ?? "",
      ani: row.ani ?? null,
      dnis: row.dnis ?? null,
      didNumber: row.didNumber ?? null,
      representativeNumber: row.representativeNumber ?? null,
      queueName: row.queueName ?? null,
      sessionStatus: row.sessionStatus ?? "",
      direction: row.direction ?? null,
      startedAt: String(row.startedAt ?? ""),
      answeredAt: row.answeredAt ? String(row.answeredAt) : null,
      endedAt: row.endedAt ? String(row.endedAt) : null,
      talkSeconds: typeof row.talkSeconds === "number" ? row.talkSeconds : null,
      waitSeconds: typeof row.waitSeconds === "number" ? row.waitSeconds : null,
      primaryAgent: row.primaryAgent?.agentName ? { agentName: row.primaryAgent.agentName } : null,
      customer: row.customer?.customerName ? { customerName: row.customer.customerName } : null
    }));
  }
  async hold(callId) {
    return this.sendSimpleCommand(`/calls/${callId}/hold`);
  }
  async resume(callId) {
    return this.sendSimpleCommand(`/calls/${callId}/resume`);
  }
  async transfer(callId, params) {
    const correlationId = randomUUID();
    const response = await this.http.post(
      `/calls/${callId}/transfer`,
      params,
      {
        headers: {
          "x-correlation-id": correlationId
        }
      }
    );
    return response.data.data;
  }
  async cancelAttendedTransfer(callId) {
    return this.sendSimpleCommand(`/calls/${callId}/transfer/attended/cancel`);
  }
  async completeAttendedTransfer(callId) {
    return this.sendSimpleCommand(`/calls/${callId}/transfer/attended/complete`);
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
function invalidProtocolPayload() {
  throw new Error("Invalid protocol payload");
}
function normalizeServerUrl(raw) {
  const trimmed = raw?.trim();
  if (!trimmed) {
    invalidProtocolPayload();
  }
  let url;
  try {
    url = new URL(trimmed);
  } catch {
    invalidProtocolPayload();
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    invalidProtocolPayload();
  }
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}
function parseProtocolPayload(input) {
  let url;
  try {
    url = new URL(input);
  } catch {
    invalidProtocolPayload();
  }
  if (url.protocol !== "kaster-agent:") {
    invalidProtocolPayload();
  }
  const route = (url.host || url.pathname.replace(/^\/+/, "")).trim().toLowerCase();
  if (route === "ping") {
    return { type: "ping" };
  }
  if (route !== "connect") {
    invalidProtocolPayload();
  }
  const handoffToken = url.searchParams.get("handoffToken")?.trim();
  if (!handoffToken) {
    invalidProtocolPayload();
  }
  const channel = url.searchParams.get("channel")?.trim() || void 0;
  return {
    type: "connect",
    serverUrl: normalizeServerUrl(url.searchParams.get("serverUrl")),
    handoffToken,
    ...channel ? { channel } : {}
  };
}
class ProtocolConnectInbox {
  pending = [];
  listener = null;
  ready = false;
  enqueue(payload) {
    if (!this.listener || !this.ready) {
      this.pending.push(payload);
      return;
    }
    this.listener(payload);
  }
  attach(listener) {
    this.listener = listener;
    this.flush();
  }
  markReady() {
    this.ready = true;
    this.flush();
  }
  reset() {
    this.listener = null;
    this.ready = false;
  }
  flush() {
    if (!this.listener || !this.ready || this.pending.length === 0) {
      return;
    }
    const queued = this.pending.splice(0, this.pending.length);
    queued.forEach((payload) => {
      this.listener?.(payload);
    });
  }
}
class RuntimeSupervisor {
  constructor(options) {
    this.options = options;
  }
  runtime = null;
  recoveryScheduled = false;
  async connect() {
    const config = await this.options.loadConfig();
    const session2 = await this.options.loadSession();
    if (!config || !session2) {
      throw new Error("Desktop runtime prerequisites are missing.");
    }
    this.startRuntime(config, session2);
  }
  disconnect() {
    this.runtime?.disconnect();
    this.runtime = null;
  }
  startRuntime(config, session2) {
    this.runtime?.disconnect();
    this.runtime = this.options.createRuntime({
      baseUrl: config.serverUrl,
      accessToken: session2.accessToken
    });
    this.runtime.connect({
      onEvent: (event) => this.options.broadcast(event),
      onConnectionState: (payload) => {
        this.options.broadcast({
          type: "runtime.connection.changed",
          payload
        });
        if (payload.state === "disconnected" || payload.state === "error") {
          this.scheduleRecovery();
        }
      }
    });
  }
  scheduleRecovery() {
    if (this.recoveryScheduled) {
      return;
    }
    this.recoveryScheduled = true;
    this.options.scheduleRecovery(async () => {
      this.recoveryScheduled = false;
      await this.recover();
    });
  }
  async recover() {
    const config = await this.options.loadConfig();
    const storedSession = await this.options.loadSession();
    if (!config || !storedSession) {
      return;
    }
    let session2 = storedSession;
    try {
      session2 = await this.options.refreshSession(storedSession);
      await this.options.saveSession(session2);
    } catch {
      session2 = storedSession;
    }
    this.startRuntime(config, session2);
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
  async save(session2) {
    await mkdir(this.userDataDir, { recursive: true });
    const payload = this.encode(JSON.stringify(session2));
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
class TrayService {
  constructor(options) {
    this.options = options;
  }
  tray = null;
  attach(window) {
    if (!this.tray) {
      this.tray = new this.options.TrayCtor(this.options.icon);
      this.tray.setToolTip("KAster CTI Agent");
      this.tray.setContextMenu(
        this.options.buildFromTemplate([
          {
            label: "열기",
            click: () => this.showWindow(window)
          },
          {
            label: "종료",
            click: () => this.options.onQuitRequested()
          }
        ])
      );
      this.tray.on("click", () => this.showWindow(window));
    }
    window.on("minimize", (event) => {
      event.preventDefault();
      window.hide();
    });
    window.on("close", (event) => {
      event.preventDefault();
      window.hide();
    });
  }
  showWindow(window) {
    if (window.isMinimized?.()) {
      window.restore();
    }
    if (!window.isVisible?.() || window.isMinimized?.()) {
      window.show();
    } else {
      window.show();
    }
    window.focus();
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
function compareVersion(left, right) {
  const leftParts = left.split(/[.-]/).map((part) => Number.parseInt(part, 10) || 0);
  const rightParts = right.split(/[.-]/).map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
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
    const data = manifest.data.data ?? null;
    if (!data || compareVersion(data.latestVersion, params.currentVersion) <= 0) {
      return null;
    }
    return data;
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
    const session2 = await this.http.post("/agent-updates/session", {
      deviceId,
      currentVersion
    });
    return session2.data.data.updateSessionToken;
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
const audioPreferencesStore = new AudioPreferencesStore(app.getPath("userData"));
const tokenVault = new TokenVault(app.getPath("userData"));
const attentionService = new AttentionService({
  getWindow: () => BrowserWindow.getAllWindows()[0] ?? null,
  NotificationCtor: Notification
});
const desktopBridgeServer = new DesktopBridgeServer();
const protocolConnectInbox = new ProtocolConnectInbox();
let runtime = null;
let isQuitting = false;
let trayService = null;
let runtimeSupervisor = null;
let primaryWindow = null;
const historyOriginateRequests = /* @__PURE__ */ new Map();
let preparedUpdate = null;
const DESKTOP_WINDOW_BOUNDS = {
  idle: { width: 440, height: 560, minWidth: 420, minHeight: 520 },
  ringing: { width: 440, height: 420, minWidth: 400, minHeight: 380 },
  talking: { width: 460, height: 620, minWidth: 420, minHeight: 540 },
  transferring: { width: 500, height: 640, minWidth: 440, minHeight: 560 },
  afterCall: { width: 460, height: 520, minWidth: 420, minHeight: 460 },
  settings: { width: 560, height: 720, minWidth: 500, minHeight: 640 }
};
function normalizeDesktopWindowMode(mode) {
  if (mode === "compact") {
    return "idle";
  }
  if (mode === "full") {
    return "settings";
  }
  return mode;
}
function getPrimaryWindow() {
  if (primaryWindow && !primaryWindow.isDestroyed()) {
    return primaryWindow;
  }
  return BrowserWindow.getAllWindows().find((win) => {
    const title = win.getTitle();
    return title !== getUtilityWindowTitle("history") && title !== getUtilityWindowTitle("agents");
  }) ?? null;
}
function getUtilityWindowTitle(kind) {
  return kind === "history" ? "KAster 통화내역" : "KAster 상담원 리스트";
}
function openUtilityWindow(kind) {
  const title = getUtilityWindowTitle(kind);
  const existing = BrowserWindow.getAllWindows().find((win2) => win2.getTitle() === title);
  if (existing) {
    existing.show();
    existing.focus();
    return;
  }
  const bounds = kind === "history" ? { width: 920, height: 640, minWidth: 760, minHeight: 520 } : { width: 440, height: 560, minWidth: 380, minHeight: 460 };
  const win = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    minWidth: bounds.minWidth,
    minHeight: bounds.minHeight,
    webPreferences: {
      preload: join(__dirname, "../preload/index.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  win.setTitle(title);
  win.setMenuBarVisibility(false);
  const rendererUrl = process.env.ELECTRON_RENDERER_URL;
  const route = kind === "history" ? "#/history-popup" : "#/agent-list-popup";
  if (rendererUrl) {
    void win.loadURL(`${rendererUrl}${route}`);
    return;
  }
  void win.loadFile(join(__dirname, "../renderer/index.html"), { hash: route.slice(1) });
}
function getProtocolArg(argv) {
  return argv.find((value) => value.startsWith("kaster-agent://")) ?? null;
}
function resolveProtocolConnect(argv) {
  const protocolArg = getProtocolArg(argv);
  if (!protocolArg) {
    return null;
  }
  try {
    const payload = parseProtocolPayload(protocolArg);
    return payload.type === "connect" ? payload : null;
  } catch {
    return null;
  }
}
function enqueueProtocolConnect(payload) {
  desktopBridgeServer.markHandoffStatus(payload.handoffToken, {
    state: "pending"
  });
  protocolConnectInbox.enqueue(payload);
}
function flushProtocolConnectPayloads() {
  const win = getPrimaryWindow();
  if (!win) {
    return;
  }
  protocolConnectInbox.attach((payload) => {
    win.webContents.send("desktop:protocol-connect", payload);
  });
}
function focusPrimaryWindow() {
  const win = getPrimaryWindow();
  if (!win) {
    return;
  }
  if (win.isMinimized()) {
    win.restore();
  }
  win.show();
  win.focus();
}
function registerProtocolClient() {
  if (process.defaultApp && process.argv.length >= 2) {
    app.setAsDefaultProtocolClient("kaster-agent", process.execPath, [process.argv[1]]);
    return;
  }
  app.setAsDefaultProtocolClient("kaster-agent");
}
function ensureDesktopBridgeServer() {
  void desktopBridgeServer.start().catch(() => {
  });
}
function allowMediaPermissions() {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === "media");
  });
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    return permission === "media";
  });
}
function joinBaseUrlAndPath(baseUrl, path) {
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}
function toSessionSummary(session2) {
  if (!session2) {
    return null;
  }
  return {
    agent: session2.agent,
    softphoneConfig: session2.softphoneConfig
  };
}
function createWindow() {
  ensureDesktopBridgeServer();
  protocolConnectInbox.reset();
  const trayIcon = createTrayIcon();
  const initialBounds = DESKTOP_WINDOW_BOUNDS.idle;
  const win = new BrowserWindow({
    width: initialBounds.width,
    height: initialBounds.height,
    minWidth: initialBounds.minWidth,
    minHeight: initialBounds.minHeight,
    icon: trayIcon,
    webPreferences: {
      preload: join(__dirname, "../preload/index.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  primaryWindow = win;
  win.on("closed", () => {
    if (primaryWindow === win) {
      primaryWindow = null;
    }
  });
  win.setMenuBarVisibility(false);
  const rendererUrl = process.env.ELECTRON_RENDERER_URL;
  if (rendererUrl) {
    void win.loadURL(rendererUrl);
  } else {
    void win.loadFile(join(__dirname, "../renderer/index.html"));
  }
  trayService ??= new TrayService({
    TrayCtor: Tray,
    buildFromTemplate: (template) => Menu.buildFromTemplate(template),
    icon: trayIcon,
    onQuitRequested: () => {
      isQuitting = true;
      app.quit();
    }
  });
  attachTrayBehavior(win);
}
function applyWindowMode(mode) {
  const win = getPrimaryWindow();
  if (!win) {
    return;
  }
  const bounds = DESKTOP_WINDOW_BOUNDS[normalizeDesktopWindowMode(mode)];
  win.setMinimumSize(bounds.minWidth, bounds.minHeight);
  win.setSize(bounds.width, bounds.height);
}
function createTrayIcon() {
  const packagedIconPath = join(process.resourcesPath, "icon.png");
  const devIconPath = join(app.getAppPath(), "build", "icon.png");
  const resolvedIconPath = app.isPackaged ? packagedIconPath : devIconPath;
  if (existsSync(resolvedIconPath)) {
    const fileIcon = nativeImage.createFromPath(resolvedIconPath);
    if (!fileIcon.isEmpty()) {
      return fileIcon;
    }
  }
  const dataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAQAAAC1+jfqAAAA4ElEQVR4AWP4TwAw/P//PwMlgImB4T8DA8P//38Ghv9MDEwM/5kYGBj+M2BiYPrPwMDA8J+BgYHhPwMDA+N/BgYGhv8MDAwM/2dgYGD4z8DAwPCfgYGB4T8DAwPjfwYGBob/DAwMDP9nYGBg+M/AwMDwn4GBgeE/AwMD438GBgaG/wwMDAz/Z2BgYPjPwMDA8J+BgYHhPwMDA+N/BgYGhv8MDAwM/2dgYGD4z8DAwPCfgYGB4T8DAwPjfwYGBob/DAwMDP8ZGBj4P4QBEQAA//9EQBsy9A8nGAAAAABJRU5ErkJggg==";
  return nativeImage.createFromDataURL(dataUrl);
}
function attachTrayBehavior(win) {
  let allowClose = false;
  win.on("close", (event) => {
    if (isQuitting || allowClose) {
      return;
    }
    event.preventDefault();
    win.hide();
  });
  trayService?.attach({
    on: (eventName, listener) => {
      if (eventName === "close") {
        return;
      }
      win.on(eventName, listener);
    },
    hide: () => win.hide(),
    show: () => win.show(),
    focus: () => win.focus(),
    isVisible: () => win.isVisible(),
    isMinimized: () => win.isMinimized(),
    restore: () => win.restore()
  });
  app.once("before-quit", () => {
    isQuitting = true;
    allowClose = true;
  });
}
async function loginDesktopSession(input) {
  const normalizedConfig = normalizeCenterConfig({
    serverUrl: input.serverUrl,
    channel: input.channel
  });
  const authClient = new DesktopAuthClient(normalizedConfig.serverUrl);
  const session2 = await authClient.loginWithCredentials({
    loginId: input.loginId,
    password: input.password,
    extension: input.extension
  });
  const result = {
    session: toSessionSummary(session2)
  };
  if (input.createWebHandoff) {
    const webHandoff = await authClient.createWebHandoff(session2.accessToken, {
      redirectPath: input.redirectPath
    });
    result.webHandoff = {
      ...webHandoff,
      ...webHandoff.redirectPath ? {
        url: `${joinBaseUrlAndPath(input.webBaseUrl ?? config.serverUrl, webHandoff.redirectPath)}?token=${encodeURIComponent(webHandoff.handoffToken)}`
      } : {}
    };
  }
  const config = await configStore.save(normalizedConfig);
  await tokenVault.save(session2);
  return result;
}
async function connectDesktopProtocol(payload) {
  const normalizedConfig = normalizeCenterConfig({
    serverUrl: payload.serverUrl,
    channel: payload.channel
  });
  const authClient = new DesktopAuthClient(normalizedConfig.serverUrl);
  const session2 = await authClient.exchangeHandoff(payload.handoffToken);
  await configStore.save(normalizedConfig);
  await tokenVault.save(session2);
  desktopBridgeServer.markHandoffStatus(payload.handoffToken, {
    state: "connected"
  });
  return toSessionSummary(session2);
}
const singleInstanceLock = app.requestSingleInstanceLock();
if (!singleInstanceLock) {
  app.quit();
}
app.on("second-instance", (_event, argv) => {
  const payload = resolveProtocolConnect(argv);
  if (!payload) {
    focusPrimaryWindow();
    return;
  }
  focusPrimaryWindow();
  enqueueProtocolConnect(payload);
});
app.on("open-url", (event, url) => {
  event.preventDefault();
  try {
    const payload = parseProtocolPayload(url);
    if (payload.type === "connect") {
      enqueueProtocolConnect(payload);
      focusPrimaryWindow();
    }
  } catch {
  }
});
app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  registerProtocolClient();
  allowMediaPermissions();
  ensureDesktopBridgeServer();
  const startupProtocolConnect = resolveProtocolConnect(process.argv);
  if (startupProtocolConnect) {
    enqueueProtocolConnect(startupProtocolConnect);
  }
  ipcMain.handle("desktop:get-config", () => configStore.load());
  ipcMain.handle("desktop:set-window-mode", (_event, mode) => {
    applyWindowMode(mode);
  });
  ipcMain.handle("desktop:save-config", (_event, input) => configStore.save(input));
  ipcMain.handle("desktop:get-audio-preferences", () => audioPreferencesStore.load());
  ipcMain.handle("desktop:save-audio-preferences", (_event, input) => audioPreferencesStore.save(input));
  ipcMain.handle("desktop:get-session", async () => toSessionSummary(await tokenVault.load()));
  ipcMain.handle("desktop:get-desktop-session", async (_event, accessToken) => {
    const config = await configStore.load();
    if (!config) {
      throw new Error("Center config is missing.");
    }
    const session2 = accessToken ? { accessToken } : await tokenVault.load();
    if (!session2?.accessToken) {
      throw new Error("Desktop access token is missing.");
    }
    const authClient = new DesktopAuthClient(config.serverUrl);
    return authClient.getDesktopSession(session2.accessToken);
  });
  ipcMain.handle("desktop:exchange-handoff", async (_event, handoffToken) => {
    const config = await configStore.load();
    if (!config) {
      throw new Error("Center config is missing.");
    }
    const authClient = new DesktopAuthClient(config.serverUrl);
    const session2 = await authClient.exchangeHandoff(handoffToken);
    await tokenVault.save(session2);
    return toSessionSummary(session2);
  });
  ipcMain.handle("desktop:login", (_event, input) => loginDesktopSession(input));
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
    const session2 = await authClient.refreshSession(current.refreshToken);
    await tokenVault.save(session2);
    return toSessionSummary(session2);
  });
  ipcMain.handle("desktop:connect-with-protocol", (_event, payload) => {
    return connectDesktopProtocol(payload).catch((error) => {
      desktopBridgeServer.markHandoffStatus(payload.handoffToken, {
        state: "failed",
        reason: error instanceof Error ? error.message : "connect failed"
      });
      throw error;
    });
  });
  ipcMain.handle("desktop:protocol-connect-ready", () => {
    protocolConnectInbox.markReady();
    flushProtocolConnectPayloads();
  });
  ipcMain.handle("desktop:connect-runtime", async () => {
    runtimeSupervisor ??= new RuntimeSupervisor({
      loadConfig: () => configStore.load(),
      loadSession: () => tokenVault.load(),
      saveSession: (session2) => tokenVault.save(session2),
      refreshSession: async (session2) => {
        const config = await configStore.load();
        if (!config) {
          throw new Error("Center config is missing.");
        }
        const authClient = new DesktopAuthClient(config.serverUrl);
        return authClient.refreshSession(session2.refreshToken);
      },
      createRuntime: (input) => {
        runtime = new CtiRuntime(input);
        return runtime;
      },
      broadcast: (event) => {
        BrowserWindow.getAllWindows().forEach((win) => {
          win.webContents.send("desktop:event", event);
        });
      },
      scheduleRecovery: (task) => {
        setTimeout(() => {
          void task();
        }, 2e3);
      }
    });
    await runtimeSupervisor.connect();
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
  ipcMain.handle("desktop:pickup", (_event, callId) => {
    if (!runtime) {
      throw new Error("Runtime is not connected.");
    }
    return runtime.pickup(callId);
  });
  ipcMain.handle("desktop:change-agent-status", (_event, agentId, statusCode) => {
    if (!runtime) {
      throw new Error("Runtime is not connected.");
    }
    return runtime.changeAgentStatus(agentId, statusCode);
  });
  ipcMain.handle("desktop:originate", (_event, params) => {
    if (!runtime) {
      throw new Error("Runtime is not connected.");
    }
    return runtime.originate(params);
  });
  ipcMain.handle("desktop:originate-internal", (_event, input) => {
    if (!runtime) {
      throw new Error("Runtime is not connected.");
    }
    return runtime.originateInternal(input);
  });
  ipcMain.handle("desktop:get-caller-ids", () => {
    if (!runtime) {
      return { callerIds: [], defaultCallerId: null };
    }
    return runtime.getCallerIds();
  });
  ipcMain.handle("desktop:get-agent-directory", () => {
    if (!runtime) {
      return [];
    }
    return runtime.getAgentDirectory();
  });
  ipcMain.handle("desktop:get-call-history", () => {
    if (!runtime) {
      return [];
    }
    return runtime.getCallHistory();
  });
  ipcMain.handle("desktop:request-history-originate", (_event, input) => {
    const win = getPrimaryWindow();
    const phoneNumber = input.phoneNumber?.trim();
    if (!win || !phoneNumber) {
      throw new Error("상담원 화면으로 발신 요청을 전달할 수 없습니다.");
    }
    const requestId = randomUUID();
    focusPrimaryWindow();
    win.webContents.send("desktop:history-originate-request", { requestId, phoneNumber });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        historyOriginateRequests.delete(requestId);
        reject(new Error("발신 요청 응답 시간이 초과되었습니다."));
      }, 15e3);
      historyOriginateRequests.set(requestId, { resolve, reject, timer });
    });
  });
  ipcMain.handle("desktop:complete-history-originate", (_event, input) => {
    const pending = historyOriginateRequests.get(input.requestId);
    if (!pending) {
      return;
    }
    clearTimeout(pending.timer);
    historyOriginateRequests.delete(input.requestId);
    pending.resolve(input);
  });
  ipcMain.handle("desktop:open-call-history-popup", () => {
    openUtilityWindow("history");
  });
  ipcMain.handle("desktop:open-agent-list-popup", () => {
    openUtilityWindow("agents");
  });
  ipcMain.handle("desktop:transfer", (_event, callId, params) => {
    if (!runtime) {
      throw new Error("Runtime is not connected.");
    }
    return runtime.transfer(callId, params);
  });
  ipcMain.handle("desktop:cancel-attended-transfer", (_event, callId) => {
    if (!runtime) {
      throw new Error("Runtime is not connected.");
    }
    return runtime.cancelAttendedTransfer(callId);
  });
  ipcMain.handle("desktop:complete-attended-transfer", (_event, callId) => {
    if (!runtime) {
      throw new Error("Runtime is not connected.");
    }
    return runtime.completeAttendedTransfer(callId);
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
    const session2 = await tokenVault.load();
    if (!config || !session2) {
      return null;
    }
    const client = new UpdateClient(config.serverUrl, session2.accessToken);
    return client.pollManifest({
      deviceId: config.deviceId,
      currentVersion: app.getVersion(),
      channel: config.channel
    });
  });
  ipcMain.handle("desktop:prepare-update", async () => {
    const config = await configStore.load();
    const session2 = await tokenVault.load();
    if (!config || !session2) {
      return null;
    }
    const client = new UpdateClient(
      config.serverUrl,
      session2.accessToken,
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
  ipcMain.handle("desktop:notify-incoming-call", (_event, input) => {
    attentionService.notifyIncomingCall(input);
  });
  ipcMain.handle("desktop:focus-window", () => {
    attentionService.focusWindow();
  });
  ipcMain.handle("desktop:open-external", (_event, url) => {
    return shell.openExternal(url);
  });
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});
app.on("window-all-closed", () => {
  runtimeSupervisor?.disconnect();
  runtime?.disconnect();
  if (process.platform !== "darwin") {
    app.quit();
  }
});
app.on("before-quit", () => {
  void desktopBridgeServer.stop();
});
