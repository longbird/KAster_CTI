# Agent Desktop Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a new Windows-only Electron agent desktop app in `apps/desktop` that can pair with the CTI server using the handoff flow, show a minimal softphone UI, consume realtime call events, execute call-control commands, and integrate with the call-center update hub.

**Architecture:** Build the desktop client as a standalone Electron + React + TypeScript app using `electron-vite`. Keep secrets and long-lived session state in the Electron main process, expose a narrow typed IPC surface through preload, and let the renderer own only presentation/state composition. Reuse the existing server contracts from the `agent desktop architecture` and `update distribution` specs instead of embedding PBX or business logic locally.

**Tech Stack:** Electron, electron-vite, React 19, TypeScript, Zustand, Axios, socket.io-client, Vitest, Testing Library

---

## Scope Split

This plan covers the **desktop runtime itself** and assumes the server-side update hub/API work will be implemented from the separate plan at:

- `docs/superpowers/plans/2026-04-22-agent-desktop-phase1-contract-hardening.md`
- `docs/superpowers/plans/2026-04-22-agent-desktop-update-distribution.md`

This plan does **not** include:

- Windows installer packaging selection and final distribution automation
- operator-to-call-center release copy tooling
- full CRM embedding inside the desktop shell

## File Map

### Desktop App Root

- Create: `apps/desktop/package.json`
  Responsibility: declare Electron runtime, renderer, test, and build scripts.
- Create: `apps/desktop/electron.vite.config.ts`
  Responsibility: bundle main, preload, and renderer with one Vite-based config.
- Create: `apps/desktop/tsconfig.json`
  Responsibility: TypeScript project settings for Electron + renderer code.
- Create: `apps/desktop/.gitignore`
  Responsibility: ignore local build artifacts and Electron output.

### Shared Contracts

- Create: `apps/desktop/src/shared/center-config.ts`
  Responsibility: validate and normalize the target call-center server URL and device metadata.
- Create: `apps/desktop/src/shared/cti.ts`
  Responsibility: desktop-local copy of agent session, active call, queue summary, and command ack types.
- Create: `apps/desktop/src/shared/ipc.ts`
  Responsibility: define the preload-exposed API surface and event payload types.

### Main Process

- Create: `apps/desktop/src/main/index.ts`
  Responsibility: create the BrowserWindow, register IPC handlers, and wire services together.
- Create: `apps/desktop/src/main/config-store.ts`
  Responsibility: persist center URL, channel, and device ID in the user-data directory.
- Create: `apps/desktop/src/main/token-vault.ts`
  Responsibility: encrypt and persist desktop auth/update tokens using Electron `safeStorage`.
- Create: `apps/desktop/src/main/auth-client.ts`
  Responsibility: exchange a handoff token for desktop access/refresh tokens and refresh sessions.
- Create: `apps/desktop/src/main/cti-runtime.ts`
  Responsibility: own the Socket.IO connection and REST command wrappers for the desktop.
- Create: `apps/desktop/src/main/update-client.ts`
  Responsibility: request update session tokens, poll manifests, initialize downloads, verify hashes, and emit update state.
- Create: `apps/desktop/src/main/download-store.ts`
  Responsibility: manage local temporary update downloads and SHA-256 verification.

### Preload

- Create: `apps/desktop/src/preload/index.ts`
  Responsibility: expose a typed `window.desktopApi`.

### Renderer

- Create: `apps/desktop/src/renderer/index.html`
  Responsibility: renderer HTML entry.
- Create: `apps/desktop/src/renderer/src/main.tsx`
  Responsibility: bootstrap React.
- Create: `apps/desktop/src/renderer/src/App.tsx`
  Responsibility: route between pairing, runtime shell, and update prompts.
- Create: `apps/desktop/src/renderer/src/store/useDesktopStore.ts`
  Responsibility: compose IPC calls and realtime events into renderer state.
- Create: `apps/desktop/src/renderer/src/components/PairingScreen.tsx`
  Responsibility: collect center URL and handoff token, then start pairing.
- Create: `apps/desktop/src/renderer/src/components/SoftphoneShell.tsx`
  Responsibility: render agent status, current call, and call-control actions.
- Create: `apps/desktop/src/renderer/src/components/UpdateBanner.tsx`
  Responsibility: show update availability and safe-install state.
- Create: `apps/desktop/src/renderer/src/components/EventTimeline.tsx`
  Responsibility: show recent command and realtime events for troubleshooting.
- Create: `apps/desktop/src/renderer/src/styles.css`
  Responsibility: provide a simple Windows-oriented desktop layout.

### Tests

- Create: `apps/desktop/src/shared/center-config.test.ts`
  Responsibility: verify center URL normalization and channel defaults.
- Create: `apps/desktop/src/main/config-store.test.ts`
  Responsibility: verify persisted desktop configuration and device ID behavior.
- Create: `apps/desktop/src/main/auth-client.test.ts`
  Responsibility: verify handoff exchange and refresh flows.
- Create: `apps/desktop/src/main/update-client.test.ts`
  Responsibility: verify manifest polling, tokenized download init, and hash verification decisions.
- Create: `apps/desktop/src/renderer/src/store/useDesktopStore.test.ts`
  Responsibility: verify pairing flow, realtime event application, and update banner state.

## Task 1: Scaffold `apps/desktop` and Add Shared Center Config Validation

**Files:**
- Create: `apps/desktop/package.json`
- Create: `apps/desktop/electron.vite.config.ts`
- Create: `apps/desktop/tsconfig.json`
- Create: `apps/desktop/.gitignore`
- Create: `apps/desktop/src/shared/center-config.ts`
- Create: `apps/desktop/src/shared/center-config.test.ts`
- Test: `apps/desktop/src/shared/center-config.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/src/shared/center-config.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { normalizeCenterConfig } from './center-config';

describe('normalizeCenterConfig', () => {
  it('공백이 포함된 서버 URL을 https 기준으로 정규화한다', () => {
    expect(
      normalizeCenterConfig({
        serverUrl: '  cti-center-a.example.com  ',
        channel: '',
      }),
    ).toEqual({
      serverUrl: 'https://cti-center-a.example.com',
      channel: 'stable',
    });
  });

  it('http 또는 https 스킴만 허용한다', () => {
    expect(() =>
      normalizeCenterConfig({
        serverUrl: 'ftp://cti-center-a.example.com',
        channel: 'pilot',
      }),
    ).toThrow('Center server URL must use http or https.');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
cd apps/desktop
npm test -- --run src/shared/center-config.test.ts
```

Expected: FAIL with `The system cannot find the path specified` or `Missing script: "test"` because `apps/desktop` does not exist yet.

- [ ] **Step 3: Create the minimal desktop app scaffold**

Create `apps/desktop/package.json`:

```json
{
  "name": "kaster-cti-desktop",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "main": "dist-electron/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "preview": "electron-vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "axios": "^1.8.4",
    "electron-log": "^5.3.0",
    "react": "^19.1.0",
    "react-dom": "^19.1.0",
    "socket.io-client": "^4.8.1",
    "zustand": "^5.0.8"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.2.0",
    "@types/node": "^22.10.2",
    "@types/react": "^19.1.2",
    "@types/react-dom": "^19.1.2",
    "electron": "^33.2.1",
    "electron-vite": "^3.1.0",
    "jsdom": "^25.0.1",
    "typescript": "^5.8.3",
    "vite": "^7.1.7",
    "vitest": "^2.1.9"
  }
}
```

Create `apps/desktop/electron.vite.config.ts`:

```ts
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    plugins: [react()],
    test: {
      environment: 'jsdom',
      globals: true,
    },
  },
});
```

Create `apps/desktop/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "Bundler",
    "allowImportingTsExtensions": false,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "types": ["node", "vitest/globals"]
  },
  "include": ["src", "electron.vite.config.ts"]
}
```

Create `apps/desktop/.gitignore`:

```gitignore
node_modules/
dist/
dist-electron/
```

Create `apps/desktop/src/shared/center-config.ts`:

```ts
export interface CenterConfigInput {
  serverUrl: string;
  channel?: string;
}

export interface CenterConfig {
  serverUrl: string;
  channel: string;
}

export function normalizeCenterConfig(input: CenterConfigInput): CenterConfig {
  const trimmed = input.serverUrl.trim();
  const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(normalized);
  if (!/^https?:$/.test(url.protocol)) {
    throw new Error('Center server URL must use http or https.');
  }

  return {
    serverUrl: url.toString().replace(/\/$/, ''),
    channel: input.channel?.trim() || 'stable',
  };
}
```

- [ ] **Step 4: Install dependencies and rerun the test**

Run:

```bash
cd apps/desktop
npm install
npm test -- --run src/shared/center-config.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/package.json apps/desktop/electron.vite.config.ts apps/desktop/tsconfig.json apps/desktop/.gitignore apps/desktop/src/shared/center-config.ts apps/desktop/src/shared/center-config.test.ts
git commit -m "feat: scaffold desktop app"
```

## Task 2: Add Main-Process Config Storage and Typed Preload Contract

**Files:**
- Create: `apps/desktop/src/shared/ipc.ts`
- Create: `apps/desktop/src/main/config-store.ts`
- Create: `apps/desktop/src/main/config-store.test.ts`
- Create: `apps/desktop/src/main/index.ts`
- Create: `apps/desktop/src/preload/index.ts`
- Test: `apps/desktop/src/main/config-store.test.ts`

- [ ] **Step 1: Write the failing config-store test**

Create `apps/desktop/src/main/config-store.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { DesktopConfigStore } from './config-store';

const fsState = new Map<string, string>();

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn(async () => undefined),
  readFile: vi.fn(async (path: string) => {
    const value = fsState.get(path);
    if (!value) throw Object.assign(new Error('not found'), { code: 'ENOENT' });
    return value;
  }),
  writeFile: vi.fn(async (path: string, value: string) => {
    fsState.set(path, value);
  }),
}));

vi.mock('node:crypto', () => ({
  randomUUID: () => 'device-uuid-1',
}));

describe('DesktopConfigStore', () => {
  beforeEach(() => fsState.clear());

  it('초기 저장 시 deviceId 를 자동 생성한다', async () => {
    const store = new DesktopConfigStore('C:/Users/test/AppData/Roaming/KAster');

    const saved = await store.save({
      serverUrl: 'https://cti-center-a.example.com',
      channel: 'stable',
    });

    expect(saved).toEqual({
      serverUrl: 'https://cti-center-a.example.com',
      channel: 'stable',
      deviceId: 'device-uuid-1',
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
cd apps/desktop
npm test -- --run src/main/config-store.test.ts
```

Expected: FAIL because `./config-store` does not exist.

- [ ] **Step 3: Add the store, preload contract, and main-process shell**

Create `apps/desktop/src/shared/ipc.ts`:

```ts
export interface DesktopConfig {
  serverUrl: string;
  channel: string;
  deviceId: string;
}

export interface DesktopApi {
  getConfig(): Promise<DesktopConfig | null>;
  saveConfig(input: { serverUrl: string; channel?: string }): Promise<DesktopConfig>;
}

export interface DesktopWindow extends Window {
  desktopApi: DesktopApi;
}
```

Create `apps/desktop/src/main/config-store.ts`:

```ts
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { normalizeCenterConfig } from '../shared/center-config';

export interface PersistedDesktopConfig {
  serverUrl: string;
  channel: string;
  deviceId: string;
}

export class DesktopConfigStore {
  private readonly filePath: string;

  constructor(private readonly userDataDir: string) {
    this.filePath = join(userDataDir, 'desktop-config.json');
  }

  async load(): Promise<PersistedDesktopConfig | null> {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      return JSON.parse(raw) as PersistedDesktopConfig;
    } catch (error: any) {
      if (error?.code === 'ENOENT') return null;
      throw error;
    }
  }

  async save(input: { serverUrl: string; channel?: string }) {
    const normalized = normalizeCenterConfig(input);
    const current = await this.load();
    const next: PersistedDesktopConfig = {
      ...normalized,
      deviceId: current?.deviceId ?? randomUUID(),
    };

    await mkdir(this.userDataDir, { recursive: true });
    await writeFile(this.filePath, JSON.stringify(next, null, 2), 'utf8');
    return next;
  }
}
```

Create `apps/desktop/src/main/index.ts`:

```ts
import { app, BrowserWindow, ipcMain } from 'electron';
import { join } from 'node:path';
import { DesktopConfigStore } from './config-store';

const configStore = new DesktopConfigStore(app.getPath('userData'));

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
    },
  });

  win.loadFile(join(__dirname, '../renderer/index.html'));
}

app.whenReady().then(() => {
  ipcMain.handle('desktop:get-config', () => configStore.load());
  ipcMain.handle('desktop:save-config', (_event, input) => configStore.save(input));
  createWindow();
});
```

Create `apps/desktop/src/preload/index.ts`:

```ts
import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopApi } from '../shared/ipc';

const desktopApi: DesktopApi = {
  getConfig: () => ipcRenderer.invoke('desktop:get-config'),
  saveConfig: (input) => ipcRenderer.invoke('desktop:save-config', input),
};

contextBridge.exposeInMainWorld('desktopApi', desktopApi);
```

- [ ] **Step 4: Rerun the config-store test**

Run:

```bash
cd apps/desktop
npm test -- --run src/main/config-store.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/shared/ipc.ts apps/desktop/src/main/config-store.ts apps/desktop/src/main/config-store.test.ts apps/desktop/src/main/index.ts apps/desktop/src/preload/index.ts
git commit -m "feat: add desktop config store and preload contract"
```

## Task 3: Add Handoff Exchange, Secure Token Vault, and Session Recovery

**Files:**
- Create: `apps/desktop/src/main/token-vault.ts`
- Create: `apps/desktop/src/main/auth-client.ts`
- Create: `apps/desktop/src/main/auth-client.test.ts`
- Modify: `apps/desktop/src/main/index.ts`
- Modify: `apps/desktop/src/shared/ipc.ts`
- Modify: `apps/desktop/src/preload/index.ts`
- Test: `apps/desktop/src/main/auth-client.test.ts`

- [ ] **Step 1: Write the failing auth-client test**

Create `apps/desktop/src/main/auth-client.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DesktopAuthClient } from './auth-client';

const post = vi.fn();

vi.mock('axios', () => ({
  default: {
    create: () => ({ post }),
  },
}));

describe('DesktopAuthClient', () => {
  beforeEach(() => post.mockReset());

  it('exchangeHandoff 는 handoff token 을 데스크톱 세션으로 교환한다', async () => {
    post.mockResolvedValue({
      data: {
        data: {
          accessToken: 'access-1',
          refreshToken: 'refresh-1',
          agent: {
            agentId: 'agent-1',
            agentName: '상담원1',
            extension: '1001',
            role: 'agent',
          },
        },
      },
    });

    const client = new DesktopAuthClient('https://cti-center-a.example.com');
    const result = await client.exchangeHandoff('handoff-1');

    expect(post).toHaveBeenCalledWith('/auth/handoff/exchange', {
      handoffToken: 'handoff-1',
    });
    expect(result.agent.agentId).toBe('agent-1');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
cd apps/desktop
npm test -- --run src/main/auth-client.test.ts
```

Expected: FAIL because `./auth-client` does not exist.

- [ ] **Step 3: Add the token vault and auth client**

Create `apps/desktop/src/main/token-vault.ts`:

```ts
import { safeStorage } from 'electron';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface DesktopSession {
  accessToken: string;
  refreshToken: string;
  agent: {
    agentId: string;
    agentName: string;
    extension: string;
    role: string;
  };
}

export class TokenVault {
  private readonly filePath: string;

  constructor(private readonly userDataDir: string) {
    this.filePath = join(userDataDir, 'desktop-session.bin');
  }

  async load(): Promise<DesktopSession | null> {
    try {
      const raw = await readFile(this.filePath);
      const json = safeStorage.isEncryptionAvailable()
        ? safeStorage.decryptString(raw)
        : raw.toString('utf8');
      return JSON.parse(json) as DesktopSession;
    } catch {
      return null;
    }
  }

  async save(session: DesktopSession) {
    await mkdir(this.userDataDir, { recursive: true });
    const json = JSON.stringify(session);
    const payload = safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(json)
      : Buffer.from(json, 'utf8');
    await writeFile(this.filePath, payload);
  }
}
```

Create `apps/desktop/src/main/auth-client.ts`:

```ts
import axios from 'axios';

export interface DesktopSessionResponse {
  accessToken: string;
  refreshToken: string;
  agent: {
    agentId: string;
    agentName: string;
    extension: string;
    role: string;
  };
}

export class DesktopAuthClient {
  private readonly http;

  constructor(baseUrl: string) {
    this.http = axios.create({
      baseURL: `${baseUrl}/api/v1`,
      timeout: 10000,
    });
  }

  async exchangeHandoff(handoffToken: string): Promise<DesktopSessionResponse> {
    const res = await this.http.post('/auth/handoff/exchange', { handoffToken });
    return res.data.data;
  }

  async refresh(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    const res = await this.http.post('/auth/refresh', { refreshToken });
    return res.data.data;
  }
}
```

Update `apps/desktop/src/shared/ipc.ts`:

```ts
export interface DesktopApi {
  getConfig(): Promise<DesktopConfig | null>;
  saveConfig(input: { serverUrl: string; channel?: string }): Promise<DesktopConfig>;
  exchangeHandoff(handoffToken: string): Promise<{
    agent: {
      agentId: string;
      agentName: string;
      extension: string;
      role: string;
    };
  }>;
  getSession(): Promise<{
    agent: {
      agentId: string;
      agentName: string;
      extension: string;
      role: string;
    };
  } | null>;
}
```

Update `apps/desktop/src/main/index.ts` with:

```ts
import { DesktopAuthClient } from './auth-client';
import { TokenVault } from './token-vault';

const tokenVault = new TokenVault(app.getPath('userData'));

app.whenReady().then(() => {
  ipcMain.handle('desktop:get-config', () => configStore.load());
  ipcMain.handle('desktop:save-config', (_event, input) => configStore.save(input));
  ipcMain.handle('desktop:get-session', async () => tokenVault.load());
  ipcMain.handle('desktop:exchange-handoff', async (_event, handoffToken: string) => {
    const config = await configStore.load();
    if (!config) throw new Error('Center config is missing.');
    const authClient = new DesktopAuthClient(config.serverUrl);
    const session = await authClient.exchangeHandoff(handoffToken);
    await tokenVault.save(session);
    return { agent: session.agent };
  });
  createWindow();
});
```

Update `apps/desktop/src/preload/index.ts`:

```ts
const desktopApi: DesktopApi = {
  getConfig: () => ipcRenderer.invoke('desktop:get-config'),
  saveConfig: (input) => ipcRenderer.invoke('desktop:save-config', input),
  exchangeHandoff: (handoffToken) => ipcRenderer.invoke('desktop:exchange-handoff', handoffToken),
  getSession: () => ipcRenderer.invoke('desktop:get-session'),
};
```

- [ ] **Step 4: Rerun the auth-client test**

Run:

```bash
cd apps/desktop
npm test -- --run src/main/auth-client.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/main/token-vault.ts apps/desktop/src/main/auth-client.ts apps/desktop/src/main/auth-client.test.ts apps/desktop/src/main/index.ts apps/desktop/src/shared/ipc.ts apps/desktop/src/preload/index.ts
git commit -m "feat: add desktop handoff auth flow"
```

## Task 4: Add Main-Process CTI Runtime and Command/Event Bridge

**Files:**
- Create: `apps/desktop/src/main/cti-runtime.ts`
- Modify: `apps/desktop/src/main/index.ts`
- Modify: `apps/desktop/src/shared/cti.ts`
- Modify: `apps/desktop/src/shared/ipc.ts`
- Test: `apps/desktop/src/main/cti-runtime.test.ts`

- [ ] **Step 1: Write the failing runtime test**

Create `apps/desktop/src/main/cti-runtime.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { CtiRuntime } from './cti-runtime';

const on = vi.fn();
const disconnect = vi.fn();
const emit = vi.fn();
const post = vi.fn();

vi.mock('socket.io-client', () => ({
  io: () => ({
    on,
    emit,
    disconnect,
  }),
}));

vi.mock('axios', () => ({
  default: {
    create: () => ({
      post,
    }),
  },
}));

describe('CtiRuntime', () => {
  beforeEach(() => {
    on.mockReset();
    post.mockReset();
  });

  it('mute 는 correlationId 를 포함해 서버 명령을 호출한다', async () => {
    post.mockResolvedValue({
      data: {
        data: {
          accepted: true,
          requestedAt: '2026-04-22T12:00:00.000Z',
          correlationId: 'corr-1',
          callId: 'call-1',
          state: 'on',
          direction: 'all',
        },
      },
    });

    const runtime = new CtiRuntime({
      baseUrl: 'https://cti-center-a.example.com',
      accessToken: 'access-1',
    });

    const ack = await runtime.mute('call-1', 'on');

    expect(post).toHaveBeenCalledWith(
      '/calls/call-1/mute',
      { state: 'on', direction: 'all' },
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-correlation-id': expect.any(String),
        }),
      }),
    );
    expect(ack.correlationId).toBe('corr-1');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
cd apps/desktop
npm test -- --run src/main/cti-runtime.test.ts
```

Expected: FAIL because `./cti-runtime` does not exist.

- [ ] **Step 3: Add shared CTI types and runtime service**

Create `apps/desktop/src/shared/cti.ts`:

```ts
export type AgentStatusCode =
  | 'AVAILABLE'
  | 'RINGING'
  | 'TALKING'
  | 'AFTER_CALL_WORK'
  | 'BREAK'
  | 'MEAL'
  | 'TRAINING'
  | 'MANUAL_PAUSED';

export type SessionStatus =
  | 'QUEUED'
  | 'RINGING_AGENT'
  | 'TALKING'
  | 'HOLD'
  | 'TRANSFERRING'
  | 'AFTER_CALL_WORK'
  | 'ENDED';

export interface CommandAck {
  accepted: boolean;
  requestedAt: string;
  correlationId: string;
  idempotencyKey?: string | null;
}

export interface ActiveCall {
  callId: string;
  linkedid: string;
  ani: string;
  dnis: string;
  queueName: string;
  sessionStatus: SessionStatus;
  startedAt: string;
  answeredAt?: string;
  primaryAgentId?: string;
  isMuted?: boolean;
}

export type CtiEvent =
  | { type: 'call.created'; payload: ActiveCall }
  | { type: 'call.updated'; payload: ActiveCall }
  | { type: 'call.ended'; payload: { callId: string; endedAt: string; talkSeconds: number } }
  | { type: 'agent.status.changed'; payload: { agentId: string; statusCode: AgentStatusCode } };
```

Create `apps/desktop/src/main/cti-runtime.ts`:

```ts
import axios from 'axios';
import { io, type Socket } from 'socket.io-client';
import type { CommandAck, CtiEvent } from '../shared/cti';

export class CtiRuntime {
  private readonly http;
  private socket: Socket | null = null;

  constructor(private readonly params: { baseUrl: string; accessToken: string }) {
    this.http = axios.create({
      baseURL: `${params.baseUrl}/api/v1`,
      timeout: 10000,
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
      },
    });
  }

  connect(onEvent: (event: CtiEvent) => void) {
    this.socket = io(`${this.params.baseUrl}/ws`, {
      auth: { token: this.params.accessToken },
      transports: ['websocket', 'polling'],
    });

    (['call.created', 'call.updated', 'call.ended', 'agent.status.changed'] as const).forEach((type) => {
      this.socket?.on(type, (payload: unknown) => onEvent({ type, payload } as CtiEvent));
    });
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
  }

  async mute(callId: string, state: 'on' | 'off'): Promise<CommandAck & { callId: string; state: 'on' | 'off'; direction: string }> {
    const correlationId = crypto.randomUUID();
    const res = await this.http.post(
      `/calls/${callId}/mute`,
      { state, direction: 'all' },
      {
        headers: {
          'x-correlation-id': correlationId,
        },
      },
    );
    return res.data.data;
  }
}
```

Update `apps/desktop/src/shared/ipc.ts` with runtime methods:

```ts
  connectRuntime(): Promise<void>;
  mute(callId: string, state: 'on' | 'off'): Promise<{
    accepted: boolean;
    requestedAt: string;
    correlationId: string;
    callId: string;
    state: 'on' | 'off';
    direction: string;
  }>;
  onEvent(listener: (event: import('./cti').CtiEvent) => void): () => void;
```

Update `apps/desktop/src/main/index.ts` to create a singleton runtime and forward events to the renderer:

```ts
import { webContents } from 'electron';
import { CtiRuntime } from './cti-runtime';

let runtime: CtiRuntime | null = null;

app.whenReady().then(() => {
  ipcMain.handle('desktop:get-config', () => configStore.load());
  ipcMain.handle('desktop:save-config', (_event, input) => configStore.save(input));
  ipcMain.handle('desktop:get-session', async () => tokenVault.load());
  ipcMain.handle('desktop:exchange-handoff', async (_event, handoffToken: string) => {
    const config = await configStore.load();
    if (!config) throw new Error('Center config is missing.');
    const authClient = new DesktopAuthClient(config.serverUrl);
    const session = await authClient.exchangeHandoff(handoffToken);
    await tokenVault.save(session);
    return { agent: session.agent };
  });
  ipcMain.handle('desktop:connect-runtime', async () => {
    const config = await configStore.load();
    const session = await tokenVault.load();
    if (!config || !session) throw new Error('Desktop runtime prerequisites are missing.');
    runtime?.disconnect();
    runtime = new CtiRuntime({
      baseUrl: config.serverUrl,
      accessToken: session.accessToken,
    });
    runtime.connect((event) => {
      BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('desktop:event', event));
    });
  });
  ipcMain.handle('desktop:mute', (_event, callId: string, state: 'on' | 'off') => {
    if (!runtime) throw new Error('Runtime is not connected.');
    return runtime.mute(callId, state);
  });
});
```

- [ ] **Step 4: Rerun the runtime test**

Run:

```bash
cd apps/desktop
npm test -- --run src/main/cti-runtime.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/shared/cti.ts apps/desktop/src/shared/ipc.ts apps/desktop/src/main/cti-runtime.ts apps/desktop/src/main/cti-runtime.test.ts apps/desktop/src/main/index.ts
git commit -m "feat: add desktop cti runtime bridge"
```

## Task 5: Build the Renderer Pairing and Softphone Shell

**Files:**
- Create: `apps/desktop/src/renderer/index.html`
- Create: `apps/desktop/src/renderer/src/main.tsx`
- Create: `apps/desktop/src/renderer/src/App.tsx`
- Create: `apps/desktop/src/renderer/src/store/useDesktopStore.ts`
- Create: `apps/desktop/src/renderer/src/store/useDesktopStore.test.ts`
- Create: `apps/desktop/src/renderer/src/components/PairingScreen.tsx`
- Create: `apps/desktop/src/renderer/src/components/SoftphoneShell.tsx`
- Create: `apps/desktop/src/renderer/src/components/EventTimeline.tsx`
- Create: `apps/desktop/src/renderer/src/styles.css`
- Test: `apps/desktop/src/renderer/src/store/useDesktopStore.test.ts`

- [ ] **Step 1: Write the failing renderer-store test**

Create `apps/desktop/src/renderer/src/store/useDesktopStore.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDesktopStore } from './useDesktopStore';

const desktopApi = {
  getConfig: vi.fn().mockResolvedValue(null),
  saveConfig: vi.fn().mockResolvedValue({
    serverUrl: 'https://cti-center-a.example.com',
    channel: 'stable',
    deviceId: 'device-1',
  }),
  exchangeHandoff: vi.fn().mockResolvedValue({
    agent: {
      agentId: 'agent-1',
      agentName: '상담원1',
      extension: '1001',
      role: 'agent',
    },
  }),
  getSession: vi.fn().mockResolvedValue(null),
  connectRuntime: vi.fn().mockResolvedValue(undefined),
  mute: vi.fn(),
  onEvent: vi.fn(() => () => undefined),
};

vi.stubGlobal('window', { desktopApi });

describe('useDesktopStore pairing', () => {
  beforeEach(() => {
    useDesktopStore.setState({
      bootstrapped: false,
      pairing: false,
      agent: null,
      config: null,
      activeCall: null,
      events: [],
      updateState: null,
    });
  });

  it('pair 는 config 저장 후 handoff 교환과 runtime 연결까지 수행한다', async () => {
    await useDesktopStore.getState().pair({
      serverUrl: 'cti-center-a.example.com',
      channel: 'stable',
      handoffToken: 'handoff-1',
    });

    const state = useDesktopStore.getState();
    expect(state.config?.serverUrl).toBe('https://cti-center-a.example.com');
    expect(state.agent?.agentId).toBe('agent-1');
    expect(desktopApi.connectRuntime).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
cd apps/desktop
npm test -- --run src/renderer/src/store/useDesktopStore.test.ts
```

Expected: FAIL because the renderer store does not exist.

- [ ] **Step 3: Add the renderer shell**

Create `apps/desktop/src/renderer/index.html`:

```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>KAster Agent Desktop</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./src/main.tsx"></script>
  </body>
</html>
```

Create `apps/desktop/src/renderer/src/main.tsx`:

```tsx
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
```

Create `apps/desktop/src/renderer/src/store/useDesktopStore.ts`:

```ts
import { create } from 'zustand';
import type { ActiveCall } from '../../../shared/cti';

interface PairParams {
  serverUrl: string;
  channel?: string;
  handoffToken: string;
}

interface DesktopStore {
  bootstrapped: boolean;
  pairing: boolean;
  agent: { agentId: string; agentName: string; extension: string; role: string } | null;
  config: { serverUrl: string; channel: string; deviceId: string } | null;
  activeCall: ActiveCall | null;
  events: string[];
  updateState: { message: string } | null;
  pair(params: PairParams): Promise<void>;
}

export const useDesktopStore = create<DesktopStore>((set) => ({
  bootstrapped: false,
  pairing: false,
  agent: null,
  config: null,
  activeCall: null,
  events: [],
  updateState: null,
  async pair(params) {
    set({ pairing: true });
    const config = await window.desktopApi.saveConfig({
      serverUrl: params.serverUrl,
      channel: params.channel,
    });
    const session = await window.desktopApi.exchangeHandoff(params.handoffToken);
    await window.desktopApi.connectRuntime();
    set({
      pairing: false,
      bootstrapped: true,
      config,
      agent: session.agent,
    });
  },
}));
```

Create `apps/desktop/src/renderer/src/components/PairingScreen.tsx`:

```tsx
import { useState } from 'react';

export function PairingScreen({
  onSubmit,
  busy,
}: {
  onSubmit: (params: { serverUrl: string; channel: string; handoffToken: string }) => void;
  busy: boolean;
}) {
  const [serverUrl, setServerUrl] = useState('');
  const [channel, setChannel] = useState('stable');
  const [handoffToken, setHandoffToken] = useState('');

  return (
    <section className="pairing-screen">
      <h1>KAster Agent Desktop</h1>
      <input value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} placeholder="콜센터 서버 URL" />
      <input value={channel} onChange={(e) => setChannel(e.target.value)} placeholder="채널" />
      <input value={handoffToken} onChange={(e) => setHandoffToken(e.target.value)} placeholder="handoff token" />
      <button disabled={busy} onClick={() => onSubmit({ serverUrl, channel, handoffToken })}>
        {busy ? '연결 중...' : '연결'}
      </button>
    </section>
  );
}
```

Create `apps/desktop/src/renderer/src/components/SoftphoneShell.tsx`:

```tsx
import type { ActiveCall } from '../../../shared/cti';

export function SoftphoneShell({
  agentName,
  extension,
  activeCall,
}: {
  agentName: string;
  extension: string;
  activeCall: ActiveCall | null;
}) {
  return (
    <section className="softphone-shell">
      <header>
        <h1>{agentName}</h1>
        <p>내선 {extension}</p>
      </header>
      <article>
        <h2>현재 통화</h2>
        {activeCall ? (
          <p>{activeCall.ani} / {activeCall.sessionStatus}</p>
        ) : (
          <p>진행 중인 통화 없음</p>
        )}
      </article>
    </section>
  );
}
```

Create `apps/desktop/src/renderer/src/components/EventTimeline.tsx`:

```tsx
export function EventTimeline({ events }: { events: string[] }) {
  return (
    <aside className="event-timeline">
      <h3>이벤트</h3>
      <ul>
        {events.map((event) => <li key={event}>{event}</li>)}
      </ul>
    </aside>
  );
}
```

Create `apps/desktop/src/renderer/src/App.tsx`:

```tsx
import { PairingScreen } from './components/PairingScreen';
import { SoftphoneShell } from './components/SoftphoneShell';
import { EventTimeline } from './components/EventTimeline';
import { useDesktopStore } from './store/useDesktopStore';

export default function App() {
  const { bootstrapped, pairing, pair, agent, activeCall, events } = useDesktopStore();

  if (!bootstrapped || !agent) {
    return <PairingScreen busy={pairing} onSubmit={pair} />;
  }

  return (
    <main className="desktop-layout">
      <SoftphoneShell agentName={agent.agentName} extension={agent.extension} activeCall={activeCall} />
      <EventTimeline events={events} />
    </main>
  );
}
```

Create `apps/desktop/src/renderer/src/styles.css`:

```css
body {
  margin: 0;
  font-family: "Segoe UI", sans-serif;
  background: #0f1720;
  color: #e8edf5;
}

.desktop-layout {
  display: grid;
  grid-template-columns: 2fr 1fr;
  min-height: 100vh;
}

.pairing-screen,
.softphone-shell,
.event-timeline {
  padding: 24px;
}
```

- [ ] **Step 4: Rerun the renderer-store test**

Run:

```bash
cd apps/desktop
npm test -- --run src/renderer/src/store/useDesktopStore.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/renderer/index.html apps/desktop/src/renderer/src/main.tsx apps/desktop/src/renderer/src/App.tsx apps/desktop/src/renderer/src/store/useDesktopStore.ts apps/desktop/src/renderer/src/store/useDesktopStore.test.ts apps/desktop/src/renderer/src/components/PairingScreen.tsx apps/desktop/src/renderer/src/components/SoftphoneShell.tsx apps/desktop/src/renderer/src/components/EventTimeline.tsx apps/desktop/src/renderer/src/styles.css
git commit -m "feat: add desktop pairing and softphone shell"
```

## Task 6: Add Update Client Integration and Safe-Install Gating

**Files:**
- Create: `apps/desktop/src/main/download-store.ts`
- Create: `apps/desktop/src/main/update-client.ts`
- Create: `apps/desktop/src/main/update-client.test.ts`
- Create: `apps/desktop/src/renderer/src/components/UpdateBanner.tsx`
- Modify: `apps/desktop/src/renderer/src/store/useDesktopStore.ts`
- Modify: `apps/desktop/src/renderer/src/App.tsx`
- Modify: `apps/desktop/src/shared/ipc.ts`
- Modify: `apps/desktop/src/main/index.ts`
- Test: `apps/desktop/src/main/update-client.test.ts`

- [ ] **Step 1: Write the failing update-client test**

Create `apps/desktop/src/main/update-client.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UpdateClient } from './update-client';

const post = vi.fn();
const get = vi.fn();

vi.mock('axios', () => ({
  default: {
    create: () => ({ post, get }),
  },
}));

describe('UpdateClient', () => {
  beforeEach(() => {
    post.mockReset();
    get.mockReset();
  });

  it('pollManifest 는 update session token 으로 manifest 를 조회한다', async () => {
    post.mockResolvedValueOnce({
      data: {
        data: {
          updateSessionToken: 'update-session-1',
          expiresIn: 600,
        },
      },
    });
    get.mockResolvedValueOnce({
      data: {
        data: {
          latestVersion: '1.4.0',
          mandatory: false,
        },
      },
    });

    const client = new UpdateClient('https://cti-center-a.example.com', 'access-1');
    const manifest = await client.pollManifest({
      deviceId: 'device-1',
      currentVersion: '1.3.2',
      channel: 'stable',
    });

    expect(post).toHaveBeenCalledWith(
      '/agent-updates/session',
      {
        deviceId: 'device-1',
        currentVersion: '1.3.2',
      },
      expect.any(Object),
    );
    expect(get).toHaveBeenCalledWith('/agent-updates/manifest', expect.objectContaining({
      headers: {
        Authorization: 'Bearer update-session-1',
      },
      params: {
        currentVersion: '1.3.2',
        channel: 'stable',
      },
    }));
    expect(manifest.latestVersion).toBe('1.4.0');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
cd apps/desktop
npm test -- --run src/main/update-client.test.ts
```

Expected: FAIL because `./update-client` does not exist.

- [ ] **Step 3: Add the update client and renderer banner**

Create `apps/desktop/src/main/download-store.ts`:

```ts
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

export async function verifySha256(filePath: string, expectedSha256: string) {
  const hash = createHash('sha256');
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve());
    stream.on('error', reject);
  });
  return hash.digest('hex') === expectedSha256;
}
```

Create `apps/desktop/src/main/update-client.ts`:

```ts
import axios from 'axios';

export class UpdateClient {
  private readonly http;

  constructor(baseUrl: string, accessToken: string) {
    this.http = axios.create({
      baseURL: `${baseUrl}/api/v1`,
      timeout: 15000,
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  }

  async pollManifest(params: {
    deviceId: string;
    currentVersion: string;
    channel: string;
  }) {
    const session = await this.http.post('/agent-updates/session', {
      deviceId: params.deviceId,
      currentVersion: params.currentVersion,
    });
    const manifest = await this.http.get('/agent-updates/manifest', {
      headers: {
        Authorization: `Bearer ${session.data.data.updateSessionToken}`,
      },
      params: {
        currentVersion: params.currentVersion,
        channel: params.channel,
      },
    });
    return manifest.data.data;
  }
}
```

Create `apps/desktop/src/renderer/src/components/UpdateBanner.tsx`:

```tsx
export function UpdateBanner({
  message,
  canApply,
}: {
  message: string;
  canApply: boolean;
}) {
  return (
    <div className="update-banner">
      <strong>{message}</strong>
      <span>{canApply ? '지금 적용 가능' : '통화 종료 후 적용'}</span>
    </div>
  );
}
```

Update `apps/desktop/src/shared/ipc.ts`:

```ts
  checkForUpdates(): Promise<{
    latestVersion: string;
    mandatory: boolean;
  } | null>;
```

Update `apps/desktop/src/main/index.ts` with:

```ts
import { UpdateClient } from './update-client';

ipcMain.handle('desktop:check-for-updates', async () => {
  const config = await configStore.load();
  const session = await tokenVault.load();
  if (!config || !session) return null;
  const client = new UpdateClient(config.serverUrl, session.accessToken);
  return client.pollManifest({
    deviceId: config.deviceId,
    currentVersion: '0.1.0',
    channel: config.channel,
  });
});
```

Update `apps/desktop/src/renderer/src/store/useDesktopStore.ts`:

```ts
  updateState: { message: string; mandatory: boolean } | null;
  checkForUpdates(): Promise<void>;
```

```ts
  async checkForUpdates() {
    const update = await window.desktopApi.checkForUpdates();
    if (!update) return;
    set({
      updateState: {
        message: `새 버전 ${update.latestVersion} 이 준비되었습니다.`,
        mandatory: update.mandatory,
      },
    });
  },
```

Update `apps/desktop/src/renderer/src/App.tsx`:

```tsx
import { UpdateBanner } from './components/UpdateBanner';
```

```tsx
  const { bootstrapped, pairing, pair, agent, activeCall, events, updateState } = useDesktopStore();
```

```tsx
      {updateState ? (
        <UpdateBanner
          message={updateState.message}
          canApply={!activeCall || activeCall.sessionStatus === 'ENDED'}
        />
      ) : null}
```

- [ ] **Step 4: Rerun the update-client test**

Run:

```bash
cd apps/desktop
npm test -- --run src/main/update-client.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run the desktop build**

Run:

```bash
cd apps/desktop
npm run build
```

Expected: PASS with Electron main, preload, and renderer bundles emitted.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/main/download-store.ts apps/desktop/src/main/update-client.ts apps/desktop/src/main/update-client.test.ts apps/desktop/src/renderer/src/components/UpdateBanner.tsx apps/desktop/src/renderer/src/store/useDesktopStore.ts apps/desktop/src/renderer/src/App.tsx apps/desktop/src/shared/ipc.ts apps/desktop/src/main/index.ts
git commit -m "feat: add desktop update client"
```

## Task 7: Final Regression Pass

**Files:**
- Modify: none unless regressions are found
- Test: desktop vitest suite and production build

- [ ] **Step 1: Run the full desktop test suite**

Run:

```bash
cd apps/desktop
npm test
```

Expected: PASS for `center-config`, `config-store`, `auth-client`, `cti-runtime`, `update-client`, and renderer store tests.

- [ ] **Step 2: Run the production build**

Run:

```bash
cd apps/desktop
npm run build
```

Expected: PASS.

- [ ] **Step 3: Check the desktop app diff**

Run:

```bash
git status --short
git diff --stat -- apps/desktop
```

Expected: only the planned `apps/desktop` files are changed plus any lockfile created by `npm install`.

- [ ] **Step 4: Commit follow-up fixes only if needed**

```bash
git add apps/desktop
git commit -m "fix: polish desktop runtime"
```

## Spec Coverage Check

- `Windows 전용 Electron 기반 데스크톱 앱`:
  Covered by Task 1 scaffold.
- `handoff 인증 기반 세션 연계`:
  Covered by Task 3.
- `소프트폰 최소 책임 범위`:
  Covered by Tasks 4 and 5.
- `서버 중심 상태 동기화`:
  Covered by Task 4 main-process runtime bridge.
- `콜센터 서버 update hub 연동`:
  Covered by Task 6.
- `실제 Windows 설치 패키지 적용`:
  Not covered here; depends on packaging-tool choice and is deferred.

## Deferred Follow-Up Plans

- Windows installer packaging and signed release output
- final Squirrel/MSIX installer-apply flow
- native device enumeration enhancements beyond the initial UI shell
- CRM embedding strategy after the standalone softphone runtime is stable
