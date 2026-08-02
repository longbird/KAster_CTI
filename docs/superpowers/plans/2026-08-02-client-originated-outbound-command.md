# Client-Originated Outbound Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 상담원 클라이언트만 별도 명령 프로토콜로 외부 발신을 요청하고, 로그인 후 조회한 권한이 없으면 발신 UI가 활성화되지 않게 한다.

**Architecture:** 서버가 상담원 JWT와 DB 권한을 최종 신뢰 기준으로 삼고, 상담원 발신 전용 endpoint는 클라이언트가 보낸 내선번호를 받지 않는다. 클라이언트는 `GET /me/call-capabilities`로 권한과 발신번호 목록을 조회하고, 외부 발신은 `POST /client/call-commands/originate`로 보낸다. API 응답은 요청 접수만 의미하며 실제 연결 성공은 PBX 이벤트와 WebSocket 상태 변경으로 판정한다.

**Tech Stack:** NestJS 10, Prisma, Redis, Electron main/preload/renderer, Vite React, Jest/Vitest.

---

### Task 1: Capability API

**Files:**
- Modify: `apps/server/src/modules/auth/auth.controller.ts`
- Modify: `apps/server/src/modules/auth/auth.service.ts`
- Modify: `apps/server/src/modules/calls/calls.service.ts`
- Test: `apps/server/src/modules/auth/auth.service.spec.ts`

- [ ] **Step 1: Add server capability payload**

Add `CallsService.getOutboundCallCapabilities(tenantId, agentId)` that returns:

```ts
{
  canOriginateExternal: boolean;
  canOriginateInternal: boolean;
  canUsePhoneDirect: boolean;
  outboundDialPermissions: {
    phoneDirect: boolean;
    domestic: boolean;
    representative: boolean;
    paid: boolean;
    international: boolean;
  };
  outboundDialOptions: {
    allowedCallerIds: string[];
    defaultCallerId: string | null;
  };
  disabledReasons: string[];
}
```

- [ ] **Step 2: Add `GET /me/call-capabilities`**

Controller implementation:

```ts
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Get('me/call-capabilities')
@ApiOperation({ summary: '현재 상담원 발신 권한 조회' })
@ApiOkResponse({ type: ApiResponseDto })
callCapabilities(@CurrentUser() user: any) {
  return this.authService.getCallCapabilities(user);
}
```

- [ ] **Step 3: Include capabilities in existing session responses**

Keep `/me/session` compatible by adding `callCapabilities` next to existing `outboundDialOptions`.

- [ ] **Step 4: Test capability derivation**

Run:

```bash
cd apps/server
npm test -- --runInBand src/modules/auth/auth.service.spec.ts
```

Expected: PASS. Agent without caller IDs returns `canOriginateExternal:false`; default permissions keep `phoneDirect:false`, `domestic:true`, `representative:true`, `paid:false`, `international:false`.

### Task 2: Client Command Endpoint

**Files:**
- Create: `apps/server/src/modules/calls/dto/client-originate-command.dto.ts`
- Modify: `apps/server/src/modules/calls/calls.controller.ts`
- Modify: `apps/server/src/modules/calls/calls.service.ts`
- Test: `apps/server/src/modules/calls/calls.service.spec.ts`

- [ ] **Step 1: Create DTO without client-supplied agent extension**

```ts
export class ClientOriginateCommandDto {
  @ApiProperty()
  @IsString()
  commandId: string;

  @ApiProperty()
  @IsString()
  phoneNumber: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiProperty({ required: false, description: '허용된 발신번호 목록에 포함된 번호만 사용 가능' })
  @IsOptional()
  @IsString()
  callerId?: string;
}
```

- [ ] **Step 2: Add endpoint**

```ts
@Post('/client/call-commands/originate')
clientOriginate(...) {
  return this.callsService.originateFromClientProtocol(...);
}
```

The endpoint requires `Authorization`, `X-Client-Protocol`, `X-Command-Nonce`, `X-Command-Timestamp`, `Idempotency-Key`, and `X-Correlation-Id`. The initial implementation accepts `kaster-desktop-v1` and stores nonce in Redis with TTL to prevent replay.

- [ ] **Step 3: Implement service wrapper**

`originateFromClientProtocol()` validates protocol headers, timestamp skew, nonce replay, then calls existing `originate()` with `agentExtension` derived from the verified actor.

- [ ] **Step 4: Test spoof resistance**

Run:

```bash
cd apps/server
npm test -- --runInBand src/modules/calls/calls.service.spec.ts
```

Expected: PASS. Client command cannot override another extension, rejects stale timestamp, rejects duplicate nonce, and still blocks paid/international numbers unless the agent setting allows them.

### Task 3: Desktop Client Wiring

**Files:**
- Modify: `apps/desktop/src/shared/cti.ts`
- Modify: `apps/desktop/src/shared/ipc.ts`
- Modify: `apps/desktop/src/main/cti-runtime.ts`
- Modify: `apps/desktop/src/main/cti-runtime.test.ts`
- Modify: `apps/desktop/src/renderer/src/store/useDesktopStore.ts`
- Modify: `apps/desktop/src/renderer/src/components/SoftphoneShell.tsx`
- Test: `apps/desktop/src/main/cti-runtime.test.ts`

- [ ] **Step 1: Add shared `CallCapabilities` type**

Expose capability fields to main and renderer.

- [ ] **Step 2: Fetch capabilities after runtime connection**

`CtiRuntime.getCallCapabilities()` calls `/me/call-capabilities`. Store the result in the renderer state.

- [ ] **Step 3: Send client command protocol**

Desktop originate uses `/client/call-commands/originate`, generates `commandId`, `nonce`, `timestamp`, `correlationId`, and `idempotencyKey`, and sends `X-Client-Protocol: kaster-desktop-v1`.

- [ ] **Step 4: Gate UI**

Disable external dial button when `canOriginateExternal` is false, caller ID list is empty, runtime is disconnected, or the number is empty.

- [ ] **Step 5: Test desktop runtime**

Run:

```bash
cd apps/desktop
npm test -- cti-runtime.test.ts --run
```

Expected: PASS. Originate posts to the client command endpoint and includes protocol headers.

### Task 4: Web Client Gating

**Files:**
- Modify: `apps/web/src/types/cti.ts`
- Modify: `apps/web/src/api/realApi.ts`
- Modify: `apps/web/src/api/mockApi.ts`
- Modify: `apps/web/src/store/useCtiStore.ts`
- Modify: `apps/web/src/components/FloatingDialerWindow.tsx`
- Test: `apps/web/src/store/useCtiStore.test.ts`

- [ ] **Step 1: Add `callCapabilities` to session type**

Use the same shape as the desktop shared type.

- [ ] **Step 2: Fetch capabilities in `getAgentSession()`**

Read `callCapabilities` from `/me/session`, and fall back to caller ID list if older servers do not return it.

- [ ] **Step 3: Block UI and store action**

Disable external originate controls when `canOriginateExternal` is false. Store action throws a clear error before calling the API if the permission is missing.

- [ ] **Step 4: Test store block**

Run:

```bash
cd apps/web
npm test -- useCtiStore.test.ts --run
```

Expected: PASS. When external originate is disabled, API originate is not called.

### Task 5: Final Verification

**Files:**
- Validate only; no planned file edits.

- [ ] **Step 1: Run server build**

```bash
cd apps/server
npm run build
```

Expected: PASS.

- [ ] **Step 2: Run focused client tests**

```bash
cd apps/desktop
npm test -- cti-runtime.test.ts --run
cd ../web
npm test -- useCtiStore.test.ts --run
```

Expected: PASS.

- [ ] **Step 3: Deployment gate**

Do not deploy until the operating server has been backed up and the current local commit has been pushed. Existing production block rules for PBX direct phone outbound remain in force.
