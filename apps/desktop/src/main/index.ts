import { app, BrowserWindow, ipcMain, Menu, Notification, Tray, nativeImage, session, shell } from 'electron';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { AttentionService } from './attention-service';
import { AudioPreferencesStore } from './audio-preferences-store';
import { CallPreferencesStore } from './call-preferences-store';
import { TransferHotkeysStore } from './transfer-hotkeys-store';
import { DesktopAuthClient } from './auth-client';
import { DesktopBridgeServer } from './desktop-bridge-server';
import { DesktopConfigStore } from './config-store';
import { CtiRuntime } from './cti-runtime';
import { parseProtocolPayload, ProtocolConnectInbox } from './protocol-payload';
import { RuntimeSupervisor } from './runtime-supervisor';
import { TokenVault } from './token-vault';
import { TrayService } from './tray-service';
import { UpdateClient } from './update-client';
import type {
  DesktopHistoryOriginateResult,
  DesktopProtocolConnectPayload,
  DesktopSaveCallMemoInput,
  DesktopWindowMode,
} from '../shared/ipc';
import { normalizeCenterConfig } from '../shared/center-config';

const configStore = new DesktopConfigStore(app.getPath('userData'));
const audioPreferencesStore = new AudioPreferencesStore(app.getPath('userData'));
const callPreferencesStore = new CallPreferencesStore(app.getPath('userData'));
const transferHotkeysStore = new TransferHotkeysStore(app.getPath('userData'));
const tokenVault = new TokenVault(app.getPath('userData'));
const attentionService = new AttentionService({
  getWindow: () => BrowserWindow.getAllWindows()[0] ?? null,
  NotificationCtor: Notification as unknown as new (options: { title: string; body: string }) => {
    show(): void;
    on(event: 'click', listener: () => void): void;
  },
});
const desktopBridgeServer = new DesktopBridgeServer();
const protocolConnectInbox = new ProtocolConnectInbox();
let runtime: CtiRuntime | null = null;
let isQuitting = false;
let trayService: TrayService | null = null;
let runtimeSupervisor: RuntimeSupervisor | null = null;
let primaryWindow: BrowserWindow | null = null;
const historyOriginateRequests = new Map<string, {
  resolve: (result: DesktopHistoryOriginateResult) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}>();
let preparedUpdate:
  | {
      version: string;
      fileName: string;
      filePath: string;
      verified: boolean;
      mandatory: boolean;
    }
  | null = null;

const DESKTOP_WINDOW_BOUNDS = {
  idle: { width: 440, height: 560, minWidth: 420, minHeight: 520 },
  ringing: { width: 440, height: 420, minWidth: 400, minHeight: 380 },
  talking: { width: 460, height: 620, minWidth: 420, minHeight: 540 },
  transferring: { width: 500, height: 640, minWidth: 440, minHeight: 560 },
  afterCall: { width: 460, height: 520, minWidth: 420, minHeight: 460 },
  settings: { width: 560, height: 720, minWidth: 500, minHeight: 640 },
} as const;

function normalizeDesktopWindowMode(mode: DesktopWindowMode): keyof typeof DESKTOP_WINDOW_BOUNDS {
  if (mode === 'compact') {
    return 'idle';
  }

  if (mode === 'full') {
    return 'settings';
  }

  return mode;
}

function getPrimaryWindow() {
  if (primaryWindow && !primaryWindow.isDestroyed()) {
    return primaryWindow;
  }

  return BrowserWindow.getAllWindows().find((win) => {
    const title = win.getTitle();
    return title !== getUtilityWindowTitle('history') && title !== getUtilityWindowTitle('agents');
  }) ?? null;
}

function getUtilityWindowTitle(kind: 'history' | 'agents') {
  return kind === 'history' ? 'KAster 통화내역' : 'KAster 상담원 리스트';
}

function openUtilityWindow(kind: 'history' | 'agents') {
  const title = getUtilityWindowTitle(kind);
  const existing = BrowserWindow.getAllWindows().find((win) => win.getTitle() === title);
  if (existing) {
    existing.show();
    existing.focus();
    return;
  }

  const bounds = kind === 'history'
    ? { width: 920, height: 640, minWidth: 760, minHeight: 520 }
    : { width: 440, height: 560, minWidth: 380, minHeight: 460 };
  const win = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    minWidth: bounds.minWidth,
    minHeight: bounds.minHeight,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  win.setTitle(title);
  win.setMenuBarVisibility(false);

  const rendererUrl = process.env.ELECTRON_RENDERER_URL;
  const route = kind === 'history' ? '#/history-popup' : '#/agent-list-popup';
  if (rendererUrl) {
    void win.loadURL(`${rendererUrl}${route}`);
    return;
  }

  void win.loadFile(join(__dirname, '../renderer/index.html'), { hash: route.slice(1) });
}

function getProtocolArg(argv: string[]) {
  return argv.find((value) => value.startsWith('kaster-agent://')) ?? null;
}

function resolveProtocolConnect(argv: string[]): DesktopProtocolConnectPayload | null {
  const protocolArg = getProtocolArg(argv);
  if (!protocolArg) {
    return null;
  }

  try {
    const payload = parseProtocolPayload(protocolArg);
    return payload.type === 'connect' ? payload : null;
  } catch {
    return null;
  }
}

function enqueueProtocolConnect(payload: DesktopProtocolConnectPayload) {
  desktopBridgeServer.markHandoffStatus(payload.handoffToken, {
    state: 'pending',
  });
  protocolConnectInbox.enqueue(payload);
}

function flushProtocolConnectPayloads() {
  const win = getPrimaryWindow();
  if (!win) {
    return;
  }

  protocolConnectInbox.attach((payload) => {
    win.webContents.send('desktop:protocol-connect', payload);
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
    app.setAsDefaultProtocolClient('kaster-agent', process.execPath, [process.argv[1]]);
    return;
  }

  app.setAsDefaultProtocolClient('kaster-agent');
}

function ensureDesktopBridgeServer() {
  void desktopBridgeServer.start().catch(() => {
    // Leave presence detection unavailable if the local port is already occupied.
  });
}

function allowMediaPermissions() {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'media');
  });
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    return permission === 'media';
  });
}

function joinBaseUrlAndPath(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

function toSessionSummary(session: Awaited<ReturnType<typeof tokenVault.load>>) {
  if (!session) {
    return null;
  }

  return {
    agent: session.agent,
    softphoneConfig: session.softphoneConfig,
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
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  primaryWindow = win;
  win.on('closed', () => {
    if (primaryWindow === win) {
      primaryWindow = null;
    }
  });
  win.setMenuBarVisibility(false);

  const rendererUrl = process.env.ELECTRON_RENDERER_URL;
  if (rendererUrl) {
    void win.loadURL(rendererUrl);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  trayService ??= new TrayService({
    TrayCtor: Tray,
    buildFromTemplate: (template) => Menu.buildFromTemplate(template),
    icon: trayIcon,
    onQuitRequested: () => {
      isQuitting = true;
      app.quit();
    },
  });
  attachTrayBehavior(win);
}

function applyWindowMode(mode: DesktopWindowMode) {
  const win = getPrimaryWindow();
  if (!win) {
    return;
  }

  const bounds = DESKTOP_WINDOW_BOUNDS[normalizeDesktopWindowMode(mode)];
  win.setMinimumSize(bounds.minWidth, bounds.minHeight);
  win.setSize(bounds.width, bounds.height);
}

function createTrayIcon() {
  const packagedIconPath = join(process.resourcesPath, 'icon.png');
  const devIconPath = join(app.getAppPath(), 'build', 'icon.png');
  const resolvedIconPath = app.isPackaged ? packagedIconPath : devIconPath;
  if (existsSync(resolvedIconPath)) {
    const fileIcon = nativeImage.createFromPath(resolvedIconPath);
    if (!fileIcon.isEmpty()) {
      return fileIcon;
    }
  }

  const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAQAAAC1+jfqAAAA4ElEQVR4AWP4TwAw/P//PwMlgImB4T8DA8P//38Ghv9MDEwM/5kYGBj+M2BiYPrPwMDA8J+BgYHhPwMDA+N/BgYGhv8MDAwM/2dgYGD4z8DAwPCfgYGB4T8DAwPjfwYGBob/DAwMDP9nYGBg+M/AwMDwn4GBgeE/AwMD438GBgaG/wwMDAz/Z2BgYPjPwMDA8J+BgYHhPwMDA+N/BgYGhv8MDAwM/2dgYGD4z8DAwPCfgYGB4T8DAwPjfwYGBob/DAwMDP8ZGBj4P4QBEQAA//9EQBsy9A8nGAAAAABJRU5ErkJggg==';
  return nativeImage.createFromDataURL(dataUrl);
}

function attachTrayBehavior(win: BrowserWindow) {
  let allowClose = false;
  win.on('close', (event) => {
    if (isQuitting || allowClose) {
      return;
    }
    event.preventDefault();
    win.hide();
  });

  trayService?.attach({
    on: (eventName, listener) => {
      if (eventName === 'close') {
        return;
      }
      win.on(eventName, listener as (event: Electron.Event) => void);
    },
    hide: () => win.hide(),
    show: () => win.show(),
    focus: () => win.focus(),
    isVisible: () => win.isVisible(),
    isMinimized: () => win.isMinimized(),
    restore: () => win.restore(),
  });

  app.once('before-quit', () => {
    isQuitting = true;
    allowClose = true;
  });
}

async function loginDesktopSession(input: {
  serverUrl: string;
  loginId: string;
  password: string;
  extension?: string;
  channel?: string;
  webBaseUrl?: string;
  createWebHandoff?: boolean;
  redirectPath?: string;
}) {
  const normalizedConfig = normalizeCenterConfig({
    serverUrl: input.serverUrl,
    channel: input.channel,
  });

  const authClient = new DesktopAuthClient(normalizedConfig.serverUrl);
  const session = await authClient.loginWithCredentials({
    loginId: input.loginId,
    password: input.password,
    extension: input.extension,
  });

  const result: {
    session: ReturnType<typeof toSessionSummary>;
    webHandoff?: {
      handoffToken: string;
      expiresIn: number;
      redirectPath?: string;
      url?: string;
    };
  } = {
    session: toSessionSummary(session),
  };

  if (input.createWebHandoff) {
    const webHandoff = await authClient.createWebHandoff(session.accessToken, {
      redirectPath: input.redirectPath,
    });
    result.webHandoff = {
      ...webHandoff,
      ...(webHandoff.redirectPath
        ? {
            url: `${joinBaseUrlAndPath(input.webBaseUrl ?? config.serverUrl, webHandoff.redirectPath)}?token=${encodeURIComponent(webHandoff.handoffToken)}`,
          }
        : {}),
    };
  }

  const config = await configStore.save(normalizedConfig);
  await tokenVault.save(session);

  return result;
}

async function connectDesktopProtocol(payload: DesktopProtocolConnectPayload) {
  const normalizedConfig = normalizeCenterConfig({
    serverUrl: payload.serverUrl,
    channel: payload.channel,
  });
  const authClient = new DesktopAuthClient(normalizedConfig.serverUrl);
  const session = await authClient.exchangeHandoff(payload.handoffToken);
  await configStore.save(normalizedConfig);
  await tokenVault.save(session);
  desktopBridgeServer.markHandoffStatus(payload.handoffToken, {
    state: 'connected',
  });
  return toSessionSummary(session);
}

const singleInstanceLock = app.requestSingleInstanceLock();
if (!singleInstanceLock) {
  app.quit();
}

app.on('second-instance', (_event, argv) => {
  const payload = resolveProtocolConnect(argv);
  if (!payload) {
    focusPrimaryWindow();
    return;
  }

  focusPrimaryWindow();
  enqueueProtocolConnect(payload);
});

app.on('open-url', (event, url) => {
  event.preventDefault();

  try {
    const payload = parseProtocolPayload(url);
    if (payload.type === 'connect') {
      enqueueProtocolConnect(payload);
      focusPrimaryWindow();
    }
  } catch {
    // Ignore malformed custom protocol payloads.
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

  ipcMain.handle('desktop:get-config', () => configStore.load());
  ipcMain.handle('desktop:set-window-mode', (_event, mode: DesktopWindowMode) => {
    applyWindowMode(mode);
  });
  ipcMain.handle('desktop:save-config', (_event, input) => configStore.save(input));
  ipcMain.handle('desktop:get-audio-preferences', () => audioPreferencesStore.load());
  ipcMain.handle('desktop:save-audio-preferences', (_event, input) => audioPreferencesStore.save(input));
  ipcMain.handle('desktop:get-call-preferences', () => callPreferencesStore.load());
  ipcMain.handle('desktop:save-call-preferences', (_event, input) => callPreferencesStore.save(input));
  ipcMain.handle('desktop:get-transfer-hotkeys', () => transferHotkeysStore.load());
  ipcMain.handle('desktop:save-transfer-hotkeys', (_event, input) => transferHotkeysStore.save(input));
  ipcMain.handle('desktop:get-session', async () => toSessionSummary(await tokenVault.load()));
  ipcMain.handle('desktop:get-desktop-session', async (_event, accessToken?: string) => {
    const config = await configStore.load();
    if (!config) {
      throw new Error('Center config is missing.');
    }

    const session = accessToken ? { accessToken } : await tokenVault.load();
    if (!session?.accessToken) {
      throw new Error('Desktop access token is missing.');
    }

    const authClient = new DesktopAuthClient(config.serverUrl);
    return authClient.getDesktopSession(session.accessToken);
  });
  ipcMain.handle('desktop:exchange-handoff', async (_event, handoffToken: string) => {
    const config = await configStore.load();
    if (!config) {
      throw new Error('Center config is missing.');
    }

    const authClient = new DesktopAuthClient(config.serverUrl);
    const session = await authClient.exchangeHandoff(handoffToken);
    await tokenVault.save(session);
    return toSessionSummary(session);
  });
  ipcMain.handle('desktop:login', (_event, input) => loginDesktopSession(input));
  ipcMain.handle('desktop:refresh-session', async () => {
    const config = await configStore.load();
    if (!config) {
      throw new Error('Center config is missing.');
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
  ipcMain.handle('desktop:connect-with-protocol', (_event, payload: DesktopProtocolConnectPayload) => {
    return connectDesktopProtocol(payload).catch((error) => {
      desktopBridgeServer.markHandoffStatus(payload.handoffToken, {
        state: 'failed',
        reason: error instanceof Error ? error.message : 'connect failed',
      });
      throw error;
    });
  });
  ipcMain.handle('desktop:protocol-connect-ready', () => {
    protocolConnectInbox.markReady();
    flushProtocolConnectPayloads();
  });
  ipcMain.handle('desktop:connect-runtime', async () => {
    runtimeSupervisor ??= new RuntimeSupervisor({
      loadConfig: () => configStore.load(),
      loadSession: () => tokenVault.load(),
      saveSession: (session) => tokenVault.save(session),
      refreshSession: async (session) => {
        const config = await configStore.load();
        if (!config) {
          throw new Error('Center config is missing.');
        }
        const authClient = new DesktopAuthClient(config.serverUrl);
        return authClient.refreshSession(session.refreshToken);
      },
      createRuntime: (input) => {
        runtime = new CtiRuntime(input);
        return runtime;
      },
      broadcast: (event) => {
        BrowserWindow.getAllWindows().forEach((win) => {
          win.webContents.send('desktop:event', event);
        });
      },
      scheduleRecovery: (task) => {
        setTimeout(() => {
          void task();
        }, 2000);
      },
    });
    await runtimeSupervisor.connect();
  });
  ipcMain.handle('desktop:mute', (_event, callId: string, state: 'on' | 'off') => {
    if (!runtime) {
      throw new Error('Runtime is not connected.');
    }
    return runtime.mute(callId, state);
  });
  ipcMain.handle('desktop:hangup', (_event, callId: string) => {
    if (!runtime) {
      throw new Error('Runtime is not connected.');
    }
    return runtime.hangup(callId);
  });
  ipcMain.handle('desktop:pickup', (_event, callId: string) => {
    if (!runtime) {
      throw new Error('Runtime is not connected.');
    }
    return runtime.pickup(callId);
  });
  ipcMain.handle('desktop:change-agent-status', (_event, agentId: string, statusCode, reasonCode?: string) => {
    if (!runtime) {
      throw new Error('Runtime is not connected.');
    }
    return runtime.changeAgentStatus(agentId, statusCode, reasonCode);
  });
  ipcMain.handle('desktop:originate', (_event, params: {
    agentExtension: string;
    phoneNumber: string;
    callerId?: string;
  }) => {
    if (!runtime) {
      throw new Error('Runtime is not connected.');
    }
    return runtime.originate(params);
  });
  ipcMain.handle('desktop:originate-internal', (_event, input: {
    targetAgentId: string;
    targetExtension: string;
  }) => {
    if (!runtime) {
      throw new Error('Runtime is not connected.');
    }
    return runtime.originateInternal(input);
  });
  ipcMain.handle('desktop:get-caller-ids', () => {
    if (!runtime) {
      return { callerIds: [], defaultCallerId: null };
    }
    return runtime.getCallerIds();
  });
  ipcMain.handle('desktop:get-agent-directory', () => {
    if (!runtime) {
      return [];
    }
    return runtime.getAgentDirectory();
  });
  ipcMain.handle('desktop:get-call-history', () => {
    if (!runtime) {
      return [];
    }
    return runtime.getCallHistory();
  });
  ipcMain.handle('desktop:request-history-originate', (_event, input: { phoneNumber: string }) => {
    const win = getPrimaryWindow();
    const phoneNumber = input.phoneNumber?.trim();
    if (!win || !phoneNumber) {
      throw new Error('상담원 화면으로 발신 요청을 전달할 수 없습니다.');
    }

    const requestId = randomUUID();
    focusPrimaryWindow();
    win.webContents.send('desktop:history-originate-request', { requestId, phoneNumber });

    return new Promise<DesktopHistoryOriginateResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        historyOriginateRequests.delete(requestId);
        reject(new Error('발신 요청 응답 시간이 초과되었습니다.'));
      }, 15000);
      historyOriginateRequests.set(requestId, { resolve, reject, timer });
    });
  });
  ipcMain.handle('desktop:complete-history-originate', (_event, input: DesktopHistoryOriginateResult) => {
    const pending = historyOriginateRequests.get(input.requestId);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timer);
    historyOriginateRequests.delete(input.requestId);
    pending.resolve(input);
  });
  ipcMain.handle('desktop:open-call-history-popup', () => {
    openUtilityWindow('history');
  });
  ipcMain.handle('desktop:open-agent-list-popup', () => {
    openUtilityWindow('agents');
  });
  ipcMain.handle('desktop:transfer', (_event, callId: string, params: {
    target: string;
    transferType: 'blind' | 'attended';
    fromExtension: string;
  }) => {
    if (!runtime) {
      throw new Error('Runtime is not connected.');
    }
    return runtime.transfer(callId, params);
  });
  ipcMain.handle('desktop:cancel-attended-transfer', (_event, callId: string) => {
    if (!runtime) {
      throw new Error('Runtime is not connected.');
    }
    return runtime.cancelAttendedTransfer(callId);
  });
  ipcMain.handle('desktop:complete-attended-transfer', (_event, callId: string) => {
    if (!runtime) {
      throw new Error('Runtime is not connected.');
    }
    return runtime.completeAttendedTransfer(callId);
  });
  ipcMain.handle('desktop:get-call-context', (_event, callId: string) => {
    if (!runtime) {
      throw new Error('Runtime is not connected.');
    }
    return runtime.getCallContext(callId);
  });
  ipcMain.handle('desktop:save-call-memo', (_event, input: DesktopSaveCallMemoInput) => {
    if (!runtime) {
      throw new Error('Runtime is not connected.');
    }
    return runtime.saveCallMemo(input);
  });
  ipcMain.handle('desktop:hold', (_event, callId: string) => {
    if (!runtime) {
      throw new Error('Runtime is not connected.');
    }
    return runtime.hold(callId);
  });
  ipcMain.handle('desktop:resume', (_event, callId: string) => {
    if (!runtime) {
      throw new Error('Runtime is not connected.');
    }
    return runtime.resume(callId);
  });
  ipcMain.handle('desktop:check-for-updates', async () => {
    const config = await configStore.load();
    const session = await tokenVault.load();
    if (!config || !session) {
      return null;
    }

    const client = new UpdateClient(config.serverUrl, session.accessToken);
    return client.pollManifest({
      deviceId: config.deviceId,
      currentVersion: app.getVersion(),
      channel: config.channel,
    });
  });
  ipcMain.handle('desktop:prepare-update', async () => {
    const config = await configStore.load();
    const session = await tokenVault.load();
    if (!config || !session) {
      return null;
    }

    const client = new UpdateClient(
      config.serverUrl,
      session.accessToken,
      join(app.getPath('temp'), 'kaster-agent-updates'),
    );
    preparedUpdate = await client.prepareUpdate({
      deviceId: config.deviceId,
      currentVersion: app.getVersion(),
      channel: config.channel,
    });
    return preparedUpdate;
  });
  ipcMain.handle('desktop:apply-prepared-update', async () => {
    if (!preparedUpdate?.verified) {
      return null;
    }

    const launchError = await shell.openPath(preparedUpdate.filePath);
    if (launchError) {
      throw new Error(launchError);
    }

    return {
      launched: true,
      filePath: preparedUpdate.filePath,
    };
  });
  ipcMain.handle('desktop:notify-incoming-call', (_event, input: { title: string; body: string }) => {
    attentionService.notifyIncomingCall(input);
  });
  ipcMain.handle('desktop:focus-window', () => {
    attentionService.focusWindow();
  });
  ipcMain.handle('desktop:open-external', (_event, url: string) => {
    return shell.openExternal(url);
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  runtimeSupervisor?.disconnect();
  runtime?.disconnect();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  void desktopBridgeServer.stop();
});
