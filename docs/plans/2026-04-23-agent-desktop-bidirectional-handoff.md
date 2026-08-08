# Agent Desktop Bidirectional Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the desktop app's manual pairing-first UX with bidirectional auto-handoff so web softphone login can auto-launch the desktop runtime, while the desktop app can also log in independently and auto-open the web.

**Architecture:** Keep the existing access/refresh/session model and extend `AuthService` with a second one-time `web handoff` contract rather than inventing a parallel auth stack. On the desktop side, make normal credentials the default entry point, keep handoff as an internal automation path, and add a thin local presence bridge plus custom protocol handler so the web can gate softphone login on desktop readiness.

**Tech Stack:** NestJS, Prisma, Redis, Vite, React 19, Ant Design, Zustand, Electron, electron-vite, Vitest, Jest

---

## Scope Split

This plan intentionally covers the linked UX/auth surface across `apps/server`, `apps/web`, and `apps/desktop` because the feature is only usable when all three move together.

This plan does **not** include:

- SIP/WebRTC media changes beyond consuming the already-hydrated desktop session
- update hub changes beyond preserving the existing flow after login
- code signing, installer policy, or ops deployment tasks

## File Map

### Server Auth Contracts

- Modify: `apps/server/src/modules/auth/auth.controller.ts`
  Responsibility: expose web handoff create/exchange endpoints alongside the existing desktop handoff endpoints.
- Modify: `apps/server/src/modules/auth/auth.service.ts`
  Responsibility: mint and consume one-time `web` handoff tokens, and keep token purpose separation from the existing desktop handoff flow.
- Create: `apps/server/src/modules/auth/dto/create-web-handoff.dto.ts`
  Responsibility: accept desktop-originated web handoff metadata such as redirect path.
- Create: `apps/server/src/modules/auth/dto/exchange-web-handoff.dto.ts`
  Responsibility: validate the web handoff token exchange payload.
- Modify: `apps/server/test/auth-handoff.integration.spec.ts`
  Responsibility: cover purpose-separated handoff issuance, one-time consumption, and replay rejection.

### Desktop Main Process

- Modify: `apps/desktop/src/main/index.ts`
  Responsibility: register the `kaster-agent://` protocol, expose a localhost readiness bridge, and route protocol payloads into the existing auth/runtime pipeline.
- Modify: `apps/desktop/src/main/auth-client.ts`
  Responsibility: add direct credential login and web handoff issuance on top of the existing desktop handoff exchange.
- Modify: `apps/desktop/src/shared/ipc.ts`
  Responsibility: define typed IPC methods for direct login, bridge health, and protocol-driven connect actions.
- Modify: `apps/desktop/src/preload/index.ts`
  Responsibility: expose the new typed IPC surface to the renderer.
- Create: `apps/desktop/src/main/desktop-bridge-server.ts`
  Responsibility: serve a localhost `/health` endpoint so the web can confirm the desktop app is installed and responsive.
- Create: `apps/desktop/src/main/protocol-payload.ts`
  Responsibility: parse and validate `kaster-agent://ping` and `kaster-agent://connect` deep links.
- Create: `apps/desktop/src/main/desktop-bridge-server.test.ts`
  Responsibility: verify health responses and lifecycle behavior.
- Create: `apps/desktop/src/main/protocol-payload.test.ts`
  Responsibility: verify query parsing and invalid payload rejection.
- Modify: `apps/desktop/src/main/auth-client.test.ts`
  Responsibility: verify direct login and web handoff issuance.

### Desktop Renderer UX

- Modify: `apps/desktop/src/renderer/src/App.tsx`
  Responsibility: route the default boot path to a normal login screen and reserve pairing for hidden diagnostics.
- Modify: `apps/desktop/src/renderer/src/store/useDesktopStore.ts`
  Responsibility: support direct login, protocol-driven auto-connect, web launch after desktop login, and hidden pairing mode.
- Create: `apps/desktop/src/renderer/src/components/DesktopLoginScreen.tsx`
  Responsibility: render a compact primary desktop login card with conditional server URL visibility and hidden advanced actions.
- Modify: `apps/desktop/src/renderer/src/components/PairingScreen.tsx`
  Responsibility: mark the pairing form as debug-only and remove it from the default app flow.
- Modify: `apps/desktop/src/renderer/src/components/SoftphoneShell.tsx`
  Responsibility: add lightweight session-origin status so operators can tell whether they entered via direct login or web handoff.
- Modify: `apps/desktop/src/renderer/src/store/useDesktopStore.test.ts`
  Responsibility: verify boot routing, direct login, and handoff-triggered session hydration.
- Create: `apps/desktop/src/renderer/src/components/DesktopLoginScreen.test.tsx`
  Responsibility: verify form validation and failure copy.

### Web Login Gate and Web Handoff Entry

- Modify: `apps/web/src/pages/LoginPage.tsx`
  Responsibility: add call-mode selection and softphone gating UX.
- Modify: `apps/web/src/api/realApi.ts`
  Responsibility: add typed helpers for desktop presence check, desktop handoff creation, and web handoff exchange.
- Modify: `apps/web/src/api/index.ts`
  Responsibility: export the new login-adjacent helpers.
- Modify: `apps/web/src/App.tsx`
  Responsibility: route an unauthenticated `desktop-handoff` entry path before the normal `RequireAuth` guard.
- Create: `apps/web/src/pages/DesktopHandoffPage.tsx`
  Responsibility: exchange a desktop-issued web handoff token and finalize web auto-login.
- Create: `apps/web/src/utils/desktopPresence.ts`
  Responsibility: probe `kaster-agent://ping` and `http://127.0.0.1:48125/health` to classify desktop readiness.
- Create: `apps/web/src/pages/LoginPage.test.tsx`
  Responsibility: verify softphone gating, install messaging, and SIP Phone bypass behavior.
- Create: `apps/web/src/pages/DesktopHandoffPage.test.tsx`
  Responsibility: verify exchange flow and failure handling.
- Create: `apps/web/src/utils/desktopPresence.test.ts`
  Responsibility: verify the readiness classifier.

## Task 1: Extend the server auth module with purpose-separated web handoff tokens

**Files:**
- Create: `apps/server/src/modules/auth/dto/create-web-handoff.dto.ts`
- Create: `apps/server/src/modules/auth/dto/exchange-web-handoff.dto.ts`
- Modify: `apps/server/src/modules/auth/auth.controller.ts`
- Modify: `apps/server/src/modules/auth/auth.service.ts`
- Modify: `apps/server/test/auth-handoff.integration.spec.ts`
- Test: `apps/server/test/auth-handoff.integration.spec.ts`

- [ ] **Step 1: Write the failing integration test for web handoff issuance and one-time exchange**

Add this test block to `apps/server/test/auth-handoff.integration.spec.ts`:

```ts
it('issues a web handoff token for a desktop-authenticated session and rejects replay', async () => {
  const login = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ loginId: 'agent1001', extension: '1001', password: 'Password123!' })
    .expect(201);

  const accessToken = login.body.data.accessToken;

  const createResponse = await request(app.getHttpServer())
    .post('/api/v1/auth/web-handoff')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ redirectPath: '/desktop-handoff' })
    .expect(201);

  const handoffToken = createResponse.body.data.handoffToken;

  await request(app.getHttpServer())
    .post('/api/v1/auth/web-handoff/exchange')
    .send({ handoffToken })
    .expect(201)
    .expect(({ body }) => {
      expect(body.data.accessToken).toEqual(expect.any(String));
      expect(body.data.refreshToken).toEqual(expect.any(String));
    });

  await request(app.getHttpServer())
    .post('/api/v1/auth/web-handoff/exchange')
    .send({ handoffToken })
    .expect(401);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
cd apps/server
npm test -- auth-handoff.integration.spec.ts
```

Expected: FAIL with `Cannot POST /api/v1/auth/web-handoff` or missing method errors because the endpoint does not exist yet.

- [ ] **Step 3: Add DTOs and controller endpoints**

Create `apps/server/src/modules/auth/dto/create-web-handoff.dto.ts`:

```ts
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateWebHandoffDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  redirectPath?: string;
}
```

Create `apps/server/src/modules/auth/dto/exchange-web-handoff.dto.ts`:

```ts
import { IsNotEmpty, IsString } from 'class-validator';

export class ExchangeWebHandoffDto {
  @IsString()
  @IsNotEmpty()
  handoffToken!: string;
}
```

Extend `apps/server/src/modules/auth/auth.controller.ts`:

```ts
import { CreateWebHandoffDto } from './dto/create-web-handoff.dto';
import { ExchangeWebHandoffDto } from './dto/exchange-web-handoff.dto';

@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Post('auth/web-handoff')
createWebHandoff(@CurrentUser() user: any, @Body() dto: CreateWebHandoffDto) {
  return this.authService.createWebHandoff(user, dto);
}

@Post('auth/web-handoff/exchange')
exchangeWebHandoff(@Body() dto: ExchangeWebHandoffDto) {
  return this.authService.exchangeWebHandoff(dto.handoffToken);
}
```

- [ ] **Step 4: Implement purpose-separated token issuance and consumption in `AuthService`**

Add these methods to `apps/server/src/modules/auth/auth.service.ts`:

```ts
async createWebHandoff(
  user: { sub: string; tenantId: string; role: string; extension: string; sid?: string },
  dto?: { redirectPath?: string },
) {
  if (!user.sid) {
    throw new UnauthorizedException('Invalid or expired handoff token');
  }

  const activeSession = await this.prisma.refreshTokens.findUnique({
    where: { tokenHash: user.sid },
    select: {
      refreshTokenId: true,
      agentId: true,
      tenantId: true,
      revokedAt: true,
      expiresAt: true,
    },
  });

  if (!activeSession || activeSession.agentId !== user.sub || activeSession.tenantId !== user.tenantId || activeSession.revokedAt || activeSession.expiresAt.getTime() <= Date.now()) {
    throw new UnauthorizedException('Invalid or expired handoff token');
  }

  const handoffToken = randomBytes(24).toString('hex');
  await this.redis.getClient().set(
    this.handoffKey('web', handoffToken),
    JSON.stringify({
      purpose: 'web',
      agentId: user.sub,
      tenantId: user.tenantId,
      redirectPath: dto?.redirectPath ?? '/desktop-handoff',
    }),
    'EX',
    HANDOFF_TOKEN_TTL_SECONDS,
  );

  return {
    success: true,
    data: { handoffToken, expiresIn: HANDOFF_TOKEN_TTL_SECONDS },
    error: null,
  };
}

async exchangeWebHandoff(handoffToken: string) {
  if (!handoffToken) {
    throw new UnauthorizedException('Invalid or expired handoff token');
  }

  const raw = await this.consumeHandoffToken('web', handoffToken);
  if (!raw) {
    throw new UnauthorizedException('Invalid or expired handoff token');
  }

  const payload = JSON.parse(raw) as { agentId: string; tenantId: string; purpose: 'web' };
  if (payload.purpose !== 'web') {
    throw new UnauthorizedException('Invalid or expired handoff token');
  }

  const agent = await this.prisma.agents.findUnique({ where: { agentId: payload.agentId } });
  if (!agent || !agent.isActive || agent.tenantId !== payload.tenantId) {
    throw new UnauthorizedException('Invalid or expired handoff token');
  }

  const refreshToken = await this.issueRefreshToken(agent.agentId, agent.tenantId, {
    userAgent: 'web-handoff',
    ipAddress: 'handoff',
  });
  const accessToken = this.signAccessToken(agent, { sessionId: sha256(refreshToken) });

  return {
    success: true,
    data: {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: 900,
      agent: {
        agentId: agent.agentId,
        agentName: agent.agentName,
        extension: agent.extension,
        role: agent.role,
      },
      softphoneConfig: this.buildSoftphoneConfig(agent),
    },
    error: null,
  };
}
```

Also refactor the existing helper signatures in the same file so purpose separation is explicit:

```ts
private handoffKey(purpose: 'desktop' | 'web', token: string) {
  return `kaster:handoff:${purpose}:${token}`;
}

private async consumeHandoffToken(purpose: 'desktop' | 'web', token: string) {
  const key = this.handoffKey(purpose, token);
  const raw = await this.redis.getClient().get(key);
  if (!raw) {
    return null;
  }
  await this.redis.getClient().del(key);
  return raw;
}
```

Update the existing desktop handoff path to call `this.handoffKey('desktop', handoffToken)` and `this.consumeHandoffToken('desktop', handoffToken)` so the two flows cannot cross-consume each other.

- [ ] **Step 5: Run the targeted test to verify it passes**

Run:

```bash
cd apps/server
npm test -- auth-handoff.integration.spec.ts
```

Expected: PASS with the new `web handoff` test green and the existing desktop handoff tests still green.

- [ ] **Step 6: Run the full server auth verification and commit**

Run:

```bash
cd apps/server
npm test -- auth-handoff.integration.spec.ts auth-softphone-config.integration.spec.ts
npm run build
```

Expected: PASS for Jest and a successful Nest build.

Commit:

```bash
git add apps/server/src/modules/auth/auth.controller.ts apps/server/src/modules/auth/auth.service.ts apps/server/src/modules/auth/dto/create-web-handoff.dto.ts apps/server/src/modules/auth/dto/exchange-web-handoff.dto.ts apps/server/test/auth-handoff.integration.spec.ts
git commit -m "feat: add web handoff auth contract"
```

## Task 2: Add the desktop local bridge, custom protocol parsing, and direct-login main-process API

**Files:**
- Create: `apps/desktop/src/main/desktop-bridge-server.ts`
- Create: `apps/desktop/src/main/desktop-bridge-server.test.ts`
- Create: `apps/desktop/src/main/protocol-payload.ts`
- Create: `apps/desktop/src/main/protocol-payload.test.ts`
- Modify: `apps/desktop/src/main/auth-client.ts`
- Modify: `apps/desktop/src/main/auth-client.test.ts`
- Modify: `apps/desktop/src/main/index.ts`
- Modify: `apps/desktop/src/shared/ipc.ts`
- Modify: `apps/desktop/src/preload/index.ts`
- Test: `apps/desktop/src/main/*.test.ts`

- [ ] **Step 1: Write failing tests for direct login and protocol parsing**

Create `apps/desktop/src/main/protocol-payload.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseProtocolPayload } from './protocol-payload';

describe('parseProtocolPayload', () => {
  it('parses a connect deep link', () => {
    expect(
      parseProtocolPayload('kaster-agent://connect?serverUrl=http%3A%2F%2F49.247.46.86%3A3000&handoffToken=abc123'),
    ).toEqual({
      action: 'connect',
      serverUrl: 'http://49.247.46.86:3000',
      handoffToken: 'abc123',
      channel: 'stable',
    });
  });

  it('rejects an invalid protocol payload', () => {
    expect(() => parseProtocolPayload('kaster-agent://connect?handoffToken='))
      .toThrow('Invalid desktop protocol payload.');
  });
});
```

Append this test block to `apps/desktop/src/main/auth-client.test.ts`:

```ts
it('logs in with credentials and requests a web handoff token', async () => {
  httpMock.onPost('/auth/login').reply(201, {
    success: true,
    data: {
      accessToken: 'access',
      refreshToken: 'refresh',
      agent: { agentId: 'agent-1', agentName: 'Agent 1', extension: '1001', role: 'agent' },
      softphoneConfig: { enabled: false, sipUri: null, wsServer: null, displayName: 'Agent 1', iceServers: [] },
    },
    error: null,
  });
  httpMock.onGet('/auth/desktop/session').reply(200, {
    success: true,
    data: {
      agent: { agentId: 'agent-1', agentName: 'Agent 1', extension: '1001', role: 'agent' },
      softphoneConfig: { enabled: false, sipUri: null, wsServer: null, displayName: 'Agent 1', iceServers: [] },
    },
    error: null,
  });
  httpMock.onPost('/auth/web-handoff').reply(201, {
    success: true,
    data: { handoffToken: 'web-token', expiresIn: 60 },
    error: null,
  });

  const client = new DesktopAuthClient('http://localhost:3000');
  const session = await client.login({
    loginId: 'agent1001',
    extension: '1001',
    password: 'Password123!',
  });
  const handoff = await client.createWebHandoff(session.accessToken, { redirectPath: '/desktop-handoff' });

  expect(session.agent.agentId).toBe('agent-1');
  expect(handoff.handoffToken).toBe('web-token');
});
```

- [ ] **Step 2: Run the targeted desktop tests to verify they fail**

Run:

```bash
cd apps/desktop
npm test -- --run src/main/protocol-payload.test.ts src/main/auth-client.test.ts
```

Expected: FAIL with missing module exports and missing `login/createWebHandoff` methods.

- [ ] **Step 3: Implement protocol parsing, health bridge, and direct login methods**

Create `apps/desktop/src/main/protocol-payload.ts`:

```ts
export type DesktopProtocolPayload =
  | { action: 'ping' }
  | { action: 'connect'; serverUrl: string; handoffToken: string; channel: string };

export function parseProtocolPayload(rawUrl: string): DesktopProtocolPayload {
  const url = new URL(rawUrl);
  const action = url.hostname || url.pathname.replace(/^\//, '');

  if (action === 'ping') {
    return { action: 'ping' };
  }

  if (action === 'connect') {
    const serverUrl = url.searchParams.get('serverUrl')?.trim();
    const handoffToken = url.searchParams.get('handoffToken')?.trim();
    const channel = url.searchParams.get('channel')?.trim() || 'stable';

    if (!serverUrl || !handoffToken) {
      throw new Error('Invalid desktop protocol payload.');
    }

    return { action: 'connect', serverUrl, handoffToken, channel };
  }

  throw new Error('Invalid desktop protocol payload.');
}
```

Create `apps/desktop/src/main/desktop-bridge-server.ts`:

```ts
import { createServer, type Server } from 'node:http';

export class DesktopBridgeServer {
  private server: Server | null = null;

  async start(port = 48125) {
    if (this.server) {
      return port;
    }

    this.server = createServer((req, res) => {
      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, app: 'kaster-agent-desktop' }));
        return;
      }

      res.writeHead(404).end();
    });

    await new Promise<void>((resolve) => this.server!.listen(port, '127.0.0.1', () => resolve()));
    return port;
  }

  async stop() {
    if (!this.server) {
      return;
    }
    const server = this.server;
    this.server = null;
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}
```

Extend `apps/desktop/src/main/auth-client.ts`:

```ts
export interface DesktopCredentialLoginInput {
  loginId: string;
  extension: string;
  password: string;
}

export interface DesktopHandoffToken {
  handoffToken: string;
  expiresIn: number;
}

async login(input: DesktopCredentialLoginInput): Promise<DesktopAuthSession> {
  const tokens = await this.requestTokens('/auth/login', input);
  return this.hydrateDesktopSession(tokens);
}

async createWebHandoff(accessToken: string, input?: { redirectPath?: string }): Promise<DesktopHandoffToken> {
  const response = await this.http.post('/auth/web-handoff', input ?? {}, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return response.data.data as DesktopHandoffToken;
}
```

Update the private request helper so it accepts `'/auth/login'` as well:

```ts
private async requestTokens(
  path: '/auth/handoff/exchange' | '/auth/refresh' | '/auth/login',
  body: Record<string, string>,
): Promise<DesktopTokenPair> {
  const response = await this.http.post(path, body);
  return response.data.data as DesktopTokenPair;
}
```

- [ ] **Step 4: Wire the bridge and protocol handler into the Electron main process**

Extend `apps/desktop/src/shared/ipc.ts` with these additions:

```ts
export interface DesktopCredentialLoginInput {
  serverUrl: string;
  loginId: string;
  extension: string;
  password: string;
}

export interface DesktopApi {
  login(input: DesktopCredentialLoginInput): Promise<{ agent: DesktopAgentProfile; softphoneConfig?: DesktopSoftphoneConfig }>;
  connectFromProtocol(input: { serverUrl: string; channel?: string; handoffToken: string }): Promise<{ agent: DesktopAgentProfile; softphoneConfig?: DesktopSoftphoneConfig }>;
}
```

Add these handlers to `apps/desktop/src/main/index.ts`:

```ts
const bridgeServer = new DesktopBridgeServer();

app.whenReady().then(async () => {
  app.setAsDefaultProtocolClient('kaster-agent');
  await bridgeServer.start();

  ipcMain.handle('desktop:login', async (_event, input) => {
    await configStore.save({ serverUrl: input.serverUrl, channel: 'stable' });
    const authClient = new DesktopAuthClient(input.serverUrl);
    const session = await authClient.login({
      loginId: input.loginId,
      extension: input.extension,
      password: input.password,
    });
    await tokenVault.save(session);
    return toSessionSummary(session);
  });

  ipcMain.handle('desktop:connect-from-protocol', async (_event, input) => {
    await configStore.save({ serverUrl: input.serverUrl, channel: input.channel ?? 'stable' });
    const authClient = new DesktopAuthClient(input.serverUrl);
    const session = await authClient.exchangeHandoff(input.handoffToken);
    await tokenVault.save(session);
    return toSessionSummary(session);
  });
});

app.on('second-instance', (_event, argv) => {
  const protocolArg = argv.find((value) => value.startsWith('kaster-agent://'));
  if (!protocolArg) {
    return;
  }
  const payload = parseProtocolPayload(protocolArg);
  if (payload.action === 'connect') {
    BrowserWindow.getAllWindows()[0]?.webContents.send('desktop:protocol-connect', payload);
  }
});
```

Expose the matching preload wrappers in `apps/desktop/src/preload/index.ts`:

```ts
contextBridge.exposeInMainWorld('desktopApi', {
  login: (input) => ipcRenderer.invoke('desktop:login', input),
  connectFromProtocol: (input) => ipcRenderer.invoke('desktop:connect-from-protocol', input),
  onProtocolConnect: (listener) => {
    const wrapped = (_event: unknown, payload: { serverUrl: string; channel?: string; handoffToken: string }) => listener(payload);
    ipcRenderer.on('desktop:protocol-connect', wrapped);
    return () => ipcRenderer.removeListener('desktop:protocol-connect', wrapped);
  },
});
```

- [ ] **Step 5: Run the desktop main-process tests to verify they pass**

Run:

```bash
cd apps/desktop
npm test -- --run src/main/protocol-payload.test.ts src/main/desktop-bridge-server.test.ts src/main/auth-client.test.ts
```

Expected: PASS for all three main-process test files.

- [ ] **Step 6: Run a desktop build and commit**

Run:

```bash
cd apps/desktop
npm run build
```

Expected: PASS with `out/main` and `out/preload` emitted.

Commit:

```bash
git add apps/desktop/src/main/desktop-bridge-server.ts apps/desktop/src/main/desktop-bridge-server.test.ts apps/desktop/src/main/protocol-payload.ts apps/desktop/src/main/protocol-payload.test.ts apps/desktop/src/main/auth-client.ts apps/desktop/src/main/auth-client.test.ts apps/desktop/src/main/index.ts apps/desktop/src/shared/ipc.ts apps/desktop/src/preload/index.ts
git commit -m "feat: add desktop bridge and direct auth entry"
```

## Task 3: Make direct desktop login the default renderer flow and hide manual pairing behind diagnostics

**Files:**
- Create: `apps/desktop/src/renderer/src/components/DesktopLoginScreen.tsx`
- Create: `apps/desktop/src/renderer/src/components/DesktopLoginScreen.test.tsx`
- Modify: `apps/desktop/src/renderer/src/App.tsx`
- Modify: `apps/desktop/src/renderer/src/components/PairingScreen.tsx`
- Modify: `apps/desktop/src/renderer/src/components/SoftphoneShell.tsx`
- Modify: `apps/desktop/src/renderer/src/store/useDesktopStore.ts`
- Modify: `apps/desktop/src/renderer/src/store/useDesktopStore.test.ts`
- Test: `apps/desktop/src/renderer/src/components/DesktopLoginScreen.test.tsx`
- Test: `apps/desktop/src/renderer/src/store/useDesktopStore.test.ts`

- [ ] **Step 1: Write failing renderer tests for the new default login flow**

Create `apps/desktop/src/renderer/src/components/DesktopLoginScreen.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DesktopLoginScreen } from './DesktopLoginScreen';

describe('DesktopLoginScreen', () => {
  it('submits server credentials when every field is filled', () => {
    const onSubmit = vi.fn();
    render(
      <DesktopLoginScreen
        busy={false}
        error={null}
        hasSavedServerUrl
        onSubmit={onSubmit}
        onToggleAdvanced={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('로그인 ID'), { target: { value: 'agent1001' } });
    fireEvent.change(screen.getByLabelText('내선 번호'), { target: { value: '1001' } });
    fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: 'Password123!' } });
    fireEvent.click(screen.getByRole('button', { name: '로그인' }));

    expect(onSubmit).toHaveBeenCalledWith({
      loginId: 'agent1001',
      extension: '1001',
      password: 'Password123!',
    });
  });

  it('shows the server URL field only when there is no saved server config', () => {
    render(
      <DesktopLoginScreen
        busy={false}
        error={null}
        hasSavedServerUrl={false}
        onSubmit={vi.fn()}
        onToggleAdvanced={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('콜센터 서버 URL')).toBeInTheDocument();
  });
});
```

Append this case to `apps/desktop/src/renderer/src/store/useDesktopStore.test.ts`:

```ts
it('boots to desktop login when no saved config and no session exist', async () => {
  desktopApi.getConfig.mockResolvedValue(null);
  desktopApi.getSession.mockResolvedValue(null);

  await useDesktopStore.getState().initialize();

  const state = useDesktopStore.getState();
  expect(state.bootstrapped).toBe(true);
  expect(state.agent).toBeNull();
  expect(state.config).toBeNull();
  expect(state.pairing).toBe(false);
});
```

- [ ] **Step 2: Run the renderer tests to verify they fail**

Run:

```bash
cd apps/desktop
npm test -- --run src/renderer/src/components/DesktopLoginScreen.test.tsx src/renderer/src/store/useDesktopStore.test.ts
```

Expected: FAIL because `DesktopLoginScreen` does not exist and the store still routes to pairing-only behavior.

- [ ] **Step 3: Implement the new default login screen and store action**

Create `apps/desktop/src/renderer/src/components/DesktopLoginScreen.tsx`:

```tsx
import { useState } from 'react';

export function DesktopLoginScreen({
  busy,
  error,
  hasSavedServerUrl,
  onSubmit,
  onToggleAdvanced,
}: {
  busy: boolean;
  error: string | null;
  hasSavedServerUrl: boolean;
  onSubmit: (input: { loginId: string; extension: string; password: string; serverUrl?: string }) => void;
  onToggleAdvanced: () => void;
}) {
  const [serverUrl, setServerUrl] = useState('http://49.247.46.86:3000');
  const [loginId, setLoginId] = useState('');
  const [extension, setExtension] = useState('');
  const [password, setPassword] = useState('');

  return (
    <section className="pairing-screen compact-login-screen">
      <div className="panel compact-login-panel">
        <p className="eyebrow">Desktop Login</p>
        <h1>KAster Agent Desktop</h1>
        {error ? <p className="error-copy">{error}</p> : null}
        {!hasSavedServerUrl ? (
          <label className="field"><span>콜센터 서버 URL</span><input aria-label="콜센터 서버 URL" value={serverUrl} onChange={(event) => setServerUrl(event.target.value)} /></label>
        ) : null}
        <label className="field"><span>로그인 ID</span><input aria-label="로그인 ID" value={loginId} onChange={(event) => setLoginId(event.target.value)} /></label>
        <label className="field"><span>내선 번호</span><input aria-label="내선 번호" value={extension} onChange={(event) => setExtension(event.target.value)} /></label>
        <label className="field"><span>비밀번호</span><input aria-label="비밀번호" type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        <button
          disabled={busy}
          onClick={() => onSubmit({ loginId, extension, password, serverUrl: hasSavedServerUrl ? undefined : serverUrl })}
          type="button"
        >
          {busy ? '로그인 중...' : '로그인'}
        </button>
        <button className="ghost-link" onClick={onToggleAdvanced} type="button">고급 옵션</button>
      </div>
    </section>
  );
}
```

Extend the store shape in `apps/desktop/src/renderer/src/store/useDesktopStore.ts`:

```ts
interface DesktopStore {
  loginError: string | null;
  showAdvancedLoginOptions: boolean;
  toggleAdvancedLoginOptions(): void;
  login(input: { serverUrl?: string; loginId: string; extension: string; password: string }): Promise<void>;
  connectFromProtocol(input: { serverUrl: string; channel?: string; handoffToken: string }): Promise<void>;
}
```

Add the two actions:

```ts
login: async (input) => {
  set({ pairing: true, loginError: null });
  try {
    const savedConfig = await window.desktopApi.getConfig();
    const session = await window.desktopApi.login({
      ...input,
      serverUrl: input.serverUrl ?? savedConfig?.serverUrl,
    });
    const config = await window.desktopApi.getConfig();
    set({ agent: session.agent, config, pairing: false });
    await get().connectRuntime();
    await get().checkForUpdates();
  } catch (error) {
    set({ pairing: false, loginError: error instanceof Error ? error.message : '데스크톱 로그인 실패' });
  }
},
connectFromProtocol: async (input) => {
  set({ pairing: true, loginError: null });
  const session = await window.desktopApi.connectFromProtocol(input);
  const config = await window.desktopApi.getConfig();
  set({ agent: session.agent, config, pairing: false });
  await get().connectRuntime();
  await get().checkForUpdates();
},
toggleAdvancedLoginOptions: () => {
  set((current) => ({ showAdvancedLoginOptions: !current.showAdvancedLoginOptions }));
},
```

- [ ] **Step 4: Make App route to normal login first and demote pairing to debug-only**

Update `apps/desktop/src/renderer/src/App.tsx`:

```tsx
import { DesktopLoginScreen } from './components/DesktopLoginScreen';

if (!bootstrapped) {
  return <DesktopLoginScreen busy error={null} hasSavedServerUrl={false} onSubmit={() => undefined} onToggleAdvanced={() => undefined} />;
}

if (!agent) {
  return (
    <DesktopLoginScreen
      busy={pairing}
      error={loginError}
      hasSavedServerUrl={Boolean(config?.serverUrl)}
      onSubmit={login}
      onToggleAdvanced={toggleAdvancedLoginOptions}
    />
  );
}
```

Keep `PairingScreen` available only behind an explicit debug flag:

```tsx
const debugPairing = new URLSearchParams(window.location.search).get('debugPairing') === 'true';
if (debugPairing && !agent) {
  return <PairingScreen busy={pairing} onSubmit={pair} />;
}
```

Update `apps/desktop/src/renderer/src/components/PairingScreen.tsx` copy so it is clearly diagnostic-only:

```tsx
<p className="eyebrow">Diagnostic Pairing</p>
<p className="lead">운영자 디버그용 수동 handoff 연결 화면입니다.</p>
```

Add compact-card style rules in `apps/desktop/src/renderer/src/styles.css`:

```css
.compact-login-panel {
  width: min(400px, 100%);
  padding: 22px;
}

.compact-login-panel h1 {
  margin: 0 0 6px;
  font-size: 1.6rem;
}

.compact-login-panel .field {
  margin-top: 14px;
}

.compact-login-panel .field input {
  padding: 12px 14px;
}

.ghost-link {
  margin-top: 10px;
  border: none;
  background: transparent;
  color: #8ba59a;
  font-size: 0.84rem;
}
```

Add a small session-origin badge to `apps/desktop/src/renderer/src/components/SoftphoneShell.tsx`:

```tsx
<p className="session-origin">세션 경로: {config?.channel === 'handoff' ? '웹 자동 연결' : '데스크톱 직접 로그인'}</p>
```

- [ ] **Step 5: Run the renderer tests to verify they pass**

Run:

```bash
cd apps/desktop
npm test -- --run src/renderer/src/components/DesktopLoginScreen.test.tsx src/renderer/src/store/useDesktopStore.test.ts
```

Expected: PASS with the boot route and login submission tests green.

- [ ] **Step 6: Run the full desktop test suite and commit**

Run:

```bash
cd apps/desktop
npm test
npm run build
```

Expected: PASS for the full Vitest suite and a successful renderer build.

Commit:

```bash
git add apps/desktop/src/renderer/src/App.tsx apps/desktop/src/renderer/src/components/DesktopLoginScreen.tsx apps/desktop/src/renderer/src/components/DesktopLoginScreen.test.tsx apps/desktop/src/renderer/src/components/PairingScreen.tsx apps/desktop/src/renderer/src/components/SoftphoneShell.tsx apps/desktop/src/renderer/src/store/useDesktopStore.ts apps/desktop/src/renderer/src/store/useDesktopStore.test.ts
git commit -m "feat: make desktop login the default entry"
```

## Task 4: Gate softphone web login on desktop readiness and auto-launch desktop on success

**Files:**
- Create: `apps/web/src/utils/desktopPresence.ts`
- Create: `apps/web/src/utils/desktopPresence.test.ts`
- Modify: `apps/web/src/api/realApi.ts`
- Modify: `apps/web/src/api/index.ts`
- Modify: `apps/web/src/pages/LoginPage.tsx`
- Create: `apps/web/src/pages/LoginPage.test.tsx`
- Test: `apps/web/src/utils/desktopPresence.test.ts`
- Test: `apps/web/src/pages/LoginPage.test.tsx`

- [ ] **Step 1: Write failing tests for call mode gating and desktop readiness classification**

Create `apps/web/src/utils/desktopPresence.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { classifyDesktopPresence } from './desktopPresence';

describe('classifyDesktopPresence', () => {
  it('returns installed-running when protocol and health both succeed', async () => {
    await expect(
      classifyDesktopPresence({
        launchProtocol: async () => true,
        fetchHealth: async () => 200,
      }),
    ).resolves.toEqual('installed-running');
  });

  it('returns missing when protocol launch fails', async () => {
    await expect(
      classifyDesktopPresence({
        launchProtocol: async () => false,
        fetchHealth: async () => 0,
      }),
    ).resolves.toEqual('missing');
  });
});
```

Create `apps/web/src/pages/LoginPage.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LoginPage } from './LoginPage';

vi.mock('../api', () => ({
  login: vi.fn(),
  createDesktopHandoff: vi.fn(),
}));
vi.mock('../utils/desktopPresence', () => ({
  classifyDesktopPresence: vi.fn(),
  launchDesktopConnect: vi.fn(),
}));

describe('LoginPage', () => {
  it('blocks softphone login when desktop app is missing', async () => {
    const { classifyDesktopPresence } = await import('../utils/desktopPresence');
    vi.mocked(classifyDesktopPresence).mockResolvedValue('missing');

    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText('로그인 ID'), { target: { value: 'agent1001' } });
    fireEvent.change(screen.getByLabelText('내선 번호'), { target: { value: '1001' } });
    fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: 'Password123!' } });
    fireEvent.click(screen.getByLabelText('소프트폰 사용'));
    fireEvent.click(screen.getByRole('button', { name: '로그인' }));

    await waitFor(() => {
      expect(screen.getByText('데스크톱 앱이 설치되지 않았습니다. 설치 후 다시 시도해 주세요.')).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run the targeted web tests to verify they fail**

Run:

```bash
cd apps/web
npm test -- --run src/utils/desktopPresence.test.ts src/pages/LoginPage.test.tsx
```

Expected: FAIL because the classifier and call-mode UI do not exist yet.

- [ ] **Step 3: Implement desktop presence classification and launch helpers**

Create `apps/web/src/utils/desktopPresence.ts`:

```ts
export type DesktopPresenceState = 'missing' | 'installed-stopped' | 'installed-running';

export async function classifyDesktopPresence(deps?: {
  launchProtocol?: () => Promise<boolean>;
  fetchHealth?: () => Promise<number>;
}): Promise<DesktopPresenceState> {
  const launchProtocol = deps?.launchProtocol ?? defaultProtocolLaunch;
  const fetchHealth = deps?.fetchHealth ?? defaultHealthFetch;

  const protocolOk = await launchProtocol();
  if (!protocolOk) {
    return 'missing';
  }

  const healthStatus = await fetchHealth();
  return healthStatus === 200 ? 'installed-running' : 'installed-stopped';
}

async function defaultProtocolLaunch() {
  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  iframe.src = 'kaster-agent://ping';
  document.body.appendChild(iframe);
  await new Promise((resolve) => setTimeout(resolve, 600));
  iframe.remove();
  return true;
}

async function defaultHealthFetch() {
  try {
    const response = await fetch('http://127.0.0.1:48125/health', { method: 'GET' });
    return response.status;
  } catch {
    return 0;
  }
}

export function launchDesktopConnect(input: { serverUrl: string; channel?: string; handoffToken: string }) {
  const url = new URL('kaster-agent://connect');
  url.searchParams.set('serverUrl', input.serverUrl);
  url.searchParams.set('handoffToken', input.handoffToken);
  url.searchParams.set('channel', input.channel ?? 'stable');
  window.location.href = url.toString();
}
```

Extend `apps/web/src/api/realApi.ts` with:

```ts
export async function createDesktopHandoff(input?: { deviceName?: string }) {
  const response = await apiClient.post('/auth/handoff', input ?? {});
  return response.data.data as { handoffToken: string; expiresIn: number };
}
```

Re-export it from `apps/web/src/api/index.ts`.

- [ ] **Step 4: Add call-mode gating and desktop auto-launch to the web login page**

Update `apps/web/src/pages/LoginPage.tsx` with a call-mode field:

```tsx
const [callMode, setCallMode] = useState<'softphone' | 'sip-phone'>('softphone');

<Form.Item label="통화 방식" name="callMode" initialValue="softphone">
  <Radio.Group onChange={(event) => setCallMode(event.target.value)}>
    <Radio value="softphone">소프트폰 사용</Radio>
    <Radio value="sip-phone">SIP Phone 사용</Radio>
  </Radio.Group>
</Form.Item>
```

Replace `onFinish` with gated logic:

```tsx
const onFinish = async (values: { loginId: string; password: string; extension: string }) => {
  setError(null);
  setLoading(true);
  try {
    if (callMode === 'softphone') {
      const presence = await classifyDesktopPresence();
      if (presence === 'missing') {
        throw new Error('데스크톱 앱이 설치되지 않았습니다. 설치 후 다시 시도해 주세요.');
      }
      if (presence === 'installed-stopped') {
        throw new Error('데스크톱 앱이 실행 중이 아닙니다. 앱을 실행한 뒤 다시 시도해 주세요.');
      }
    }

    await login(values);

    if (callMode === 'softphone') {
      const { handoffToken } = await createDesktopHandoff({ deviceName: 'web-login' });
      const serverUrl = window.location.origin.replace(/\/$/, '');
      launchDesktopConnect({ serverUrl, handoffToken, channel: 'stable' });
    }
  } catch (err: any) {
    setError(extractErrorMessage(err, '로그인 실패'));
  } finally {
    setLoading(false);
  }
};
```

Add a helper copy block below the radio group:

```tsx
<Typography.Text type="secondary" className="text-xs">
  소프트폰 사용 시 데스크톱 앱이 설치 및 실행되어 있어야 합니다.
</Typography.Text>
```

- [ ] **Step 5: Run the targeted web tests to verify they pass**

Run:

```bash
cd apps/web
npm test -- --run src/utils/desktopPresence.test.ts src/pages/LoginPage.test.tsx
```

Expected: PASS for readiness classification and the blocked softphone login path.

- [ ] **Step 6: Run the full web suite and commit**

Run:

```bash
cd apps/web
npm test
npm run build
```

Expected: PASS for Vitest and a successful Vite build.

Commit:

```bash
git add apps/web/src/utils/desktopPresence.ts apps/web/src/utils/desktopPresence.test.ts apps/web/src/api/realApi.ts apps/web/src/api/index.ts apps/web/src/pages/LoginPage.tsx apps/web/src/pages/LoginPage.test.tsx
git commit -m "feat: gate softphone web login on desktop readiness"
```

## Task 5: Add desktop-to-web auto-login and finalize the bidirectional entry routes

**Files:**
- Modify: `apps/web/src/App.tsx`
- Create: `apps/web/src/pages/DesktopHandoffPage.tsx`
- Create: `apps/web/src/pages/DesktopHandoffPage.test.tsx`
- Modify: `apps/web/src/store/useAuthStore.ts`
- Modify: `apps/desktop/src/renderer/src/store/useDesktopStore.ts`
- Modify: `apps/desktop/src/shared/ipc.ts`
- Modify: `apps/desktop/src/preload/index.ts`
- Test: `apps/web/src/pages/DesktopHandoffPage.test.tsx`
- Test: `apps/desktop/src/renderer/src/store/useDesktopStore.test.ts`

- [ ] **Step 1: Write failing tests for the web handoff entry and desktop-triggered browser launch**

Create `apps/web/src/pages/DesktopHandoffPage.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DesktopHandoffPage } from './DesktopHandoffPage';

vi.mock('../api', () => ({
  exchangeWebHandoff: vi.fn(),
}));

describe('DesktopHandoffPage', () => {
  it('exchanges the token from the query string and shows progress', async () => {
    const { exchangeWebHandoff } = await import('../api');
    vi.mocked(exchangeWebHandoff).mockResolvedValue({
      accessToken: 'access',
      refreshToken: 'refresh',
      agent: { agentId: 'agent-1', agentName: 'Agent 1', extension: '1001', role: 'agent' },
    } as never);

    window.history.pushState({}, '', '/desktop-handoff?token=web-token');
    render(<DesktopHandoffPage />);

    expect(screen.getByText('데스크톱 로그인과 세션을 연결하는 중입니다.')).toBeInTheDocument();
    await waitFor(() => expect(exchangeWebHandoff).toHaveBeenCalledWith('web-token'));
  });
});
```

Append this desktop store case to `apps/desktop/src/renderer/src/store/useDesktopStore.test.ts`:

```ts
it('requests a web handoff after direct desktop login', async () => {
  desktopApi.login.mockResolvedValue({ agent: mockAgent, softphoneConfig: mockSoftphoneConfig });
  desktopApi.getConfig.mockResolvedValue({ serverUrl: 'http://49.247.46.86:3000', channel: 'stable', deviceId: 'device-1' });
  desktopApi.createWebHandoff.mockResolvedValue({ handoffToken: 'web-token', expiresIn: 60 });
  desktopApi.openExternal.mockResolvedValue(undefined);

  await useDesktopStore.getState().login({
    serverUrl: 'http://49.247.46.86:3000',
    loginId: 'agent1001',
    extension: '1001',
    password: 'Password123!',
  });

  expect(desktopApi.createWebHandoff).toHaveBeenCalled();
  expect(desktopApi.openExternal).toHaveBeenCalledWith('http://49.247.46.86:3000/desktop-handoff?token=web-token');
});
```

- [ ] **Step 2: Run the targeted tests to verify they fail**

Run:

```bash
cd apps/web
npm test -- --run src/pages/DesktopHandoffPage.test.tsx
cd ../desktop
npm test -- --run src/renderer/src/store/useDesktopStore.test.ts
```

Expected: FAIL because the web handoff route and desktop browser-launch path do not exist yet.

- [ ] **Step 3: Add web-handoff API helpers and a public web handoff entry page**

Extend `apps/web/src/api/realApi.ts`:

```ts
export async function exchangeWebHandoff(handoffToken: string) {
  const response = await apiClient.post('/auth/web-handoff/exchange', { handoffToken });
  return response.data.data as {
    accessToken: string;
    refreshToken: string;
    agent: { agentId: string; agentName: string; extension: string; role: string };
  };
}
```

Create `apps/web/src/pages/DesktopHandoffPage.tsx`:

```tsx
import { Alert, Spin, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { exchangeWebHandoff } from '../api';
import { useAuthStore } from '../store/useAuthStore';

export function DesktopHandoffPage() {
  const [error, setError] = useState<string | null>(null);
  const setSession = useAuthStore((state) => state.setSession);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token');
    if (!token) {
      setError('웹 handoff token 이 없습니다.');
      return;
    }

    void exchangeWebHandoff(token)
      .then((data) => {
        setSession({
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          agent: data.agent as never,
        });
        window.location.replace('/');
      })
      .catch((cause) => {
        setError(cause instanceof Error ? cause.message : '웹 자동 로그인 실패');
      });
  }, [setSession]);

  if (error) {
    return <Alert type="error" showIcon message={error} />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="text-center">
        <Spin />
        <Typography.Paragraph className="mt-4">데스크톱 로그인과 세션을 연결하는 중입니다.</Typography.Paragraph>
      </div>
    </div>
  );
}
```

Update `apps/web/src/App.tsx` so the public handoff page is reachable before `RequireAuth`:

```tsx
import { DesktopHandoffPage } from './pages/DesktopHandoffPage';

function App() {
  if (window.location.pathname === '/desktop-handoff') {
    return <DesktopHandoffPage />;
  }

  return (
    <RequireAuth>
      <AppShell />
    </RequireAuth>
  );
}
```

- [ ] **Step 4: Trigger web auto-login after direct desktop login**

Extend `apps/desktop/src/shared/ipc.ts` and preload with:

```ts
createWebHandoff(): Promise<{ handoffToken: string; expiresIn: number }>;
openExternal(url: string): Promise<void>;
```

Wire the handlers in `apps/desktop/src/main/index.ts`:

```ts
ipcMain.handle('desktop:create-web-handoff', async () => {
  const config = await configStore.load();
  const session = await tokenVault.load();
  if (!config || !session) {
    throw new Error('Desktop session is missing.');
  }
  const authClient = new DesktopAuthClient(config.serverUrl);
  return authClient.createWebHandoff(session.accessToken, { redirectPath: '/desktop-handoff' });
});

ipcMain.handle('desktop:open-external', (_event, url: string) => shell.openExternal(url));
```

Call the handoff from the direct login success path in `apps/desktop/src/renderer/src/store/useDesktopStore.ts`:

```ts
const handoff = await window.desktopApi.createWebHandoff();
await window.desktopApi.openExternal(`${input.serverUrl.replace(/\/$/, '')}/desktop-handoff?token=${handoff.handoffToken}`);
```

This call belongs after the desktop session is saved and before returning control to the steady-state shell. If the browser launch fails, append an event log entry but do **not** roll back the desktop login.

- [ ] **Step 5: Run the new targeted tests to verify they pass**

Run:

```bash
cd apps/web
npm test -- --run src/pages/DesktopHandoffPage.test.tsx
cd ../desktop
npm test -- --run src/renderer/src/store/useDesktopStore.test.ts
```

Expected: PASS for the web handoff entry page and the desktop auto-web-launch test.

- [ ] **Step 6: Run end-to-end verification builds and commit**

Run:

```bash
cd apps/web
npm test
npm run build
cd ../desktop
npm test
npm run build
cd ../server
npm test -- auth-handoff.integration.spec.ts
npm run build
```

Expected: PASS across web, desktop, and the handoff-focused server auth tests.

Commit:

```bash
git add apps/web/src/App.tsx apps/web/src/pages/DesktopHandoffPage.tsx apps/web/src/pages/DesktopHandoffPage.test.tsx apps/web/src/api/realApi.ts apps/desktop/src/main/index.ts apps/desktop/src/shared/ipc.ts apps/desktop/src/preload/index.ts apps/desktop/src/renderer/src/store/useDesktopStore.ts
git commit -m "feat: complete bidirectional desktop web handoff"
```

## Self-Review

### Spec Coverage

- Web login call-mode branching: Task 4
- Softphone desktop install/run gate: Task 4
- Web-to-desktop automatic handoff: Task 4 + Task 2
- Desktop direct login: Task 2 + Task 3
- Desktop-to-web automatic handoff: Task 5
- Pairing token removal from user UX: Task 3
- Security separation between desktop and web handoff tokens: Task 1

No spec gaps remain.

### Placeholder Scan

- Searched for `TBD`, `TODO`, `implement later`, and `add appropriate` while drafting.
- No placeholders remain.

### Type Consistency

- Server uses `createWebHandoff` / `exchangeWebHandoff` consistently in controller and service.
- Desktop IPC uses `login`, `connectFromProtocol`, `createWebHandoff`, and `openExternal` consistently across shared types, preload, main, and renderer.
- Web route name is consistently `/desktop-handoff` across spec, page, and desktop browser launch.
