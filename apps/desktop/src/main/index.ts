import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { join } from 'node:path';
import { DesktopAuthClient } from './auth-client';
import { DesktopConfigStore } from './config-store';
import { CtiRuntime } from './cti-runtime';
import { TokenVault } from './token-vault';
import { UpdateClient } from './update-client';

const configStore = new DesktopConfigStore(app.getPath('userData'));
const tokenVault = new TokenVault(app.getPath('userData'));
let runtime: CtiRuntime | null = null;
let preparedUpdate:
  | {
      version: string;
      fileName: string;
      filePath: string;
      verified: boolean;
      mandatory: boolean;
    }
  | null = null;

function toSessionSummary(session: Awaited<ReturnType<typeof tokenVault.load>>) {
  if (!session) {
    return null;
  }

  return {
    agent: session.agent,
  };
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1100,
    minHeight: 700,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const rendererUrl = process.env.ELECTRON_RENDERER_URL;
  if (rendererUrl) {
    void win.loadURL(rendererUrl);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  ipcMain.handle('desktop:get-config', () => configStore.load());
  ipcMain.handle('desktop:save-config', (_event, input) => configStore.save(input));
  ipcMain.handle('desktop:get-session', async () => toSessionSummary(await tokenVault.load()));
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
  ipcMain.handle('desktop:connect-runtime', async () => {
    const config = await configStore.load();
    const session = await tokenVault.load();
    if (!config || !session) {
      throw new Error('Desktop runtime prerequisites are missing.');
    }

    runtime?.disconnect();
    runtime = new CtiRuntime({
      baseUrl: config.serverUrl,
      accessToken: session.accessToken,
    });
    runtime.connect((event) => {
      BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send('desktop:event', event);
      });
    });
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

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  runtime?.disconnect();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
