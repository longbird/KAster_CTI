# Asterisk Config UI Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin 대시보드에서 Asterisk SIP 트렁크, DID, IVR 메뉴, 에이전트 내선을 CRUD하고 즉시 Asterisk에 반영하는 기능을 구현한다.

**Architecture:** DB-first. 4개 신규 Prisma 테이블 + agents.sipPassword 컬럼에 설정 저장. NestJS `AsteriskConfigModule`이 CRUD → .conf 렌더링 → 파일 쓰기 → AMI reload 파이프라인 전체를 담당. React admin UI는 `/asterisk` 4탭 페이지를 제공.

**Tech Stack:** NestJS 10 + Prisma 5 + PostgreSQL (backend); Vite 5 + React 18 + Ant Design 5 + axios (admin frontend); `react-syntax-highlighter` (.conf 미리보기); Jest + ts-jest (backend unit tests)

**Spec:** `docs/design/2026-04-16-asterisk-config-ui-design.md`

---

## Chunk 1: DB Schema & Migration

### Task 1: Configure Jest for server

**Files:**
- Create: `apps/server/jest.config.ts`

- [ ] Create `apps/server/jest.config.ts`:

```ts
import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
};

export default config;
```

- [ ] Verify Jest runs with no tests:
```bash
cd apps/server && npx jest --passWithNoTests
```
Expected: `Test Suites: 0 passed` (exit 0)

- [ ] Commit:
```bash
git add apps/server/jest.config.ts
git commit -m "chore(server): add Jest config"
```

---

### Task 2: Update Prisma schema

**Files:**
- Modify: `apps/server/prisma/schema.prisma`

- [ ] Add `sipPassword` to `agents` model after the `extension` field (line ~46):

```prisma
sipPassword        String?   @db.Text
```

- [ ] Add back-relations to `tenants` model after `refreshTokens refreshTokens[]` (line ~35):

```prisma
  asteriskTrunks   AsteriskTrunk[]
  asteriskDids     AsteriskDid[]
  asteriskIvrMenus AsteriskIvrMenu[]
```

- [ ] Append 4 new models at the end of `schema.prisma`:

```prisma
model AsteriskTrunk {
  id         String   @id @default(uuid()) @db.Uuid
  tenantId   String   @db.Uuid
  name       String   @db.VarChar(128)
  host       String   @db.VarChar(255)
  port       Int      @default(5060)
  username   String   @db.VarChar(128)
  password   String   @db.Text
  fromDomain String   @db.VarChar(255)
  codecs     String   @default("alaw,ulaw") @db.VarChar(64)
  enabled    Boolean  @default(true)
  createdAt  DateTime @default(now()) @db.Timestamptz(6)
  updatedAt  DateTime @updatedAt @db.Timestamptz(6)
  tenant     tenants  @relation(fields: [tenantId], references: [tenantId])

  @@unique([tenantId, name])
}

model AsteriskDid {
  id          String           @id @default(uuid()) @db.Uuid
  tenantId    String           @db.Uuid
  did         String           @db.VarChar(32)
  description String?          @db.VarChar(255)
  ivrMenuId   String?          @db.Uuid
  directQueue String?          @db.VarChar(64)
  enabled     Boolean          @default(true)
  createdAt   DateTime         @default(now()) @db.Timestamptz(6)
  updatedAt   DateTime         @updatedAt @db.Timestamptz(6)
  tenant      tenants          @relation(fields: [tenantId], references: [tenantId])
  ivrMenu     AsteriskIvrMenu? @relation(fields: [ivrMenuId], references: [id])

  @@unique([tenantId, did])
}

model AsteriskIvrMenu {
  id            String             @id @default(uuid()) @db.Uuid
  tenantId      String             @db.Uuid
  name          String             @db.VarChar(128)
  welcomePrompt String?            @db.VarChar(128)
  menuPrompt    String?            @db.VarChar(128)
  timeoutSecs   Int                @default(5)
  entries       AsteriskIvrEntry[]
  dids          AsteriskDid[]
  tenant        tenants            @relation(fields: [tenantId], references: [tenantId])
  createdAt     DateTime           @default(now()) @db.Timestamptz(6)
  updatedAt     DateTime           @updatedAt @db.Timestamptz(6)

  @@unique([tenantId, name])
}

model AsteriskIvrEntry {
  id        String          @id @default(uuid()) @db.Uuid
  tenantId  String          @db.Uuid
  menuId    String          @db.Uuid
  digit     String          @db.VarChar(2)
  label     String          @db.VarChar(64)
  queueName String          @db.VarChar(64)
  menu      AsteriskIvrMenu @relation(fields: [menuId], references: [id], onDelete: Cascade)

  @@unique([menuId, digit])
}
```

- [ ] Validate schema:
```bash
cd apps/server && npx prisma validate
```
Expected: `The schema at ... is valid!`

- [ ] Commit:
```bash
git add apps/server/prisma/schema.prisma
git commit -m "feat(db): add Asterisk config tables to Prisma schema"
```

---

### Task 3: Create and run migration

**Files:**
- Create: `apps/server/prisma/migrations/20260416_asterisk_config/migration.sql` (generated)

- [ ] Generate migration (DB must be running: `docker compose up -d postgres`):
```bash
cd apps/server && npx prisma migrate dev --name asterisk_config --create-only
```
Expected: `prisma/migrations/20260416.../migration.sql` created

- [ ] Open the generated `migration.sql` and append the XOR CHECK constraint manually at the end (Prisma cannot generate CHECK constraints):
```sql
ALTER TABLE "AsteriskDid" ADD CONSTRAINT "asterisk_did_xor_check"
  CHECK (("ivrMenuId" IS NULL) != ("directQueue" IS NULL));
```

- [ ] Apply the migration:
```bash
cd apps/server && npx prisma migrate deploy
```
Expected: migration applied

- [ ] Verify Prisma client regenerated (new model types available):
```bash
cd apps/server && npx prisma generate
```

- [ ] Commit:
```bash
git add apps/server/prisma/migrations/
git commit -m "feat(db): migration for Asterisk config tables + agents.sipPassword"
```

---

## Chunk 2: Backend Renderers (Pure Functions — TDD)

### Task 4: PjsipRendererService

**Files:**
- Create: `apps/server/src/modules/asterisk-config/renderers/pjsip.renderer.ts`
- Create: `apps/server/src/modules/asterisk-config/renderers/pjsip.renderer.spec.ts`

- [ ] Write failing tests first (`pjsip.renderer.spec.ts`):

```ts
import { renderPjsip } from './pjsip.renderer';

describe('renderPjsip', () => {
  it('renders global and transport sections', () => {
    const result = renderPjsip({ trunks: [], agents: [] });
    expect(result).toContain('[global]');
    expect(result).toContain('[transport-udp]');
  });

  it('renders enabled trunk sections', () => {
    const result = renderPjsip({
      trunks: [{
        id: 'u1', name: 'KT 회선 1', host: '1.2.3.4', port: 5060,
        username: 'trunk01', password: 's3cret', fromDomain: '1.2.3.4',
        codecs: 'alaw,ulaw', enabled: true,
      }],
      agents: [],
    });
    expect(result).toContain('[trunk-kt-1-auth]');
    expect(result).toContain('username=trunk01');
    expect(result).toContain('contact=sip:1.2.3.4:5060');
    expect(result).toContain('allow=alaw,ulaw');
  });

  it('skips disabled trunks', () => {
    const result = renderPjsip({
      trunks: [{ id: 'x', name: 'Off', host: '1.1.1.1', port: 5060,
        username: 'u', password: 'p', fromDomain: 'd', codecs: 'alaw', enabled: false }],
      agents: [],
    });
    expect(result).not.toContain('[trunk-');
  });

  it('renders agent endpoint for agent with sipPassword', () => {
    const result = renderPjsip({
      trunks: [],
      agents: [{ agentId: 'a1', extension: '1001', agentName: 'Agent1', sipPassword: 'sip123' }],
    });
    expect(result).toContain('[1001-auth]');
    expect(result).toContain('password=sip123');
    expect(result).toContain('[1001]');
    expect(result).toContain('callerid=Agent1 <1001>');
  });

  it('skips agents without sipPassword', () => {
    const result = renderPjsip({
      trunks: [],
      agents: [{ agentId: 'a2', extension: '1002', agentName: 'Agent2', sipPassword: null }],
    });
    expect(result).not.toContain('[1002]');
  });
});
```

- [ ] Run test — verify FAIL:
```bash
cd apps/server && npx jest pjsip.renderer --no-coverage
```
Expected: FAIL (module not found)

- [ ] Implement `pjsip.renderer.ts`:

```ts
export interface TrunkInput {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  password: string;
  fromDomain: string;
  codecs: string;
  enabled: boolean;
}

export interface AgentInput {
  agentId: string;
  extension: string;
  agentName: string;
  sipPassword: string | null;
}

export interface PjsipInput {
  trunks: TrunkInput[];
  agents: AgentInput[];
}

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function renderTrunk(trunk: TrunkInput): string {
  const slug = toSlug(trunk.name);
  return [
    `[trunk-${slug}-auth]`,
    `type=auth`,
    `auth_type=userpass`,
    `username=${trunk.username}`,
    `password=${trunk.password}`,
    ``,
    `[trunk-${slug}-aor]`,
    `type=aor`,
    `contact=sip:${trunk.host}:${trunk.port}`,
    ``,
    `[trunk-${slug}-identify]`,
    `type=identify`,
    `endpoint=trunk-${slug}`,
    `match=${trunk.host}`,
    ``,
    `[trunk-${slug}]`,
    `type=endpoint`,
    `transport=transport-udp`,
    `context=inbound-main`,
    `disallow=all`,
    `allow=${trunk.codecs}`,
    `aors=trunk-${slug}-aor`,
    `outbound_auth=trunk-${slug}-auth`,
    `from_user=${trunk.username}`,
    `from_domain=${trunk.fromDomain}`,
    `direct_media=no`,
    `rtp_symmetric=yes`,
    `force_rport=yes`,
    `rewrite_contact=yes`,
    `trust_id_inbound=yes`,
    `send_pai=yes`,
  ].join('\n');
}

function renderAgent(agent: AgentInput): string {
  return [
    `[${agent.extension}-auth]`,
    `type=auth`,
    `auth_type=userpass`,
    `username=${agent.extension}`,
    `password=${agent.sipPassword}`,
    ``,
    `[${agent.extension}-aor]`,
    `type=aor`,
    `max_contacts=1`,
    ``,
    `[${agent.extension}]`,
    `type=endpoint`,
    `context=agent-phone`,
    `disallow=all`,
    `allow=alaw,ulaw`,
    `auth=${agent.extension}-auth`,
    `aors=${agent.extension}-aor`,
    `callerid=${agent.agentName} <${agent.extension}>`,
    `direct_media=no`,
    `rtp_symmetric=yes`,
    `force_rport=yes`,
    `rewrite_contact=yes`,
  ].join('\n');
}

export function renderPjsip(input: PjsipInput): string {
  const header = [
    `[global]`,
    `type=global`,
    `user_agent=KAster_CTI`,
    ``,
    `[transport-udp]`,
    `type=transport`,
    `protocol=udp`,
    `bind=0.0.0.0:5060`,
  ].join('\n');

  const trunks = input.trunks
    .filter((t) => t.enabled)
    .map(renderTrunk)
    .join('\n\n');

  const agents = input.agents
    .filter((a) => a.sipPassword !== null)
    .map(renderAgent)
    .join('\n\n');

  return [header, trunks, agents].filter(Boolean).join('\n\n');
}
```

- [ ] Run test — verify PASS:
```bash
cd apps/server && npx jest pjsip.renderer --no-coverage
```
Expected: PASS (5 tests)

- [ ] Commit:
```bash
git add apps/server/src/modules/asterisk-config/renderers/
git commit -m "feat(asterisk-config): PjsipRenderer with passing tests"
```

---

### Task 5: DialplanRenderer

**Files:**
- Create: `apps/server/src/modules/asterisk-config/renderers/dialplan.renderer.ts`
- Create: `apps/server/src/modules/asterisk-config/renderers/dialplan.renderer.spec.ts`

- [ ] Write failing tests (`dialplan.renderer.spec.ts`):

```ts
import { renderDialplan } from './dialplan.renderer';

const baseMenu = {
  id: 'm1', name: 'Main Menu',
  welcomePrompt: 'custom/welcome', menuPrompt: 'custom/main_menu', timeoutSecs: 5,
  entries: [
    { id: 'e1', digit: '1', label: 'Sales', queueName: 'sales', tenantId: 't1', menuId: 'm1' },
    { id: 'e2', digit: '2', label: 'Support', queueName: 'support', tenantId: 't1', menuId: 'm1' },
  ],
};

describe('renderDialplan', () => {
  it('renders inbound-main context', () => {
    const { extensionsInbound } = renderDialplan({ dids: [], ivrMenus: [] });
    expect(extensionsInbound).toContain('[inbound-main]');
  });

  it('renders DID with IVR menu link', () => {
    const { extensionsInbound } = renderDialplan({
      dids: [{ id: 'd1', did: '07012345678', ivrMenuId: 'm1', directQueue: null, enabled: true, description: null }],
      ivrMenus: [baseMenu],
    });
    expect(extensionsInbound).toContain('exten => 07012345678');
    expect(extensionsInbound).toContain('ivr-menu-main-menu');
  });

  it('renders DID with direct queue', () => {
    const { extensionsInbound } = renderDialplan({
      dids: [{ id: 'd2', did: '07099999999', ivrMenuId: null, directQueue: 'sales', enabled: true, description: null }],
      ivrMenus: [],
    });
    expect(extensionsInbound).toContain('exten => 07099999999');
    expect(extensionsInbound).toContain('Goto(queue-entry,sales,1)');
  });

  it('skips disabled DIDs', () => {
    const { extensionsInbound } = renderDialplan({
      dids: [{ id: 'd3', did: '07011111111', ivrMenuId: null, directQueue: 'sales', enabled: false, description: null }],
      ivrMenus: [],
    });
    expect(extensionsInbound).not.toContain('07011111111');
  });

  it('renders IVR menu context with DTMF entries', () => {
    const { extensionsQueue } = renderDialplan({ dids: [], ivrMenus: [baseMenu] });
    expect(extensionsQueue).toContain('[ivr-menu-main-menu]');
    expect(extensionsQueue).toContain('exten => 1,1,Goto(queue-entry,sales,1)');
    expect(extensionsQueue).toContain('exten => 2,1,Goto(queue-entry,support,1)');
    expect(extensionsQueue).toContain('exten => t,1,Playback(vm-goodbye)');
  });

  it('skips DID with no target and emits warning', () => {
    const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { extensionsInbound } = renderDialplan({
      dids: [{ id: 'd4', did: '07022222222', ivrMenuId: null, directQueue: null, enabled: true, description: null }],
      ivrMenus: [],
    });
    expect(extensionsInbound).not.toContain('07022222222');
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('07022222222'));
    spy.mockRestore();
  });
});
```

- [ ] Run — verify FAIL:
```bash
cd apps/server && npx jest dialplan.renderer --no-coverage
```
Expected: FAIL

- [ ] Implement `dialplan.renderer.ts`:

```ts
export interface DidInput {
  id: string;
  did: string;
  description: string | null;
  ivrMenuId: string | null;
  directQueue: string | null;
  enabled: boolean;
}

export interface IvrEntryInput {
  id: string;
  tenantId: string;
  menuId: string;
  digit: string;
  label: string;
  queueName: string;
}

export interface IvrMenuInput {
  id: string;
  name: string;
  welcomePrompt: string | null;
  menuPrompt: string | null;
  timeoutSecs: number;
  entries: IvrEntryInput[];
}

export interface DialplanInput {
  dids: DidInput[];
  ivrMenus: IvrMenuInput[];
}

export interface DialplanOutput {
  extensionsInbound: string;
  extensionsQueue: string;
}

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function renderDidExtension(did: DidInput, ivrMenus: IvrMenuInput[]): string | null {
  if (did.ivrMenuId) {
    const menu = ivrMenus.find((m) => m.id === did.ivrMenuId);
    if (!menu) return null;
    const slug = toSlug(menu.name);
    return [
      `exten => ${did.did},1,NoOp(Inbound DID \${EXTEN})`,
      ` same => n,Set(__ENTRY_DID=\${EXTEN})`,
      ` same => n,Goto(ivr-menu-${slug},s,1)`,
    ].join('\n');
  }
  if (did.directQueue) {
    return [
      `exten => ${did.did},1,NoOp(Inbound DID \${EXTEN})`,
      ` same => n,Set(__ENTRY_DID=\${EXTEN})`,
      ` same => n,Goto(queue-entry,${did.directQueue},1)`,
    ].join('\n');
  }
  console.warn(`[DialplanRenderer] DID ${did.did} has neither ivrMenuId nor directQueue — skipped`);
  return null;
}

function renderIvrMenu(menu: IvrMenuInput): string {
  const slug = toSlug(menu.name);
  const lines: string[] = [`[ivr-menu-${slug}]`, `exten => s,1,Answer()`];
  if (menu.welcomePrompt) lines.push(` same => n,Playback(${menu.welcomePrompt})`);
  if (menu.menuPrompt) lines.push(` same => n,Background(${menu.menuPrompt})`);
  lines.push(` same => n,WaitExten(${menu.timeoutSecs})`);
  for (const entry of menu.entries) {
    lines.push(`exten => ${entry.digit},1,Goto(queue-entry,${entry.queueName},1)`);
  }
  lines.push(`exten => t,1,Playback(vm-goodbye)`);
  lines.push(` same => n,Hangup()`);
  return lines.join('\n');
}

export function renderDialplan(input: DialplanInput): DialplanOutput {
  const enabledDids = input.dids.filter((d) => d.enabled);
  const didLines = enabledDids
    .map((d) => renderDidExtension(d, input.ivrMenus))
    .filter((line): line is string => line !== null);

  const extensionsInbound = [`[inbound-main]`, ...didLines].join('\n\n');
  const extensionsQueue = input.ivrMenus.map(renderIvrMenu).join('\n\n');

  return { extensionsInbound, extensionsQueue };
}
```

- [ ] Run — verify PASS:
```bash
cd apps/server && npx jest dialplan.renderer --no-coverage
```
Expected: PASS (6 tests)

- [ ] Commit:
```bash
git add apps/server/src/modules/asterisk-config/renderers/
git commit -m "feat(asterisk-config): DialplanRenderer with passing tests"
```

---

## Chunk 3: Backend Services & Controller

### Task 6: DTOs

**Files:**
- Create: `apps/server/src/modules/asterisk-config/dto/trunk.dto.ts`
- Create: `apps/server/src/modules/asterisk-config/dto/did.dto.ts`
- Create: `apps/server/src/modules/asterisk-config/dto/ivr-menu.dto.ts`

- [ ] Create `update-sip-password.dto.ts`:

```ts
import { IsString, MinLength } from 'class-validator';

export class UpdateSipPasswordDto {
  @IsString() @MinLength(1) sipPassword: string;
}
```

- [ ] Create `trunk.dto.ts`:

```ts
import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateTrunkDto {
  @IsString() name: string;
  @IsString() host: string;
  @IsInt() @Min(1) @IsOptional() port?: number;
  @IsString() username: string;
  @IsString() password: string;
  @IsString() fromDomain: string;
  @IsString() @IsOptional() codecs?: string;
  @IsBoolean() @IsOptional() enabled?: boolean;
}

export class UpdateTrunkDto extends CreateTrunkDto {}
```

- [ ] Create `did.dto.ts`:

```ts
import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateDidDto {
  @IsString() did: string;
  @IsString() @IsOptional() description?: string;
  @IsUUID() @IsOptional() ivrMenuId?: string;
  @IsString() @IsOptional() directQueue?: string;
  @IsBoolean() @IsOptional() enabled?: boolean;
}

export class UpdateDidDto extends CreateDidDto {}
```

- [ ] Create `ivr-menu.dto.ts`:

```ts
import { IsArray, IsInt, IsOptional, IsString, Matches, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class IvrEntryDto {
  @IsString() @Matches(/^[0-9#*]$/, { message: 'digit must be 0-9, # or *' }) digit: string;
  @IsString() label: string;
  @IsString() queueName: string;
}

export class CreateIvrMenuDto {
  @IsString() name: string;
  @IsString() @IsOptional() welcomePrompt?: string;
  @IsString() @IsOptional() menuPrompt?: string;
  @IsInt() @Min(1) @IsOptional() timeoutSecs?: number;
  @IsArray() @ValidateNested({ each: true }) @Type(() => IvrEntryDto) entries: IvrEntryDto[];
}

export class UpdateIvrMenuDto extends CreateIvrMenuDto {}
```

- [ ] Commit:
```bash
git add apps/server/src/modules/asterisk-config/dto/
git commit -m "feat(asterisk-config): request DTOs"
```

---

### Task 7: AsteriskReloadService

**Files:**
- Create: `apps/server/src/modules/asterisk-config/asterisk-reload.service.ts`

- [ ] Create `asterisk-reload.service.ts`:

```ts
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../../common/prisma.service';
import { AmiConnectionService } from '../ami/ami-connection.service';
import { renderDialplan } from './renderers/dialplan.renderer';
import { renderPjsip } from './renderers/pjsip.renderer';

@Injectable()
export class AsteriskReloadService implements OnModuleDestroy {
  private readonly logger = new Logger(AsteriskReloadService.name);
  private readonly debounceTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly ami: AmiConnectionService,
  ) {}

  onModuleDestroy() {
    for (const timer of this.debounceTimers.values()) clearTimeout(timer);
    this.debounceTimers.clear();
  }

  /** 5초 debounce — 테넌트별로 독립 관리, 연속 저장 시 마지막 호출만 실행 */
  scheduleReload(tenantId: string): void {
    const existing = this.debounceTimers.get(tenantId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.debounceTimers.delete(tenantId);
      void this.executeReload(tenantId);
    }, 5000);
    this.debounceTimers.set(tenantId, timer);
  }

  /** 즉시 실행 — 수동 reload 또는 debounce timer에서 호출. 기존 타이머 취소. */
  async executeReload(tenantId: string): Promise<void> {
    const existing = this.debounceTimers.get(tenantId);
    if (existing) {
      clearTimeout(existing);
      this.debounceTimers.delete(tenantId);
    }
    await this.writeConfFiles(tenantId);
    this.ami.sendAction({ Action: 'Command', Command: 'module reload res_pjsip' });
    this.ami.sendAction({ Action: 'Command', Command: 'dialplan reload' });
    this.logger.log(`Asterisk reload triggered for tenant ${tenantId}`);
  }

  async writeConfFiles(tenantId: string): Promise<void> {
    const confDir = this.config.get<string>('ASTERISK_CONF_DIR', '/etc/asterisk');

    const [trunks, agents, dids, ivrMenus] = await Promise.all([
      this.prisma.asteriskTrunk.findMany({ where: { tenantId } }),
      this.prisma.agents.findMany({ where: { tenantId, isActive: true } }),
      this.prisma.asteriskDid.findMany({ where: { tenantId } }),
      this.prisma.asteriskIvrMenu.findMany({
        where: { tenantId },
        include: { entries: true },
      }),
    ]);

    const pjsipContent = renderPjsip({ trunks, agents });
    const { extensionsInbound, extensionsQueue } = renderDialplan({ dids, ivrMenus });

    fs.writeFileSync(path.join(confDir, 'pjsip.conf'), pjsipContent, 'utf8');
    fs.writeFileSync(path.join(confDir, 'extensions_inbound.conf'), extensionsInbound, 'utf8');
    fs.writeFileSync(path.join(confDir, 'extensions_queue.conf'), extensionsQueue, 'utf8');
  }

  async previewConfFiles(tenantId: string): Promise<{
    pjsip: string;
    extensionsInbound: string;
    extensionsQueue: string;
  }> {
    const [trunks, agents, dids, ivrMenus] = await Promise.all([
      this.prisma.asteriskTrunk.findMany({ where: { tenantId } }),
      this.prisma.agents.findMany({ where: { tenantId, isActive: true } }),
      this.prisma.asteriskDid.findMany({ where: { tenantId } }),
      this.prisma.asteriskIvrMenu.findMany({
        where: { tenantId },
        include: { entries: true },
      }),
    ]);

    const pjsip = renderPjsip({ trunks, agents });
    const { extensionsInbound, extensionsQueue } = renderDialplan({ dids, ivrMenus });

    // 미리보기에서 패스워드 마스킹
    const maskedPjsip = pjsip.replace(/^(password=).+$/gm, '$1***');

    return { pjsip: maskedPjsip, extensionsInbound, extensionsQueue };
  }
}
```

- [ ] Commit:
```bash
git add apps/server/src/modules/asterisk-config/asterisk-reload.service.ts
git commit -m "feat(asterisk-config): AsteriskReloadService with debounce + preview"
```

---

### Task 8: AsteriskConfigService

**Files:**
- Create: `apps/server/src/modules/asterisk-config/asterisk-config.service.ts`

- [ ] Create `asterisk-config.service.ts`:

```ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { AsteriskReloadService } from './asterisk-reload.service';
import { CreateDidDto, UpdateDidDto } from './dto/did.dto';
import { CreateIvrMenuDto, UpdateIvrMenuDto } from './dto/ivr-menu.dto';
import { CreateTrunkDto, UpdateTrunkDto } from './dto/trunk.dto';

@Injectable()
export class AsteriskConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reload: AsteriskReloadService,
  ) {}

  // ─── Trunks ────────────────────────────────────────────────────────────────

  getTrunks(tenantId: string) {
    return this.prisma.asteriskTrunk.findMany({ where: { tenantId }, orderBy: { name: 'asc' } });
  }

  async createTrunk(tenantId: string, dto: CreateTrunkDto) {
    const trunk = await this.prisma.asteriskTrunk.create({
      data: {
        tenantId,
        ...dto,
        port: dto.port ?? 5060,
        codecs: dto.codecs ?? 'alaw,ulaw',
        enabled: dto.enabled ?? true,
      },
    });
    this.reload.scheduleReload(tenantId);
    return trunk;
  }

  async updateTrunk(tenantId: string, id: string, dto: UpdateTrunkDto) {
    await this.assertTrunkBelongs(tenantId, id);
    const trunk = await this.prisma.asteriskTrunk.update({ where: { id }, data: dto });
    this.reload.scheduleReload(tenantId);
    return trunk;
  }

  async deleteTrunk(tenantId: string, id: string) {
    await this.assertTrunkBelongs(tenantId, id);
    await this.prisma.asteriskTrunk.delete({ where: { id } });
    this.reload.scheduleReload(tenantId);
  }

  private async assertTrunkBelongs(tenantId: string, id: string) {
    const trunk = await this.prisma.asteriskTrunk.findFirst({ where: { id, tenantId } });
    if (!trunk) throw new NotFoundException(`Trunk ${id} not found`);
  }

  // ─── DIDs ──────────────────────────────────────────────────────────────────

  getDids(tenantId: string) {
    return this.prisma.asteriskDid.findMany({ where: { tenantId }, orderBy: { did: 'asc' } });
  }

  async createDid(tenantId: string, dto: CreateDidDto) {
    await this.validateDidXorAndQueue(tenantId, dto);
    const did = await this.prisma.asteriskDid.create({
      data: { tenantId, ...dto, enabled: dto.enabled ?? true },
    });
    this.reload.scheduleReload(tenantId);
    return did;
  }

  async updateDid(tenantId: string, id: string, dto: UpdateDidDto) {
    await this.assertDidBelongs(tenantId, id);
    await this.validateDidXorAndQueue(tenantId, dto);
    const did = await this.prisma.asteriskDid.update({ where: { id }, data: dto });
    this.reload.scheduleReload(tenantId);
    return did;
  }

  async deleteDid(tenantId: string, id: string) {
    await this.assertDidBelongs(tenantId, id);
    await this.prisma.asteriskDid.delete({ where: { id } });
    this.reload.scheduleReload(tenantId);
  }

  private async validateDidXorAndQueue(
    tenantId: string,
    dto: { ivrMenuId?: string; directQueue?: string },
  ) {
    const hasIvr = !!dto.ivrMenuId;
    const hasQueue = !!dto.directQueue;
    if (hasIvr && hasQueue)
      throw new BadRequestException('ivrMenuId and directQueue are mutually exclusive');
    if (!hasIvr && !hasQueue)
      throw new BadRequestException('Either ivrMenuId or directQueue is required');
    if (hasQueue) {
      const queue = await this.prisma.queues.findFirst({
        where: { tenantId, queueName: dto.directQueue },
      });
      if (!queue) throw new BadRequestException(`Queue "${dto.directQueue}" not found`);
    }
  }

  private async assertDidBelongs(tenantId: string, id: string) {
    const did = await this.prisma.asteriskDid.findFirst({ where: { id, tenantId } });
    if (!did) throw new NotFoundException(`DID ${id} not found`);
  }

  // ─── IVR Menus ─────────────────────────────────────────────────────────────

  getIvrMenus(tenantId: string) {
    return this.prisma.asteriskIvrMenu.findMany({
      where: { tenantId },
      include: { entries: { orderBy: { digit: 'asc' } } },
      orderBy: { name: 'asc' },
    });
  }

  async createIvrMenu(tenantId: string, dto: CreateIvrMenuDto) {
    await this.validateEntryQueues(tenantId, dto.entries);
    const menu = await this.prisma.asteriskIvrMenu.create({
      data: {
        tenantId,
        name: dto.name,
        welcomePrompt: dto.welcomePrompt,
        menuPrompt: dto.menuPrompt,
        timeoutSecs: dto.timeoutSecs ?? 5,
        entries: { create: dto.entries.map((e) => ({ ...e, tenantId })) },
      },
      include: { entries: true },
    });
    this.reload.scheduleReload(tenantId);
    return menu;
  }

  async updateIvrMenu(tenantId: string, id: string, dto: UpdateIvrMenuDto) {
    await this.assertMenuBelongs(tenantId, id);
    await this.validateEntryQueues(tenantId, dto.entries);
    const menu = await this.prisma.$transaction(async (tx) => {
      await tx.asteriskIvrEntry.deleteMany({ where: { menuId: id } });
      return tx.asteriskIvrMenu.update({
        where: { id },
        data: {
          name: dto.name,
          welcomePrompt: dto.welcomePrompt,
          menuPrompt: dto.menuPrompt,
          timeoutSecs: dto.timeoutSecs ?? 5,
          entries: { create: dto.entries.map((e) => ({ ...e, tenantId })) },
        },
        include: { entries: true },
      });
    });
    this.reload.scheduleReload(tenantId);
    return menu;
  }

  async deleteIvrMenu(tenantId: string, id: string) {
    await this.assertMenuBelongs(tenantId, id);
    await this.prisma.asteriskIvrMenu.delete({ where: { id } });
    this.reload.scheduleReload(tenantId);
  }

  private async validateEntryQueues(tenantId: string, entries: { queueName: string }[]) {
    if (entries.length === 0) return;
    const names = [...new Set(entries.map((e) => e.queueName))];
    const found = await this.prisma.queues.findMany({
      where: { tenantId, queueName: { in: names } },
      select: { queueName: true },
    });
    const foundSet = new Set(found.map((q) => q.queueName));
    const missing = names.filter((n) => !foundSet.has(n));
    if (missing.length > 0) throw new BadRequestException(`Queue(s) not found: ${missing.join(', ')}`);
  }

  private async assertMenuBelongs(tenantId: string, id: string) {
    const menu = await this.prisma.asteriskIvrMenu.findFirst({ where: { id, tenantId } });
    if (!menu) throw new NotFoundException(`IVR menu ${id} not found`);
  }

  // ─── Agent SIP ─────────────────────────────────────────────────────────────

  getAgentSip(tenantId: string) {
    return this.prisma.agents.findMany({
      where: { tenantId, isActive: true },
      select: { agentId: true, agentName: true, extension: true, sipPassword: true },
      orderBy: { extension: 'asc' },
    });
  }

  async updateAgentSipPassword(tenantId: string, agentId: string, sipPassword: string) {
    const agent = await this.prisma.agents.findFirst({ where: { agentId, tenantId } });
    if (!agent) throw new NotFoundException(`Agent ${agentId} not found`);
    return this.prisma.agents.update({ where: { agentId }, data: { sipPassword } });
  }

  async syncAgentSip(tenantId: string) {
    await this.reload.executeReload(tenantId);
  }
}
```

- [ ] Commit:
```bash
git add apps/server/src/modules/asterisk-config/asterisk-config.service.ts
git commit -m "feat(asterisk-config): AsteriskConfigService CRUD + queue validation"
```

---

### Task 9: Controller + Module + App registration

**Files:**
- Create: `apps/server/src/modules/asterisk-config/asterisk-config.controller.ts`
- Create: `apps/server/src/modules/asterisk-config/asterisk-config.module.ts`
- Modify: `apps/server/src/app.module.ts` — add `AsteriskConfigModule` to imports
- Modify: `apps/server/.env.example` — add `ASTERISK_CONF_DIR`

- [ ] Create `asterisk-config.controller.ts`:

```ts
import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { AsteriskConfigService } from './asterisk-config.service';
import { AsteriskReloadService } from './asterisk-reload.service';
import { CreateDidDto, UpdateDidDto } from './dto/did.dto';
import { CreateIvrMenuDto, UpdateIvrMenuDto } from './dto/ivr-menu.dto';
import { CreateTrunkDto, UpdateTrunkDto } from './dto/trunk.dto';
import { UpdateSipPasswordDto } from './dto/update-sip-password.dto';

@ApiTags('asterisk-config')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('supervisor', 'admin')
@Controller('asterisk-config')
export class AsteriskConfigController {
  constructor(
    private readonly svc: AsteriskConfigService,
    private readonly reload: AsteriskReloadService,
  ) {}

  // Trunks
  @Get('trunks') getTrunks(@CurrentUser() u: any) { return this.svc.getTrunks(u.tenantId); }
  @Post('trunks') createTrunk(@CurrentUser() u: any, @Body() dto: CreateTrunkDto) { return this.svc.createTrunk(u.tenantId, dto); }
  @Put('trunks/:id') updateTrunk(@CurrentUser() u: any, @Param('id') id: string, @Body() dto: UpdateTrunkDto) { return this.svc.updateTrunk(u.tenantId, id, dto); }
  @Delete('trunks/:id') @HttpCode(204) deleteTrunk(@CurrentUser() u: any, @Param('id') id: string) { return this.svc.deleteTrunk(u.tenantId, id); }

  // DIDs
  @Get('dids') getDids(@CurrentUser() u: any) { return this.svc.getDids(u.tenantId); }
  @Post('dids') createDid(@CurrentUser() u: any, @Body() dto: CreateDidDto) { return this.svc.createDid(u.tenantId, dto); }
  @Put('dids/:id') updateDid(@CurrentUser() u: any, @Param('id') id: string, @Body() dto: UpdateDidDto) { return this.svc.updateDid(u.tenantId, id, dto); }
  @Delete('dids/:id') @HttpCode(204) deleteDid(@CurrentUser() u: any, @Param('id') id: string) { return this.svc.deleteDid(u.tenantId, id); }

  // IVR Menus
  @Get('ivr-menus') getIvrMenus(@CurrentUser() u: any) { return this.svc.getIvrMenus(u.tenantId); }
  @Post('ivr-menus') createIvrMenu(@CurrentUser() u: any, @Body() dto: CreateIvrMenuDto) { return this.svc.createIvrMenu(u.tenantId, dto); }
  @Put('ivr-menus/:id') updateIvrMenu(@CurrentUser() u: any, @Param('id') id: string, @Body() dto: UpdateIvrMenuDto) { return this.svc.updateIvrMenu(u.tenantId, id, dto); }
  @Delete('ivr-menus/:id') @HttpCode(204) deleteIvrMenu(@CurrentUser() u: any, @Param('id') id: string) { return this.svc.deleteIvrMenu(u.tenantId, id); }

  // Agent SIP
  @Get('agents-sip') getAgentSip(@CurrentUser() u: any) { return this.svc.getAgentSip(u.tenantId); }
  @Put('agents-sip/:agentId/password') updateAgentSipPassword(
    @CurrentUser() u: any,
    @Param('agentId') agentId: string,
    @Body() dto: UpdateSipPasswordDto,
  ) { return this.svc.updateAgentSipPassword(u.tenantId, agentId, dto.sipPassword); }
  @Post('agents-sip/sync') syncAgentSip(@CurrentUser() u: any) { return this.svc.syncAgentSip(u.tenantId); }

  // Reload + Preview
  @Post('reload') manualReload(@CurrentUser() u: any) { return this.reload.executeReload(u.tenantId); }
  @Get('preview') preview(@CurrentUser() u: any) { return this.reload.previewConfFiles(u.tenantId); }
}
```

- [ ] Create `asterisk-config.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { AmiModule } from '../ami/ami.module';
import { AsteriskConfigController } from './asterisk-config.controller';
import { AsteriskConfigService } from './asterisk-config.service';
import { AsteriskReloadService } from './asterisk-reload.service';

@Module({
  imports: [AmiModule],
  controllers: [AsteriskConfigController],
  providers: [AsteriskConfigService, AsteriskReloadService, PrismaService],
})
export class AsteriskConfigModule {}
```

- [ ] Add to `app.module.ts` — import and add to imports array after `AdminModule`:

```ts
import { AsteriskConfigModule } from './modules/asterisk-config/asterisk-config.module';
// In @Module({ imports: [..., AdminModule, AsteriskConfigModule, HealthModule] })
```

- [ ] Add to `apps/server/.env.example`:

```
ASTERISK_CONF_DIR=/etc/asterisk
# ASTERISK_TRUNK_ENCRYPT_KEY=change_me_32bytes
```

- [ ] Verify build succeeds:
```bash
cd apps/server && npm run build
```
Expected: exit 0, no TypeScript errors

- [ ] Start dev server and verify Swagger shows `asterisk-config` tag:
```bash
cd apps/server && npm run start:dev
```
Open http://localhost:3000/docs — `asterisk-config` section should appear

- [ ] Commit:
```bash
git add apps/server/src/modules/asterisk-config/ apps/server/src/app.module.ts apps/server/.env.example
git commit -m "feat(asterisk-config): controller, module, app registration"
```

---

## Chunk 4: Frontend

### Task 10: Types + API client

**Files:**
- Create: `apps/admin/src/features/asterisk-config/types/asterisk-config.ts`
- Create: `apps/admin/src/features/asterisk-config/api/asteriskConfigApi.ts`

- [ ] Create `types/asterisk-config.ts`:

```ts
export interface AsteriskTrunk {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  password: string;
  fromDomain: string;
  codecs: string;
  enabled: boolean;
}

export interface AsteriskDid {
  id: string;
  did: string;
  description: string | null;
  ivrMenuId: string | null;
  directQueue: string | null;
  enabled: boolean;
}

export interface AsteriskIvrEntry {
  id?: string;
  digit: string;
  label: string;
  queueName: string;
}

export interface AsteriskIvrMenu {
  id: string;
  name: string;
  welcomePrompt: string | null;
  menuPrompt: string | null;
  timeoutSecs: number;
  entries: AsteriskIvrEntry[];
}

export interface AgentSipRow {
  agentId: string;
  agentName: string;
  extension: string;
  sipPassword: string | null;
}

export interface ConfPreview {
  pjsip: string;
  extensionsInbound: string;
  extensionsQueue: string;
}
```

- [ ] Create `api/asteriskConfigApi.ts`:

```ts
import axios from 'axios';
import { ACCESS_TOKEN_KEY, API_BASE_URL } from '../../../config';
import type { AgentSipRow, AsteriskDid, AsteriskIvrMenu, AsteriskTrunk, ConfPreview } from '../types/asterisk-config';

function headers(): Record<string, string> {
  const token = localStorage.getItem(ACCESS_TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const base = `${API_BASE_URL}/asterisk-config`;

export const getTrunks = () =>
  axios.get<{ data: AsteriskTrunk[] }>(`${base}/trunks`, { headers: headers() }).then(r => r.data.data);
export const createTrunk = (dto: Omit<AsteriskTrunk, 'id'>) =>
  axios.post<{ data: AsteriskTrunk }>(`${base}/trunks`, dto, { headers: headers() }).then(r => r.data.data);
export const updateTrunk = (id: string, dto: Omit<AsteriskTrunk, 'id'>) =>
  axios.put<{ data: AsteriskTrunk }>(`${base}/trunks/${id}`, dto, { headers: headers() }).then(r => r.data.data);
export const deleteTrunk = (id: string) =>
  axios.delete(`${base}/trunks/${id}`, { headers: headers() });

export const getDids = () =>
  axios.get<{ data: AsteriskDid[] }>(`${base}/dids`, { headers: headers() }).then(r => r.data.data);
export const createDid = (dto: Omit<AsteriskDid, 'id'>) =>
  axios.post<{ data: AsteriskDid }>(`${base}/dids`, dto, { headers: headers() }).then(r => r.data.data);
export const updateDid = (id: string, dto: Omit<AsteriskDid, 'id'>) =>
  axios.put<{ data: AsteriskDid }>(`${base}/dids/${id}`, dto, { headers: headers() }).then(r => r.data.data);
export const deleteDid = (id: string) =>
  axios.delete(`${base}/dids/${id}`, { headers: headers() });

export const getIvrMenus = () =>
  axios.get<{ data: AsteriskIvrMenu[] }>(`${base}/ivr-menus`, { headers: headers() }).then(r => r.data.data);
export const createIvrMenu = (dto: Omit<AsteriskIvrMenu, 'id'>) =>
  axios.post<{ data: AsteriskIvrMenu }>(`${base}/ivr-menus`, dto, { headers: headers() }).then(r => r.data.data);
export const updateIvrMenu = (id: string, dto: Omit<AsteriskIvrMenu, 'id'>) =>
  axios.put<{ data: AsteriskIvrMenu }>(`${base}/ivr-menus/${id}`, dto, { headers: headers() }).then(r => r.data.data);
export const deleteIvrMenu = (id: string) =>
  axios.delete(`${base}/ivr-menus/${id}`, { headers: headers() });

export const getAgentSip = () =>
  axios.get<{ data: AgentSipRow[] }>(`${base}/agents-sip`, { headers: headers() }).then(r => r.data.data);
export const updateAgentSipPassword = (agentId: string, sipPassword: string) =>
  axios.put(`${base}/agents-sip/${agentId}/password`, { sipPassword }, { headers: headers() });
export const syncAgentSip = () =>
  axios.post(`${base}/agents-sip/sync`, {}, { headers: headers() });

export const manualReload = () =>
  axios.post(`${base}/reload`, {}, { headers: headers() });
export const getPreview = () =>
  axios.get<{ data: ConfPreview }>(`${base}/preview`, { headers: headers() }).then(r => r.data.data);
```

- [ ] Commit:
```bash
git add apps/admin/src/features/asterisk-config/
git commit -m "feat(admin): Asterisk config types and API client"
```

---

### Task 11: Router + AppLayout + Page stub

**Files:**
- Modify: `apps/admin/src/app/router.tsx`
- Modify: `apps/admin/src/components/AppLayout.tsx`
- Create: `apps/admin/src/pages/AsteriskConfigPage.tsx` (stub)

- [ ] Create stub `apps/admin/src/pages/AsteriskConfigPage.tsx`:

```tsx
export function AsteriskConfigPage() {
  return <div>Asterisk Config — 구현 중</div>;
}
```

- [ ] Add route to `router.tsx` (in children array):

```tsx
import { AsteriskConfigPage } from '../pages/AsteriskConfigPage';
// ...
{ path: 'asterisk', element: <AsteriskConfigPage /> },
```

- [ ] Add menu item to `AppLayout.tsx`:

```tsx
import { SettingOutlined } from '@ant-design/icons';
// In items array after monitoring:
{ key: '/asterisk', icon: <SettingOutlined />, label: 'Asterisk 설정' },
```

- [ ] Start dev server and verify:
```bash
cd apps/admin && npm run dev -- --port 5174
```
Open http://localhost:5174 → side menu에 "Asterisk 설정" 항목, 클릭 시 stub 페이지 표시

- [ ] Commit:
```bash
git add apps/admin/src/pages/AsteriskConfigPage.tsx apps/admin/src/app/router.tsx apps/admin/src/components/AppLayout.tsx
git commit -m "feat(admin): /asterisk route and side menu item"
```

---

### Task 12: TrunksTab + TrunkForm

**Files:**
- Create: `apps/admin/src/features/asterisk-config/components/TrunkForm.tsx`
- Create: `apps/admin/src/features/asterisk-config/components/TrunksTab.tsx`

- [ ] Create `TrunkForm.tsx`:

```tsx
import { Form, Input, InputNumber, Modal, Switch } from 'antd';
import { useEffect } from 'react';
import type { AsteriskTrunk } from '../types/asterisk-config';

interface Props {
  open: boolean;
  initial?: AsteriskTrunk | null;
  onOk: (values: Omit<AsteriskTrunk, 'id'>) => void;
  onCancel: () => void;
}

export function TrunkForm({ open, initial, onOk, onCancel }: Props) {
  const [form] = Form.useForm();

  useEffect(() => {
    if (open) form.setFieldsValue(initial ?? { port: 5060, codecs: 'alaw,ulaw', enabled: true });
  }, [open, initial, form]);

  return (
    <Modal
      title={initial ? '트렁크 수정' : '트렁크 추가'}
      open={open}
      onOk={() => form.validateFields().then(onOk)}
      onCancel={onCancel}
      destroyOnClose
    >
      <Form form={form} layout="vertical">
        <Form.Item name="name" label="표시명" rules={[{ required: true }]}>
          <Input placeholder="KT 회선 1" />
        </Form.Item>
        <Form.Item name="host" label="Host (IP/도메인)" rules={[{ required: true }]}>
          <Input placeholder="sip.provider.com" />
        </Form.Item>
        <Form.Item name="port" label="포트">
          <InputNumber min={1} max={65535} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="username" label="사용자명 (Trunk ID)" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item name="password" label="패스워드" rules={[{ required: true }]}>
          <Input.Password />
        </Form.Item>
        <Form.Item name="fromDomain" label="From Domain" rules={[{ required: true }]}>
          <Input placeholder="sip.provider.com" />
        </Form.Item>
        <Form.Item name="codecs" label="코덱 (쉼표 구분)">
          <Input placeholder="alaw,ulaw" />
        </Form.Item>
        <Form.Item name="enabled" label="활성" valuePropName="checked">
          <Switch />
        </Form.Item>
      </Form>
    </Modal>
  );
}
```

- [ ] Create `TrunksTab.tsx`:

```tsx
import { Button, Popconfirm, Space, Table, Tag, notification } from 'antd';
import { useEffect, useState } from 'react';
import { createTrunk, deleteTrunk, getTrunks, updateTrunk } from '../api/asteriskConfigApi';
import type { AsteriskTrunk } from '../types/asterisk-config';
import { TrunkForm } from './TrunkForm';

export function TrunksTab() {
  const [rows, setRows] = useState<AsteriskTrunk[]>([]);
  const [loading, setLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AsteriskTrunk | null>(null);

  const load = async () => {
    setLoading(true);
    try { setRows(await getTrunks()); } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const handleSave = async (values: Omit<AsteriskTrunk, 'id'>) => {
    try {
      if (editing) await updateTrunk(editing.id, values);
      else await createTrunk(values);
      notification.success({ message: 'Asterisk 설정이 적용되었습니다 (AMI reload 전송됨)' });
      setFormOpen(false);
      setEditing(null);
      await load();
    } catch {
      notification.error({ message: '저장 실패' });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteTrunk(id);
      notification.success({ message: '삭제되었습니다' });
      await load();
    } catch {
      notification.error({ message: '삭제 실패' });
    }
  };

  const columns = [
    { title: '표시명', dataIndex: 'name' },
    { title: 'Host', dataIndex: 'host' },
    { title: '포트', dataIndex: 'port', width: 80 },
    { title: '사용자명', dataIndex: 'username' },
    { title: '코덱', dataIndex: 'codecs' },
    {
      title: '상태', dataIndex: 'enabled', width: 80,
      render: (v: boolean) => <Tag color={v ? 'green' : 'default'}>{v ? '활성' : '비활성'}</Tag>,
    },
    {
      title: '동작', width: 120,
      render: (_: unknown, row: AsteriskTrunk) => (
        <Space>
          <Button size="small" onClick={() => { setEditing(row); setFormOpen(true); }}>수정</Button>
          <Popconfirm title="삭제할까요?" onConfirm={() => handleDelete(row.id)}>
            <Button size="small" danger>삭제</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Space style={{ marginBottom: 12 }}>
        <Button type="primary" onClick={() => { setEditing(null); setFormOpen(true); }}>트렁크 추가</Button>
      </Space>
      <Table rowKey="id" dataSource={rows} columns={columns} loading={loading} pagination={false} size="small" />
      <TrunkForm open={formOpen} initial={editing} onOk={handleSave} onCancel={() => { setFormOpen(false); setEditing(null); }} />
    </>
  );
}
```

- [ ] Commit:
```bash
git add apps/admin/src/features/asterisk-config/components/
git commit -m "feat(admin): TrunksTab with add/edit/delete"
```

---

### Task 13: DidsTab + DidForm

**Files:**
- Create: `apps/admin/src/features/asterisk-config/components/DidForm.tsx`
- Create: `apps/admin/src/features/asterisk-config/components/DidsTab.tsx`

- [ ] Create `DidForm.tsx`:

```tsx
import { Form, Input, Modal, Radio, Select, Switch } from 'antd';
import { useEffect, useState } from 'react';
import { getIvrMenus } from '../api/asteriskConfigApi';
import type { AsteriskDid, AsteriskIvrMenu } from '../types/asterisk-config';

interface Props {
  open: boolean;
  initial?: AsteriskDid | null;
  onOk: (values: Omit<AsteriskDid, 'id'>) => void;
  onCancel: () => void;
}

export function DidForm({ open, initial, onOk, onCancel }: Props) {
  const [form] = Form.useForm();
  const [mode, setMode] = useState<'ivr' | 'queue'>('ivr');
  const [menus, setMenus] = useState<AsteriskIvrMenu[]>([]);

  useEffect(() => {
    if (!open) return;
    getIvrMenus().then(setMenus).catch(() => {});
    const m = initial?.ivrMenuId ? 'ivr' : 'queue';
    setMode(m);
    form.setFieldsValue({ ...initial, _mode: m, enabled: initial?.enabled ?? true });
  }, [open, initial, form]);

  const handleOk = async () => {
    const vals = await form.validateFields();
    const result: Omit<AsteriskDid, 'id'> = {
      did: vals.did,
      description: vals.description ?? null,
      ivrMenuId: vals._mode === 'ivr' ? vals.ivrMenuId : null,
      directQueue: vals._mode === 'queue' ? vals.directQueue : null,
      enabled: vals.enabled ?? true,
    };
    onOk(result);
  };

  return (
    <Modal title={initial ? 'DID 수정' : 'DID 추가'} open={open} onOk={handleOk} onCancel={onCancel} destroyOnClose>
      <Form form={form} layout="vertical">
        <Form.Item name="did" label="착신번호 (DID)" rules={[{ required: true }]}>
          <Input placeholder="07012345678" />
        </Form.Item>
        <Form.Item name="description" label="설명">
          <Input />
        </Form.Item>
        <Form.Item name="_mode" label="연결 방식">
          <Radio.Group onChange={e => setMode(e.target.value)}>
            <Radio value="ivr">IVR 메뉴 연결</Radio>
            <Radio value="queue">큐 직결</Radio>
          </Radio.Group>
        </Form.Item>
        {mode === 'ivr' && (
          <Form.Item name="ivrMenuId" label="IVR 메뉴" rules={[{ required: true }]}>
            <Select options={menus.map(m => ({ value: m.id, label: m.name }))} placeholder="메뉴 선택" />
          </Form.Item>
        )}
        {mode === 'queue' && (
          <Form.Item name="directQueue" label="큐 이름" rules={[{ required: true }]}>
            <Input placeholder="sales" />
          </Form.Item>
        )}
        <Form.Item name="enabled" label="활성" valuePropName="checked">
          <Switch />
        </Form.Item>
      </Form>
    </Modal>
  );
}
```

- [ ] Create `DidsTab.tsx`:

```tsx
import { Button, Popconfirm, Space, Table, Tag, notification } from 'antd';
import { useEffect, useState } from 'react';
import { createDid, deleteDid, getDids, updateDid } from '../api/asteriskConfigApi';
import type { AsteriskDid } from '../types/asterisk-config';
import { DidForm } from './DidForm';

export function DidsTab() {
  const [rows, setRows] = useState<AsteriskDid[]>([]);
  const [loading, setLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AsteriskDid | null>(null);

  const load = async () => {
    setLoading(true);
    try { setRows(await getDids()); } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const handleSave = async (values: Omit<AsteriskDid, 'id'>) => {
    try {
      if (editing) await updateDid(editing.id, values);
      else await createDid(values);
      notification.success({ message: 'Asterisk 설정이 적용되었습니다 (AMI reload 전송됨)' });
      setFormOpen(false);
      setEditing(null);
      await load();
    } catch {
      notification.error({ message: '저장 실패' });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDid(id);
      notification.success({ message: '삭제되었습니다' });
      await load();
    } catch {
      notification.error({ message: '삭제 실패' });
    }
  };

  const columns = [
    { title: '착신번호', dataIndex: 'did' },
    { title: '설명', dataIndex: 'description' },
    {
      title: '연결',
      render: (_: unknown, row: AsteriskDid) =>
        row.ivrMenuId ? <Tag color="blue">IVR</Tag> : <Tag color="green">큐: {row.directQueue}</Tag>,
    },
    {
      title: '상태', dataIndex: 'enabled', width: 80,
      render: (v: boolean) => <Tag color={v ? 'green' : 'default'}>{v ? '활성' : '비활성'}</Tag>,
    },
    {
      title: '동작', width: 120,
      render: (_: unknown, row: AsteriskDid) => (
        <Space>
          <Button size="small" onClick={() => { setEditing(row); setFormOpen(true); }}>수정</Button>
          <Popconfirm title="삭제할까요?" onConfirm={() => handleDelete(row.id)}>
            <Button size="small" danger>삭제</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Space style={{ marginBottom: 12 }}>
        <Button type="primary" onClick={() => { setEditing(null); setFormOpen(true); }}>DID 추가</Button>
      </Space>
      <Table rowKey="id" dataSource={rows} columns={columns} loading={loading} pagination={false} size="small" />
      <DidForm open={formOpen} initial={editing} onOk={handleSave} onCancel={() => { setFormOpen(false); setEditing(null); }} />
    </>
  );
}
```

- [ ] Commit:
```bash
git add apps/admin/src/features/asterisk-config/components/
git commit -m "feat(admin): DidsTab with IVR/queue XOR selection"
```

---

### Task 14: IvrMenusTab + IvrMenuForm

**Files:**
- Create: `apps/admin/src/features/asterisk-config/components/IvrMenuForm.tsx`
- Create: `apps/admin/src/features/asterisk-config/components/IvrMenusTab.tsx`

- [ ] Create `IvrMenuForm.tsx`:

```tsx
import { Button, Form, Input, InputNumber, Modal, Space, Table } from 'antd';
import { useEffect, useState } from 'react';
import type { AsteriskIvrEntry, AsteriskIvrMenu } from '../types/asterisk-config';

interface Props {
  open: boolean;
  initial?: AsteriskIvrMenu | null;
  onOk: (values: Omit<AsteriskIvrMenu, 'id'>) => void;
  onCancel: () => void;
}

export function IvrMenuForm({ open, initial, onOk, onCancel }: Props) {
  const [form] = Form.useForm();
  const [entries, setEntries] = useState<AsteriskIvrEntry[]>([]);

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue(initial ?? { timeoutSecs: 5 });
    setEntries(initial?.entries.map(e => ({ digit: e.digit, label: e.label, queueName: e.queueName })) ?? []);
  }, [open, initial, form]);

  const addEntry = () => setEntries(prev => [...prev, { digit: '', label: '', queueName: '' }]);
  const updateEntry = (i: number, field: keyof AsteriskIvrEntry, value: string) =>
    setEntries(prev => prev.map((e, idx) => idx === i ? { ...e, [field]: value } : e));
  const removeEntry = (i: number) => setEntries(prev => prev.filter((_, idx) => idx !== i));

  const handleOk = async () => {
    const vals = await form.validateFields();
    onOk({ ...vals, entries });
  };

  const entryCols = [
    {
      title: 'DTMF 키', dataIndex: 'digit', width: 90,
      render: (v: string, _: AsteriskIvrEntry, i: number) =>
        <Input value={v} onChange={e => updateEntry(i, 'digit', e.target.value)} style={{ width: 60 }} maxLength={1} />,
    },
    {
      title: '표시명', dataIndex: 'label',
      render: (v: string, _: AsteriskIvrEntry, i: number) =>
        <Input value={v} onChange={e => updateEntry(i, 'label', e.target.value)} />,
    },
    {
      title: '큐 이름', dataIndex: 'queueName',
      render: (v: string, _: AsteriskIvrEntry, i: number) =>
        <Input value={v} onChange={e => updateEntry(i, 'queueName', e.target.value)} placeholder="sales" />,
    },
    {
      title: '', width: 60,
      render: (_: unknown, __: AsteriskIvrEntry, i: number) =>
        <Button size="small" danger onClick={() => removeEntry(i)}>삭제</Button>,
    },
  ];

  return (
    <Modal
      title={initial ? 'IVR 메뉴 수정' : 'IVR 메뉴 추가'}
      open={open} onOk={handleOk} onCancel={onCancel} width={640} destroyOnClose
    >
      <Form form={form} layout="vertical">
        <Form.Item name="name" label="메뉴 이름" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item name="welcomePrompt" label="안내 멘트 파일명">
          <Input placeholder="custom/welcome" />
        </Form.Item>
        <Form.Item name="menuPrompt" label="메뉴 멘트 파일명">
          <Input placeholder="custom/main_menu" />
        </Form.Item>
        <Form.Item name="timeoutSecs" label="키 입력 대기(초)">
          <InputNumber min={1} max={30} style={{ width: '100%' }} />
        </Form.Item>
      </Form>
      <Space style={{ marginBottom: 8 }}>
        <span style={{ fontWeight: 500 }}>메뉴 항목 (DTMF → 큐)</span>
        <Button size="small" onClick={addEntry}>+ 항목 추가</Button>
      </Space>
      <Table
        size="small"
        dataSource={entries}
        columns={entryCols}
        rowKey={(_, i) => String(i)}
        pagination={false}
      />
    </Modal>
  );
}
```

- [ ] Create `IvrMenusTab.tsx`:

```tsx
import { Button, Popconfirm, Space, Table, Tag, notification } from 'antd';
import { useEffect, useState } from 'react';
import { createIvrMenu, deleteIvrMenu, getIvrMenus, updateIvrMenu } from '../api/asteriskConfigApi';
import type { AsteriskIvrMenu } from '../types/asterisk-config';
import { IvrMenuForm } from './IvrMenuForm';

export function IvrMenusTab() {
  const [rows, setRows] = useState<AsteriskIvrMenu[]>([]);
  const [loading, setLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AsteriskIvrMenu | null>(null);

  const load = async () => {
    setLoading(true);
    try { setRows(await getIvrMenus()); } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const handleSave = async (values: Omit<AsteriskIvrMenu, 'id'>) => {
    try {
      if (editing) await updateIvrMenu(editing.id, values);
      else await createIvrMenu(values);
      notification.success({ message: 'Asterisk 설정이 적용되었습니다 (AMI reload 전송됨)' });
      setFormOpen(false);
      setEditing(null);
      await load();
    } catch {
      notification.error({ message: '저장 실패' });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteIvrMenu(id);
      notification.success({ message: '삭제되었습니다' });
      await load();
    } catch {
      notification.error({ message: '삭제 실패' });
    }
  };

  const columns = [
    { title: '메뉴 이름', dataIndex: 'name' },
    { title: '항목 수', render: (_: unknown, row: AsteriskIvrMenu) => <Tag>{row.entries.length}개</Tag> },
    { title: '대기(초)', dataIndex: 'timeoutSecs', width: 80 },
    {
      title: '동작', width: 140,
      render: (_: unknown, row: AsteriskIvrMenu) => (
        <Space>
          <Button size="small" onClick={() => { setEditing(row); setFormOpen(true); }}>수정</Button>
          <Popconfirm title="삭제할까요?" onConfirm={() => handleDelete(row.id)}>
            <Button size="small" danger>삭제</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Space style={{ marginBottom: 12 }}>
        <Button type="primary" onClick={() => { setEditing(null); setFormOpen(true); }}>IVR 메뉴 추가</Button>
      </Space>
      <Table rowKey="id" dataSource={rows} columns={columns} loading={loading} pagination={false} size="small" />
      <IvrMenuForm open={formOpen} initial={editing} onOk={handleSave} onCancel={() => { setFormOpen(false); setEditing(null); }} />
    </>
  );
}
```

- [ ] Commit:
```bash
git add apps/admin/src/features/asterisk-config/components/
git commit -m "feat(admin): IvrMenusTab with inline entry editing"
```

---

### Task 15: AgentSipTab + ConfigPreviewDrawer

**Files:**
- Create: `apps/admin/src/features/asterisk-config/components/AgentSipTab.tsx`
- Create: `apps/admin/src/features/asterisk-config/components/ConfigPreviewDrawer.tsx`

- [ ] Install `react-syntax-highlighter`:
```bash
cd apps/admin && npm install react-syntax-highlighter @types/react-syntax-highlighter
```

- [ ] Create `AgentSipTab.tsx`:

```tsx
import { Button, Input, Space, Table, notification } from 'antd';
import { useEffect, useState } from 'react';
import { getAgentSip, syncAgentSip, updateAgentSipPassword } from '../api/asteriskConfigApi';
import type { AgentSipRow } from '../types/asterisk-config';

export function AgentSipTab() {
  const [rows, setRows] = useState<AgentSipRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [passwords, setPasswords] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    try {
      const data = await getAgentSip();
      setRows(data);
      setPasswords(Object.fromEntries(data.map(r => [r.agentId, r.sipPassword ?? ''])));
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const handlePasswordSave = async (agentId: string) => {
    try {
      await updateAgentSipPassword(agentId, passwords[agentId]);
      notification.success({ message: '비밀번호가 저장되었습니다' });
    } catch {
      notification.error({ message: '저장 실패' });
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await syncAgentSip();
      notification.success({ message: 'PJSIP 동기화 완료 (AMI reload 전송됨)' });
    } catch {
      notification.error({ message: '동기화 실패' });
    } finally { setSyncing(false); }
  };

  const columns = [
    { title: '내선번호', dataIndex: 'extension', width: 100 },
    { title: '상담원명', dataIndex: 'agentName' },
    {
      title: 'SIP 비밀번호',
      render: (_: unknown, row: AgentSipRow) => (
        <Space>
          <Input.Password
            value={passwords[row.agentId] ?? ''}
            onChange={e => setPasswords(prev => ({ ...prev, [row.agentId]: e.target.value }))}
            style={{ width: 180 }}
          />
          <Button size="small" onClick={() => handlePasswordSave(row.agentId)}>저장</Button>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Space style={{ marginBottom: 12 }}>
        <Button type="primary" loading={syncing} onClick={handleSync}>PJSIP 동기화 (전체 reload)</Button>
        <span style={{ color: '#888', fontSize: 12 }}>SIP 비밀번호가 비어있는 내선은 pjsip.conf에서 제외됩니다</span>
      </Space>
      <Table rowKey="agentId" dataSource={rows} columns={columns} loading={loading} pagination={false} size="small" />
    </>
  );
}
```

- [ ] Create `ConfigPreviewDrawer.tsx`:

```tsx
import { Drawer, Spin, Tabs } from 'antd';
import { useEffect, useState } from 'react';
import SyntaxHighlighter from 'react-syntax-highlighter';
import { vs } from 'react-syntax-highlighter/dist/esm/styles/hljs';
import { getPreview } from '../api/asteriskConfigApi';
import type { ConfPreview } from '../types/asterisk-config';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ConfigPreviewDrawer({ open, onClose }: Props) {
  const [preview, setPreview] = useState<ConfPreview | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    getPreview()
      .then(setPreview)
      .catch(() => setPreview(null))
      .finally(() => setLoading(false));
  }, [open]);

  const items = preview
    ? [
        { key: 'pjsip', label: 'pjsip.conf', children: <SyntaxHighlighter language="ini" style={vs}>{preview.pjsip}</SyntaxHighlighter> },
        { key: 'inbound', label: 'extensions_inbound.conf', children: <SyntaxHighlighter language="ini" style={vs}>{preview.extensionsInbound}</SyntaxHighlighter> },
        { key: 'queue', label: 'extensions_queue.conf', children: <SyntaxHighlighter language="ini" style={vs}>{preview.extensionsQueue}</SyntaxHighlighter> },
      ]
    : [];

  return (
    <Drawer title=".conf 미리보기" open={open} onClose={onClose} width={700}>
      <Spin spinning={loading}>
        {preview && <Tabs items={items} />}
        {!loading && !preview && <span style={{ color: '#888' }}>미리보기를 불러올 수 없습니다</span>}
      </Spin>
    </Drawer>
  );
}
```

- [ ] Commit:
```bash
git add apps/admin/src/features/asterisk-config/components/ apps/admin/package.json apps/admin/package-lock.json
git commit -m "feat(admin): AgentSipTab and ConfigPreviewDrawer"
```

---

### Task 16: AsteriskConfigPage (tab container)

**Files:**
- Modify: `apps/admin/src/pages/AsteriskConfigPage.tsx`

- [ ] Replace stub with full implementation:

```tsx
import { Button, Space, Tabs, Typography } from 'antd';
import { useState } from 'react';
import { AgentSipTab } from '../features/asterisk-config/components/AgentSipTab';
import { ConfigPreviewDrawer } from '../features/asterisk-config/components/ConfigPreviewDrawer';
import { DidsTab } from '../features/asterisk-config/components/DidsTab';
import { IvrMenusTab } from '../features/asterisk-config/components/IvrMenusTab';
import { TrunksTab } from '../features/asterisk-config/components/TrunksTab';

export function AsteriskConfigPage() {
  const [previewOpen, setPreviewOpen] = useState(false);

  return (
    <>
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>Asterisk 회선 설정</Typography.Title>
        <Button onClick={() => setPreviewOpen(true)}>.conf 미리보기</Button>
      </Space>
      <Tabs
        items={[
          { key: 'trunks', label: '트렁크', children: <TrunksTab /> },
          { key: 'dids', label: 'DID', children: <DidsTab /> },
          { key: 'ivr', label: 'IVR 메뉴', children: <IvrMenusTab /> },
          { key: 'agents', label: '에이전트 내선', children: <AgentSipTab /> },
        ]}
      />
      <ConfigPreviewDrawer open={previewOpen} onClose={() => setPreviewOpen(false)} />
    </>
  );
}
```

- [ ] Final end-to-end verification (with backend running):
  1. `docker compose up -d postgres redis`
  2. `cd apps/server && npm run start:dev`
  3. `cd apps/admin && npm run dev -- --port 5174`
  4. http://localhost:5174/asterisk — 4탭 로드 확인
  5. 트렁크 추가 → 저장 → notification 표시 확인
  6. ".conf 미리보기" Drawer 열기 → pjsip.conf 탭 내용 확인

- [ ] Commit:
```bash
git add apps/admin/src/pages/AsteriskConfigPage.tsx
git commit -m "feat(admin): AsteriskConfigPage complete — 4-tab Asterisk config UI"
```
