# Agent Desktop Phase 1 Contract Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare the existing NestJS + web agent stack for a future Windows call runtime by standardizing command metadata, adding a one-time desktop session handoff flow, and formalizing the external CRM API contract without building the desktop app itself.

**Architecture:** Keep `apps/server` as the single source of truth for agent sessions and call control. Add correlation/idempotency metadata at the HTTP command boundary, use Redis-backed one-time handoff tokens so the future desktop runtime can attach without sharing refresh tokens, and update the web shell to consume the new command ack shape while remaining a CRM-focused client.

**Tech Stack:** NestJS 10, Prisma 5, Redis/ioredis, Jest 29, Vite 7, React 19, Zustand 5, Axios

---

## Scope Split

The approved design spans three independent implementation tracks. This plan covers only the first one because it is the smallest slice that produces working, testable software in the current repo.

- Plan A: `server/web contract hardening` for hybrid runtime coexistence
- Plan B: `Windows desktop call runtime scaffold` with softphone shell and device handling
- Plan C: `external CRM integration package` with finalized auth/docs/examples

This file is Plan A.

## File Map

### Server

- Create: `apps/server/src/common/command-meta.util.ts`
  Responsibility: normalize `x-correlation-id` and `idempotency-key`, generate fallbacks, and return a shared command ack payload shape.
- Create: `apps/server/src/modules/auth/dto/create-handoff.dto.ts`
  Responsibility: validate desktop handoff creation payload.
- Create: `apps/server/src/modules/auth/dto/exchange-handoff.dto.ts`
  Responsibility: validate one-time handoff exchange payload.
- Modify: `apps/server/src/modules/auth/auth.controller.ts`
  Responsibility: expose authenticated handoff creation and anonymous handoff exchange endpoints.
- Modify: `apps/server/src/modules/auth/auth.service.ts`
  Responsibility: issue and exchange one-time Redis-backed handoff tokens and preserve existing login/refresh flows.
- Modify: `apps/server/src/modules/calls/calls.controller.ts`
  Responsibility: accept request metadata headers and pass them to call command methods.
- Modify: `apps/server/src/modules/calls/calls.service.ts`
  Responsibility: include normalized command metadata in every command ack and command-request event payload.
- Modify: `apps/server/src/modules/events/event-bus.service.ts`
  Responsibility: preserve event metadata fields when publishing over Redis Pub/Sub.
- Modify: `apps/server/test/calls-service.integration.spec.ts`
  Responsibility: verify command ack metadata and command-request event payload propagation.
- Create: `apps/server/test/auth-handoff.integration.spec.ts`
  Responsibility: verify one-time desktop handoff creation, exchange, and replay prevention.

### Web

- Modify: `apps/web/package.json`
  Responsibility: add a test runner and scripts for contract/store tests.
- Create: `apps/web/vitest.config.ts`
  Responsibility: configure `vitest` with `jsdom` and a single shared setup file.
- Create: `apps/web/src/test/setup.ts`
  Responsibility: install DOM matchers and reset shared mocks/localStorage between tests.
- Modify: `apps/web/src/types/cti.ts`
  Responsibility: define shared `CommandAck` and optional command metadata fields returned by the server.
- Modify: `apps/web/src/api/realApi.ts`
  Responsibility: adapt command endpoints to the new ack shape.
- Modify: `apps/web/src/store/useCtiStore.ts`
  Responsibility: preserve command correlation metadata in notifications/event log rather than assuming bare `accepted`.
- Create: `apps/web/src/store/useCtiStore.test.ts`
  Responsibility: verify the store handles metadata-bearing command responses without regressing current behavior.

### Docs

- Create: `docs/design/external-crm-cti-api-contract.md`
  Responsibility: publish the first concrete CRM contract doc aligned to the new server metadata and handoff rules.

## Task 1: Add Web Test Infrastructure for Contract Work

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/vitest.config.ts`
- Create: `apps/web/src/test/setup.ts`
- Create: `apps/web/src/store/useCtiStore.test.ts`
- Test: `apps/web/src/store/useCtiStore.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/store/useCtiStore.test.ts` with this baseline:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCtiStore } from './useCtiStore';

vi.mock('../api', () => ({
  getAgentSession: vi.fn().mockResolvedValue({
    data: {
      agentId: 'agent-1',
      agentName: '상담원1',
      extension: '1001',
      statusCode: 'AVAILABLE',
      todayAnswered: 0,
      todayMissed: 0,
      todayTalkSeconds: 0,
    },
  }),
  getQueuesSummary: vi.fn().mockResolvedValue({ data: [] }),
  getActiveCalls: vi.fn().mockResolvedValue({ data: [] }),
  getCallHistory: vi.fn().mockResolvedValue({ data: [] }),
  getAgents: vi.fn().mockResolvedValue({ data: [] }),
  muteCall: vi.fn().mockResolvedValue({
    data: {
      callId: 'call-1',
      accepted: true,
      state: 'on',
      direction: 'all',
      correlationId: 'corr-mute-1',
      requestedAt: '2026-04-22T12:00:00.000Z',
    },
  }),
}));

vi.mock('../ws', () => ({
  connectSocket: vi.fn(() => () => undefined),
}));

describe('useCtiStore command metadata', () => {
  beforeEach(() => {
    useCtiStore.setState({
      loading: false,
      agentSession: {
        agentId: 'agent-1',
        agentName: '상담원1',
        extension: '1001',
        statusCode: 'AVAILABLE',
        todayAnswered: 0,
        todayMissed: 0,
        todayTalkSeconds: 0,
      },
      queues: [],
      agentDirectory: [],
      activeCalls: [
        {
          callId: 'call-1',
          linkedid: 'L-1',
          ani: '01012345678',
          dnis: '15771577',
          queueName: '대표',
          sessionStatus: 'TALKING',
          startedAt: '2026-04-22T11:59:00.000Z',
          isMuted: false,
        },
      ],
      selectedCallId: 'call-1',
      recentHistory: [],
      notifications: [],
      eventLog: [],
    });
  });

  it('toggleMute 는 correlationId 가 포함된 로그를 남긴다', async () => {
    await useCtiStore.getState().toggleMute();

    const state = useCtiStore.getState();
    expect(state.activeCalls[0].isMuted).toBe(true);
    expect(state.eventLog[0].message).toContain('corr-mute-1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd apps/web
npm test -- --run src/store/useCtiStore.test.ts
```

Expected: FAIL with `Missing script: "test"`.

- [ ] **Step 3: Add the minimal test runner setup**

Update `apps/web/package.json`:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.3",
    "jsdom": "^25.0.1",
    "vitest": "^2.1.9"
  }
}
```

Create `apps/web/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    clearMocks: true,
  },
});
```

Create `apps/web/src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';

afterEach(() => {
  localStorage.clear();
});
```

- [ ] **Step 4: Run test to verify it now fails for the real reason**

Run:

```bash
cd apps/web
npm install
npm test -- --run src/store/useCtiStore.test.ts
```

Expected: FAIL because `toggleMute` does not yet include `correlationId` in the event log message.

- [ ] **Step 5: Commit**

```bash
git add apps/web/package.json apps/web/vitest.config.ts apps/web/src/test/setup.ts apps/web/src/store/useCtiStore.test.ts
git commit -m "test: add web contract test runner"
```

## Task 2: Standardize Command Metadata in the Server Call-Control Layer

**Files:**
- Create: `apps/server/src/common/command-meta.util.ts`
- Modify: `apps/server/src/modules/calls/calls.controller.ts`
- Modify: `apps/server/src/modules/calls/calls.service.ts`
- Modify: `apps/server/test/calls-service.integration.spec.ts`
- Test: `apps/server/test/calls-service.integration.spec.ts`

- [ ] **Step 1: Write the failing test**

Add this test near the existing command tests in `apps/server/test/calls-service.integration.spec.ts`:

```ts
  it('mute 는 correlationId 와 idempotencyKey 를 응답과 이벤트에 포함한다', async () => {
    prisma.callSessions.findFirst.mockResolvedValue({
      callId: 'call-meta-1',
      tenantId: 'tenant-1',
      linkedid: 'L-meta-1',
      callLegs: [
        {
          legType: 'agent',
          endedAt: null,
          channelName: 'PJSIP/1001-00000meta',
        },
      ],
    });

    const result = await service.mute(
      'tenant-1',
      'call-meta-1',
      { state: 'on', direction: 'all' },
      { correlationId: 'corr-123', idempotencyKey: 'idem-123' },
    );

    expect(result).toMatchObject({
      success: true,
      data: {
        callId: 'call-meta-1',
        accepted: true,
        correlationId: 'corr-123',
        idempotencyKey: 'idem-123',
      },
      error: null,
    });
    expect(eventBus.publish).toHaveBeenCalledWith(
      'ami.command.mute.requested',
      expect.objectContaining({
        callId: 'call-meta-1',
        linkedid: 'L-meta-1',
        correlationId: 'corr-123',
        idempotencyKey: 'idem-123',
      }),
    );
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd apps/server
npm test -- --runTestsByPath test/calls-service.integration.spec.ts -t "mute 는 correlationId 와 idempotencyKey 를 응답과 이벤트에 포함한다"
```

Expected: FAIL because `CallsService.mute` currently accepts only three arguments and the ack payload does not include metadata.

- [ ] **Step 3: Add shared command metadata utilities**

Create `apps/server/src/common/command-meta.util.ts`:

```ts
import { randomUUID } from 'crypto';

export interface CommandMeta {
  correlationId: string;
  idempotencyKey: string | null;
  requestedAt: string;
}

export function normalizeCommandMeta(input?: {
  correlationId?: string | null;
  idempotencyKey?: string | null;
}): CommandMeta {
  return {
    correlationId: input?.correlationId?.trim() || randomUUID(),
    idempotencyKey: input?.idempotencyKey?.trim() || null,
    requestedAt: new Date().toISOString(),
  };
}

export function buildAcceptedCommand<T extends Record<string, unknown>>(
  data: T,
  input?: { correlationId?: string | null; idempotencyKey?: string | null },
) {
  const meta = normalizeCommandMeta(input);
  return { ...data, accepted: true, ...meta };
}
```

Update the relevant controller signatures in `apps/server/src/modules/calls/calls.controller.ts` to collect headers:

```ts
import { Body, Controller, Get, Headers, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
```

```ts
  async mute(
    @Req() req: any,
    @Param('callId') callId: string,
    @Body() dto: MuteCallDto,
    @Headers('x-correlation-id') correlationId?: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    // existing permission checks stay here
    return this.callsService.mute(req.user.tenantId, callId, dto, { correlationId, idempotencyKey });
  }
```

Apply the same header pattern to `originate`, `originateInternal`, `transfer`, `cancelAttendedTransfer`, `completeAttendedTransfer`, `pickup`, `hold`, `resume`, and `hangup`.

Update `apps/server/src/modules/calls/calls.service.ts` to use the helper. Import it:

```ts
import { buildAcceptedCommand, normalizeCommandMeta } from '../../common/command-meta.util';
```

Change `mute` as the first conversion:

```ts
  async mute(
    tenantId: string,
    callId: string,
    dto: MuteCallDto,
    metaInput?: { correlationId?: string; idempotencyKey?: string },
  ) {
    const meta = normalizeCommandMeta(metaInput);
    // existing lookup and MuteAudio logic stays the same

    await this.eventBus.publish('ami.command.mute.requested', {
      callId,
      linkedid: call.linkedid,
      channel: agentLeg.channelName,
      state,
      direction,
      ...meta,
    });

    return {
      success: true,
      data: buildAcceptedCommand(
        {
          callId,
          state,
          direction,
          isMuted: state === 'on',
        },
        meta,
      ),
      error: null,
    };
  }
```

Then convert the other command methods to the same pattern:

```ts
return {
  success: true,
  data: buildAcceptedCommand({ callId, action }, meta),
  error: null,
};
```

- [ ] **Step 4: Run the focused tests**

Run:

```bash
cd apps/server
npm test -- --runTestsByPath test/calls-service.integration.spec.ts -t "mute 는 correlationId 와 idempotencyKey 를 응답과 이벤트에 포함한다"
```

Expected: PASS.

- [ ] **Step 5: Add one regression test for another command**

Add this second test to `apps/server/test/calls-service.integration.spec.ts`:

```ts
  it('pickup 은 헤더가 없을 때도 correlationId 를 자동 생성한다', async () => {
    prisma.callSessions.findFirst.mockResolvedValue({
      callId: 'call-pickup-1',
      tenantId: 'tenant-1',
      linkedid: 'L-pickup-1',
      sessionStatus: 'QUEUED',
      ringingAt: null,
      callLegs: [
        {
          legType: 'inbound',
          endedAt: null,
          channelName: 'PJSIP/trunk-provider-00000020',
        },
      ],
    });
    prisma.callSessions.update.mockResolvedValue({ callId: 'call-pickup-1' });

    const result = await service.pickup('tenant-1', 'call-pickup-1', {
      agentId: 'agent-1',
      extension: '1001',
    });

    expect(result.data.accepted).toBe(true);
    expect(typeof result.data.correlationId).toBe('string');
    expect(result.data.correlationId.length).toBeGreaterThan(10);
  });
```

Run:

```bash
cd apps/server
npm test -- --runTestsByPath test/calls-service.integration.spec.ts -t "pickup 은 헤더가 없을 때도 correlationId 를 자동 생성한다"
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/common/command-meta.util.ts apps/server/src/modules/calls/calls.controller.ts apps/server/src/modules/calls/calls.service.ts apps/server/test/calls-service.integration.spec.ts
git commit -m "feat: standardize call command metadata"
```

## Task 3: Add Redis-Backed Desktop Session Handoff Endpoints

**Files:**
- Create: `apps/server/src/modules/auth/dto/create-handoff.dto.ts`
- Create: `apps/server/src/modules/auth/dto/exchange-handoff.dto.ts`
- Modify: `apps/server/src/modules/auth/auth.controller.ts`
- Modify: `apps/server/src/modules/auth/auth.service.ts`
- Create: `apps/server/test/auth-handoff.integration.spec.ts`
- Test: `apps/server/test/auth-handoff.integration.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/server/test/auth-handoff.integration.spec.ts`:

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../src/modules/auth/auth.service';
import { PrismaService } from '../src/common/prisma.service';
import { CallsService } from '../src/modules/calls/calls.service';
import { EventBusService } from '../src/modules/events/event-bus.service';
import { QueuesService } from '../src/modules/queues/queues.service';
import { RedisService } from '../src/modules/redis/redis.service';

describe('AuthService desktop handoff', () => {
  let service: AuthService;
  const redisStore = new Map<string, string>();
  const redisClient = {
    set: jest.fn(async (key: string, value: string) => {
      redisStore.set(key, value);
      return 'OK';
    }),
    get: jest.fn(async (key: string) => redisStore.get(key) ?? null),
    del: jest.fn(async (key: string) => {
      const existed = redisStore.has(key);
      redisStore.delete(key);
      return existed ? 1 : 0;
    }),
  };
  const prisma = {
    agents: {
      findUnique: jest.fn(),
    },
    refreshTokens: {
      create: jest.fn(),
    },
  };

  beforeEach(async () => {
    redisStore.clear();
    jest.clearAllMocks();
    prisma.agents.findUnique.mockResolvedValue({
      agentId: 'agent-1',
      agentName: '상담원1',
      extension: '1001',
      role: 'agent',
      tenantId: 'tenant-1',
      isActive: true,
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('change_me') } },
        { provide: CallsService, useValue: { getOutboundDialOptions: jest.fn(), getCallControlCapabilities: jest.fn() } },
        { provide: EventBusService, useValue: { publish: jest.fn() } },
        { provide: QueuesService, useValue: { getSummary: jest.fn() } },
        { provide: RedisService, useValue: { getClient: () => redisClient } },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  it('createDesktopHandoff 와 exchangeDesktopHandoff 는 토큰을 1회만 교환한다', async () => {
    const handoff = await service.createDesktopHandoff({
      sub: 'agent-1',
      tenantId: 'tenant-1',
      role: 'agent',
      extension: '1001',
    });

    const exchanged = await service.exchangeDesktopHandoff(handoff.data.handoffToken);

    expect(exchanged.success).toBe(true);
    expect(exchanged.data.agent.agentId).toBe('agent-1');
    await expect(service.exchangeDesktopHandoff(handoff.data.handoffToken)).rejects.toThrow(
      'Invalid or expired handoff token',
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd apps/server
npm test -- --runTestsByPath test/auth-handoff.integration.spec.ts
```

Expected: FAIL because `AuthService` does not yet expose `createDesktopHandoff` or `exchangeDesktopHandoff`.

- [ ] **Step 3: Add the DTOs and controller endpoints**

Create `apps/server/src/modules/auth/dto/create-handoff.dto.ts`:

```ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CreateHandoffDto {
  @ApiPropertyOptional({ example: 'front-desk-pc-01' })
  @IsOptional()
  @IsString()
  deviceName?: string;
}
```

Create `apps/server/src/modules/auth/dto/exchange-handoff.dto.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class ExchangeHandoffDto {
  @ApiProperty()
  @IsString()
  handoffToken: string;
}
```

Update `apps/server/src/modules/auth/auth.controller.ts`:

```ts
import { CreateHandoffDto } from './dto/create-handoff.dto';
import { ExchangeHandoffDto } from './dto/exchange-handoff.dto';
```

```ts
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('auth/handoff')
  createDesktopHandoff(@CurrentUser() user: any, @Body() dto: CreateHandoffDto) {
    return this.authService.createDesktopHandoff(user, dto);
  }

  @Post('auth/handoff/exchange')
  exchangeDesktopHandoff(@Body() dto: ExchangeHandoffDto) {
    return this.authService.exchangeDesktopHandoff(dto.handoffToken);
  }
```

- [ ] **Step 4: Implement the Redis-backed service methods**

Import Redis in `apps/server/src/modules/auth/auth.service.ts`:

```ts
import { randomBytes } from 'crypto';
import { RedisService } from '../redis/redis.service';
```

Inject it:

```ts
    private readonly redis: RedisService,
```

Add these helpers and methods to `AuthService`:

```ts
  private handoffKey(token: string) {
    return `kaster:auth:handoff:${token}`;
  }

  async createDesktopHandoff(
    user: { sub: string; tenantId: string; role: string; extension: string },
    dto?: { deviceName?: string },
  ) {
    const handoffToken = randomBytes(24).toString('hex');
    const payload = JSON.stringify({
      agentId: user.sub,
      tenantId: user.tenantId,
      role: user.role,
      extension: user.extension,
      deviceName: dto?.deviceName ?? null,
    });
    await this.redis.getClient().set(this.handoffKey(handoffToken), payload, 'EX', 60);

    return {
      success: true,
      data: {
        handoffToken,
        expiresIn: 60,
      },
      error: null,
    };
  }

  async exchangeDesktopHandoff(handoffToken: string) {
    const key = this.handoffKey(handoffToken);
    const raw = await this.redis.getClient().get(key);
    if (!raw) {
      throw new UnauthorizedException('Invalid or expired handoff token');
    }
    await this.redis.getClient().del(key);

    const payload = JSON.parse(raw) as {
      agentId: string;
      tenantId: string;
    };
    const agent = await this.prisma.agents.findUnique({
      where: { agentId: payload.agentId },
    });
    if (!agent || !agent.isActive || agent.tenantId !== payload.tenantId) {
      throw new UnauthorizedException('Invalid or expired handoff token');
    }

    const accessToken = this.signAccessToken(agent);
    const refreshToken = await this.issueRefreshToken(agent.agentId, agent.tenantId, {
      userAgent: 'desktop-handoff',
      ipAddress: 'handoff',
    });

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
      },
      error: null,
    };
  }
```

- [ ] **Step 5: Run the focused test**

Run:

```bash
cd apps/server
npm test -- --runTestsByPath test/auth-handoff.integration.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/modules/auth/dto/create-handoff.dto.ts apps/server/src/modules/auth/dto/exchange-handoff.dto.ts apps/server/src/modules/auth/auth.controller.ts apps/server/src/modules/auth/auth.service.ts apps/server/test/auth-handoff.integration.spec.ts
git commit -m "feat: add desktop auth handoff flow"
```

## Task 4: Teach the Web Agent Shell to Consume Metadata-Bearing Command Acks

**Files:**
- Modify: `apps/web/src/types/cti.ts`
- Modify: `apps/web/src/api/realApi.ts`
- Modify: `apps/web/src/store/useCtiStore.ts`
- Modify: `apps/web/src/store/useCtiStore.test.ts`
- Test: `apps/web/src/store/useCtiStore.test.ts`

- [ ] **Step 1: Write the failing assertion for the API shape**

Extend `apps/web/src/store/useCtiStore.test.ts` with this second test:

```ts
  it('toggleMute 는 서버 ack 의 requestedAt 도 로그 메시지에 남긴다', async () => {
    await useCtiStore.getState().toggleMute();

    expect(useCtiStore.getState().eventLog[0].message).toContain('2026-04-22T12:00:00.000Z');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd apps/web
npm test -- --run src/store/useCtiStore.test.ts
```

Expected: FAIL because the store log still uses a hard-coded message and ignores metadata fields from the API ack.

- [ ] **Step 3: Add the shared ack type and API adapters**

Add this type block near the API response types in `apps/web/src/types/cti.ts`:

```ts
export interface CommandAck {
  accepted: boolean;
  requestedAt: string;
  correlationId: string;
  idempotencyKey?: string | null;
}
```

Update the command-returning functions in `apps/web/src/api/realApi.ts`. For example, change `muteCall` to:

```ts
export async function muteCall(
  callId: string,
  state: 'on' | 'off',
): Promise<ApiResponse<CommandAck & { callId: string; state: 'on' | 'off'; direction: string; isMuted?: boolean }>> {
  const res = await apiClient.post(`/calls/${callId}/mute`, {
    state,
    direction: 'all',
  });
  return { success: true, data: res.data?.data, error: null };
}
```

Apply the same pattern to `transferCall`, `cancelAttendedTransferCall`, `completeAttendedTransferCall`, `pickupCall`, `holdCall`, `hangupCall`, `originateExternalCall`, and `originateInternalCall`.

- [ ] **Step 4: Update the store logging to preserve metadata**

Update `apps/web/src/store/useCtiStore.ts` in the `toggleMute` handler:

```ts
    const ack = await muteCall(callId, nextState);
    const msg = nextState === 'on'
      ? `통화 음소거 요청이 처리되었습니다. [${ack.data.correlationId}] ${ack.data.requestedAt}`
      : `통화 음소거 해제 요청이 처리되었습니다. [${ack.data.correlationId}] ${ack.data.requestedAt}`;
```

Use the same message pattern for the other command handlers:

```ts
const msg = `보류 요청이 접수되었습니다. [${ack.data.correlationId}] ${ack.data.requestedAt}`;
```

Do not change user-visible flow beyond enriching the messages. The web shell still behaves the same; it now just preserves metadata needed for later troubleshooting and CRM correlation.

- [ ] **Step 5: Run the web test**

Run:

```bash
cd apps/web
npm test -- --run src/store/useCtiStore.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run the production build**

Run:

```bash
cd apps/web
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/types/cti.ts apps/web/src/api/realApi.ts apps/web/src/store/useCtiStore.ts apps/web/src/store/useCtiStore.test.ts
git commit -m "feat: preserve command metadata in web shell"
```

## Task 5: Publish the First External CRM Contract Document and Refresh OpenAPI

**Files:**
- Create: `docs/design/external-crm-cti-api-contract.md`
- Modify: `apps/server/src/modules/auth/auth.controller.ts`
- Modify: `apps/server/src/modules/calls/calls.controller.ts`
- Test: `apps/server/scripts/export-openapi.ts` via existing script

- [ ] **Step 1: Write the contract document**

Create `docs/design/external-crm-cti-api-contract.md` with this initial structure:

```md
# External CRM CTI API Contract

## Purpose

This document defines the minimum contract an external CRM can rely on when integrating with KAster CTI.

## Authentication

- Primary user authentication happens against KAster CTI.
- Browser CRM clients must not receive long-lived shared refresh tokens.
- Native runtime pairing uses `POST /auth/handoff` and `POST /auth/handoff/exchange`.

## Command Rules

- Every CTI command accepts optional `x-correlation-id`.
- Every CTI command accepts optional `idempotency-key`.
- Every CTI command returns `accepted`, `requestedAt`, and `correlationId`.
- Final call outcome must be confirmed through follow-up events or state refresh.

## Core Command Endpoints

- `POST /calls/originate`
- `POST /calls/originate/internal`
- `POST /calls/:callId/pickup`
- `POST /calls/:callId/transfer`
- `POST /calls/:callId/transfer/attended/cancel`
- `POST /calls/:callId/transfer/attended/complete`
- `POST /calls/:callId/mute`
- `POST /calls/:callId/hold`
- `POST /calls/:callId/resume`
- `POST /calls/:callId/hangup`

## Query Endpoints

- `GET /me/session`
- `GET /calls/active`
- `GET /calls/:callId`
- `GET /calls/history`
- `GET /queues/summary`
- `GET /agents`
```

- [ ] **Step 2: Annotate Swagger descriptions so the contract exports cleanly**

Add this sentence to each command endpoint description in `apps/server/src/modules/calls/calls.controller.ts`:

```ts
' Clients may send x-correlation-id and idempotency-key headers; the response echoes correlationId and requestedAt.'
```

Add this description to the new handoff endpoints in `apps/server/src/modules/auth/auth.controller.ts`:

```ts
  @ApiOperation({
    summary: 'Desktop handoff token 생성',
    description: '현재 로그인한 웹 세션이 60초짜리 1회용 handoff token 을 발급해 Windows 런타임이 교환할 수 있게 한다.',
  })
```

```ts
  @ApiOperation({
    summary: 'Desktop handoff token 교환',
    description: '1회용 handoff token 을 access/refresh token 으로 교환한다. 성공하면 같은 token 은 재사용할 수 없다.',
  })
```

- [ ] **Step 3: Export OpenAPI**

Run:

```bash
cd apps/server
npm run openapi:export
```

Expected: PASS and the generated OpenAPI file reflects the new endpoint descriptions.

- [ ] **Step 4: Commit**

```bash
git add docs/design/external-crm-cti-api-contract.md apps/server/src/modules/auth/auth.controller.ts apps/server/src/modules/calls/calls.controller.ts
git commit -m "docs: publish initial external crm cti contract"
```

## Task 6: Run the Final Focused Regression Pass

**Files:**
- Modify: none unless regression fixes are required
- Test: focused server tests, web tests, and production builds

- [ ] **Step 1: Run the server tests**

Run:

```bash
cd apps/server
npm test -- --runTestsByPath test/calls-service.integration.spec.ts test/auth-handoff.integration.spec.ts
```

Expected: PASS.

- [ ] **Step 2: Run the web tests**

Run:

```bash
cd apps/web
npm test -- --run src/store/useCtiStore.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run both production builds**

Run:

```bash
cd apps/server
npm run build
```

Expected: PASS.

Run:

```bash
cd apps/web
npm run build
```

Expected: PASS.

- [ ] **Step 4: Check the diff**

Run:

```bash
git status --short
git diff --stat
```

Expected: only the planned server/web/docs files are changed plus lockfile updates from the new web test dependencies.

- [ ] **Step 5: Commit follow-up fixes only if Step 4 surfaced regressions**

```bash
git add apps/server/src/common/command-meta.util.ts apps/server/src/modules/auth/auth.controller.ts apps/server/src/modules/auth/auth.service.ts apps/server/src/modules/auth/dto/create-handoff.dto.ts apps/server/src/modules/auth/dto/exchange-handoff.dto.ts apps/server/src/modules/calls/calls.controller.ts apps/server/src/modules/calls/calls.service.ts apps/server/test/auth-handoff.integration.spec.ts apps/server/test/calls-service.integration.spec.ts apps/web/package.json apps/web/vitest.config.ts apps/web/src/test/setup.ts apps/web/src/types/cti.ts apps/web/src/api/realApi.ts apps/web/src/store/useCtiStore.ts apps/web/src/store/useCtiStore.test.ts docs/design/external-crm-cti-api-contract.md
git commit -m "fix: polish hybrid runtime contract hardening"
```

## Spec Coverage Check

- `웹은 업무 셸, 데스크톱은 통화 런타임`:
  Covered indirectly by keeping the web changes limited to command-ack consumption and by adding desktop handoff rather than desktop UI.
- `서버는 상태 기준 시스템`:
  Covered by command metadata normalization in `CallsService` and Redis-backed handoff in `AuthService`.
- `세션 위임 / handoff token`:
  Covered by Task 3.
- `외부 CRM API 규칙`:
  Covered by Task 5 docs plus command metadata in Task 2.
- `이벤트 의미 규칙`:
  Partially covered in Task 2 through command-request event metadata. Full business-event envelope standardization is deferred to the desktop runtime and CRM package follow-up plans.

## Deferred Follow-Up Plans

The following items are intentionally not implemented in this plan and must each get a separate implementation plan:

- Windows desktop runtime scaffold and packaging
- WebRTC/SIP media lifecycle
- Device enumeration and headset UX
- Full business-event envelope standardization for all realtime events
- External CRM sample client and SDK
