# Agent Desktop Update Distribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first server-side update hub for the future Windows agent desktop so each call-center server can issue authenticated update tokens, serve approved app manifests and signed artifacts, and record update audit events.

**Architecture:** Add a dedicated `agent-updates` Nest module inside `apps/server`, backed by Prisma for approved release metadata and audit logs plus Redis for short-lived update/download tokens. Keep update artifact hosting on the call-center server itself, protect every manifest/download path with update-specific tokens, and expose the contract through controller tests and exported OpenAPI without implementing the Electron client yet.

**Tech Stack:** NestJS 10, Prisma 5, PostgreSQL 16, Redis 7, Jest 29, Swagger/OpenAPI

---

## Scope Split

The approved spec still contains two follow-up implementation tracks that are **not** in this plan:

- Electron desktop shell and auto-update client behavior
- Operator-side release distribution tooling that copies packages from the operator environment into each call-center server
- Operator-side production code-signing rollout. Current policy is `unsigned or test-signed for dev/internal QA`, then `internal CA signing required before formal production`.

This plan only implements the **call-center server update hub** because it can ship and be tested entirely inside the current repository.

## File Map

### Database

- Modify: `apps/server/prisma/schema.prisma`
  Responsibility: add approved desktop release metadata and per-download/install audit log tables.
- Create: `apps/server/prisma/migrations/20260422_agent_updates_hub/migration.sql`
  Responsibility: create the new update hub tables and indexes.

### Server Module

- Create: `apps/server/src/modules/agent-updates/agent-updates.module.ts`
  Responsibility: register the update hub controller/service.
- Create: `apps/server/src/modules/agent-updates/agent-updates.service.ts`
  Responsibility: issue update/download tokens, resolve the current approved manifest, validate artifact access, and persist audit rows.
- Create: `apps/server/src/modules/agent-updates/agent-updates.controller.ts`
  Responsibility: expose `/agent-updates/session`, `/manifest`, `/download-init`, `/artifacts/:artifactId`, and `/report`.
- Create: `apps/server/src/modules/agent-updates/dto/create-update-session.dto.ts`
  Responsibility: validate update-session creation requests.
- Create: `apps/server/src/modules/agent-updates/dto/download-init.dto.ts`
  Responsibility: validate artifact download-init requests.
- Create: `apps/server/src/modules/agent-updates/dto/report-update.dto.ts`
  Responsibility: validate audit event reports from the desktop client.
- Modify: `apps/server/src/app.module.ts`
  Responsibility: mount the new `AgentUpdatesModule`.

### Tests

- Create: `apps/server/test/agent-updates.service.spec.ts`
  Responsibility: cover manifest selection, update token issuance, and one-time download token validation.
- Create: `apps/server/test/agent-updates.controller.spec.ts`
  Responsibility: cover controller auth boundaries, artifact streaming, and audit reporting.

### Docs

- Modify: `apps/server/scripts/export-openapi.ts`
  Responsibility: no code change expected; use it to export updated docs after endpoints are added.
- Create: `docs/design/agent-desktop-update-api.md`
  Responsibility: publish the concrete API contract for operator and desktop teams after the endpoints exist.

## Task 1: Add Prisma Models and the Minimal Manifest Service

**Files:**
- Modify: `apps/server/prisma/schema.prisma`
- Create: `apps/server/prisma/migrations/20260422_agent_updates_hub/migration.sql`
- Create: `apps/server/src/modules/agent-updates/agent-updates.module.ts`
- Create: `apps/server/src/modules/agent-updates/agent-updates.service.ts`
- Create: `apps/server/test/agent-updates.service.spec.ts`
- Test: `apps/server/test/agent-updates.service.spec.ts`

- [ ] **Step 1: Write the failing service test**

Create `apps/server/test/agent-updates.service.spec.ts`:

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { AgentUpdatesService } from '../src/modules/agent-updates/agent-updates.service';
import { PrismaService } from '../src/common/prisma.service';
import { RedisService } from '../src/modules/redis/redis.service';

describe('AgentUpdatesService manifest', () => {
  let service: AgentUpdatesService;
  const prisma = {
    agentDesktopReleases: {
      findFirst: jest.fn(),
    },
    agentDesktopUpdateAuditLogs: {
      create: jest.fn(),
    },
  };
  const redis = {
    getClient: () => ({
      set: jest.fn(),
      get: jest.fn(),
      del: jest.fn(),
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentUpdatesService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
      ],
    }).compile();

    service = module.get(AgentUpdatesService);
  });

  it('getManifest 는 tenant 별 최신 승인 릴리스를 반환한다', async () => {
    prisma.agentDesktopReleases.findFirst.mockResolvedValue({
      releaseId: 'release-1',
      tenantId: 'tenant-1',
      channel: 'stable',
      version: '1.4.0',
      artifactId: 'agent-win-x64-1.4.0',
      fileName: 'KAsterAgent-1.4.0-Setup.exe',
      filePath: 'D:/agent-updates/KAsterAgent-1.4.0-Setup.exe',
      fileSizeBytes: BigInt(85423104),
      sha256: 'abc123',
      mandatory: false,
      minimumRequiredVersion: '1.2.8',
      minimumServerVersion: '0.9.0',
      maximumServerVersion: '0.9.x',
      notes: '음소거/보류 안정성 개선',
      publishedAt: new Date('2026-04-22T02:00:00.000Z'),
    });

    const result = await service.getManifest({
      tenantId: 'tenant-1',
      currentVersion: '1.3.2',
      channel: 'stable',
    });

    expect(prisma.agentDesktopReleases.findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        channel: 'stable',
        isActive: true,
      },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
    });
    expect(result).toEqual({
      success: true,
      data: {
        centerId: 'tenant-1',
        channel: 'stable',
        currentVersion: '1.3.2',
        latestVersion: '1.4.0',
        mandatory: false,
        minimumRequiredVersion: '1.2.8',
        serverCompatibility: {
          minimumServerVersion: '0.9.0',
          maximumServerVersion: '0.9.x',
        },
        artifacts: [
          {
            artifactId: 'agent-win-x64-1.4.0',
            version: '1.4.0',
            fileName: 'KAsterAgent-1.4.0-Setup.exe',
            size: 85423104,
            sha256: 'abc123',
          },
        ],
        notes: '음소거/보류 안정성 개선',
      },
      error: null,
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
cd apps/server
npm test -- --runTestsByPath test/agent-updates.service.spec.ts
```

Expected: FAIL with `Cannot find module '../src/modules/agent-updates/agent-updates.service'`.

- [ ] **Step 3: Add the schema, migration, and minimal service**

Update `apps/server/prisma/schema.prisma`:

```prisma
model agentDesktopReleases {
  releaseId               String   @id @default(uuid()) @db.Uuid
  tenantId                String   @db.Uuid
  channel                 String   @default("stable") @db.VarChar(32)
  version                 String   @db.VarChar(32)
  artifactId              String   @db.VarChar(128)
  fileName                String   @db.VarChar(255)
  filePath                String
  fileSizeBytes           BigInt?
  sha256                  String   @db.VarChar(64)
  mandatory               Boolean  @default(false)
  minimumRequiredVersion  String?  @db.VarChar(32)
  minimumServerVersion    String?  @db.VarChar(32)
  maximumServerVersion    String?  @db.VarChar(32)
  notes                   String?
  isActive                Boolean  @default(true)
  publishedAt             DateTime @db.Timestamptz(6)
  createdAt               DateTime @default(now()) @db.Timestamptz(6)
  updatedAt               DateTime @updatedAt @db.Timestamptz(6)

  tenant                  tenants  @relation(fields: [tenantId], references: [tenantId], onDelete: Cascade)

  @@index([tenantId, channel, isActive, publishedAt(sort: Desc)])
  @@unique([tenantId, artifactId])
}

model agentDesktopUpdateAuditLogs {
  auditLogId         String   @id @default(uuid()) @db.Uuid
  tenantId           String   @db.Uuid
  agentId            String?  @db.Uuid
  deviceId           String?  @db.VarChar(128)
  clientIp           String?  @db.VarChar(64)
  currentAppVersion  String?  @db.VarChar(32)
  targetVersion      String?  @db.VarChar(32)
  artifactId         String?  @db.VarChar(128)
  eventType          String   @db.VarChar(64)
  metadata           Json?
  createdAt          DateTime @default(now()) @db.Timestamptz(6)

  tenant             tenants  @relation(fields: [tenantId], references: [tenantId], onDelete: Cascade)
  agent              agents?  @relation(fields: [agentId], references: [agentId], onDelete: SetNull)

  @@index([tenantId, createdAt(sort: Desc)])
  @@index([tenantId, agentId, createdAt(sort: Desc)])
}
```

Also add the relation arrays:

```prisma
  agentDesktopReleases        agentDesktopReleases[]
  agentDesktopUpdateAuditLogs agentDesktopUpdateAuditLogs[]
```

on `model tenants`, and:

```prisma
  agentDesktopUpdateAuditLogs agentDesktopUpdateAuditLogs[]
```

on `model agents`.

Create `apps/server/prisma/migrations/20260422_agent_updates_hub/migration.sql`:

```sql
CREATE TABLE "agentDesktopReleases" (
  "releaseId" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "channel" VARCHAR(32) NOT NULL DEFAULT 'stable',
  "version" VARCHAR(32) NOT NULL,
  "artifactId" VARCHAR(128) NOT NULL,
  "fileName" VARCHAR(255) NOT NULL,
  "filePath" TEXT NOT NULL,
  "fileSizeBytes" BIGINT,
  "sha256" VARCHAR(64) NOT NULL,
  "mandatory" BOOLEAN NOT NULL DEFAULT false,
  "minimumRequiredVersion" VARCHAR(32),
  "minimumServerVersion" VARCHAR(32),
  "maximumServerVersion" VARCHAR(32),
  "notes" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "publishedAt" TIMESTAMPTZ(6) NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agentDesktopReleases_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("tenantId") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "agentDesktopReleases_tenantId_artifactId_key"
  ON "agentDesktopReleases" ("tenantId", "artifactId");

CREATE INDEX "agentDesktopReleases_lookup_idx"
  ON "agentDesktopReleases" ("tenantId", "channel", "isActive", "publishedAt" DESC);

CREATE TABLE "agentDesktopUpdateAuditLogs" (
  "auditLogId" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "agentId" UUID,
  "deviceId" VARCHAR(128),
  "clientIp" VARCHAR(64),
  "currentAppVersion" VARCHAR(32),
  "targetVersion" VARCHAR(32),
  "artifactId" VARCHAR(128),
  "eventType" VARCHAR(64) NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agentDesktopUpdateAuditLogs_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("tenantId") ON DELETE CASCADE,
  CONSTRAINT "agentDesktopUpdateAuditLogs_agentId_fkey"
    FOREIGN KEY ("agentId") REFERENCES "agents"("agentId") ON DELETE SET NULL
);

CREATE INDEX "agentDesktopUpdateAuditLogs_tenant_created_idx"
  ON "agentDesktopUpdateAuditLogs" ("tenantId", "createdAt" DESC);

CREATE INDEX "agentDesktopUpdateAuditLogs_agent_created_idx"
  ON "agentDesktopUpdateAuditLogs" ("tenantId", "agentId", "createdAt" DESC);
```

Create `apps/server/src/modules/agent-updates/agent-updates.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { AgentUpdatesService } from './agent-updates.service';

@Module({
  providers: [AgentUpdatesService],
  exports: [AgentUpdatesService],
})
export class AgentUpdatesModule {}
```

Create `apps/server/src/modules/agent-updates/agent-updates.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class AgentUpdatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async getManifest(params: {
    tenantId: string;
    currentVersion: string;
    channel?: string;
  }) {
    const release = await this.prisma.agentDesktopReleases.findFirst({
      where: {
        tenantId: params.tenantId,
        channel: params.channel ?? 'stable',
        isActive: true,
      },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
    });

    if (!release) {
      return { success: true, data: null, error: null };
    }

    return {
      success: true,
      data: {
        centerId: params.tenantId,
        channel: release.channel,
        currentVersion: params.currentVersion,
        latestVersion: release.version,
        mandatory: release.mandatory,
        minimumRequiredVersion: release.minimumRequiredVersion,
        serverCompatibility: {
          minimumServerVersion: release.minimumServerVersion,
          maximumServerVersion: release.maximumServerVersion,
        },
        artifacts: [
          {
            artifactId: release.artifactId,
            version: release.version,
            fileName: release.fileName,
            size: Number(release.fileSizeBytes ?? 0),
            sha256: release.sha256,
          },
        ],
        notes: release.notes,
      },
      error: null,
    };
  }
}
```

- [ ] **Step 4: Generate Prisma client and rerun the test**

Run:

```bash
cd apps/server
npx prisma generate
npm test -- --runTestsByPath test/agent-updates.service.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/prisma/schema.prisma apps/server/prisma/migrations/20260422_agent_updates_hub/migration.sql apps/server/src/modules/agent-updates/agent-updates.module.ts apps/server/src/modules/agent-updates/agent-updates.service.ts apps/server/test/agent-updates.service.spec.ts
git commit -m "feat: add agent update manifest service"
```

## Task 2: Add Update Session and One-Time Download Token Flows

**Files:**
- Modify: `apps/server/src/modules/agent-updates/agent-updates.module.ts`
- Modify: `apps/server/src/modules/agent-updates/agent-updates.service.ts`
- Create: `apps/server/src/modules/agent-updates/dto/create-update-session.dto.ts`
- Create: `apps/server/src/modules/agent-updates/dto/download-init.dto.ts`
- Modify: `apps/server/test/agent-updates.service.spec.ts`
- Test: `apps/server/test/agent-updates.service.spec.ts`

- [ ] **Step 1: Add failing tests for token issuance**

Append these tests to `apps/server/test/agent-updates.service.spec.ts`:

```ts
  it('createUpdateSession 은 짧은 수명 update session token 을 Redis 에 저장한다', async () => {
    const redisSet = jest.fn().mockResolvedValue('OK');
    (redis.getClient as any) = () => ({
      set: redisSet,
      get: jest.fn(),
      del: jest.fn(),
    });

    const result = await service.createUpdateSession(
      {
        sub: 'agent-1',
        tenantId: 'tenant-1',
        role: 'agent',
      },
      {
        deviceId: 'pc-001',
        currentVersion: '1.3.2',
      },
      '203.0.113.10',
    );

    expect(result.success).toBe(true);
    expect(result.data.expiresIn).toBe(600);
    expect(redisSet).toHaveBeenCalledWith(
      expect.stringMatching(/^kaster:agent-updates:session:/),
      expect.stringContaining('"deviceId":"pc-001"'),
      'EX',
      600,
    );
  });

  it('initDownload 은 artifact 범위의 1회성 download token 을 발급한다', async () => {
    prisma.agentDesktopReleases.findFirst.mockResolvedValue({
      releaseId: 'release-1',
      tenantId: 'tenant-1',
      channel: 'stable',
      version: '1.4.0',
      artifactId: 'agent-win-x64-1.4.0',
      fileName: 'KAsterAgent-1.4.0-Setup.exe',
      filePath: 'D:/agent-updates/KAsterAgent-1.4.0-Setup.exe',
      fileSizeBytes: BigInt(85423104),
      sha256: 'abc123',
      mandatory: false,
      minimumRequiredVersion: '1.2.8',
      minimumServerVersion: '0.9.0',
      maximumServerVersion: '0.9.x',
      notes: '음소거/보류 안정성 개선',
      publishedAt: new Date('2026-04-22T02:00:00.000Z'),
      isActive: true,
      createdAt: new Date('2026-04-22T02:00:00.000Z'),
      updatedAt: new Date('2026-04-22T02:00:00.000Z'),
    });

    const result = await service.initDownload(
      {
        tenantId: 'tenant-1',
        agentId: 'agent-1',
        deviceId: 'pc-001',
      },
      {
        artifactId: 'agent-win-x64-1.4.0',
        currentVersion: '1.3.2',
      },
      '203.0.113.10',
    );

    expect(result).toMatchObject({
      success: true,
      data: {
        artifactId: 'agent-win-x64-1.4.0',
        version: '1.4.0',
        expiresIn: 120,
        sha256: 'abc123',
      },
      error: null,
    });
    expect(result.data.downloadToken).toEqual(expect.any(String));
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
cd apps/server
npm test -- --runTestsByPath test/agent-updates.service.spec.ts -t "update session token|1회성 download token"
```

Expected: FAIL because `createUpdateSession` and `initDownload` do not exist.

- [ ] **Step 3: Add DTOs and service methods**

Create `apps/server/src/modules/agent-updates/dto/create-update-session.dto.ts`:

```ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CreateUpdateSessionDto {
  @ApiPropertyOptional({ example: 'pc-001' })
  @IsOptional()
  @IsString()
  deviceId?: string;

  @ApiPropertyOptional({ example: '1.3.2' })
  @IsOptional()
  @IsString()
  currentVersion?: string;
}
```

Create `apps/server/src/modules/agent-updates/dto/download-init.dto.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class DownloadInitDto {
  @ApiProperty()
  @IsString()
  artifactId: string;

  @ApiProperty()
  @IsString()
  currentVersion: string;
}
```

Update `apps/server/src/modules/agent-updates/agent-updates.service.ts`:

```ts
import { randomBytes } from 'crypto';
```

```ts
  private sessionKey(token: string) {
    return `kaster:agent-updates:session:${token}`;
  }

  private downloadKey(token: string) {
    return `kaster:agent-updates:download:${token}`;
  }

  async createUpdateSession(
    user: { sub: string; tenantId: string; role: string },
    dto: { deviceId?: string; currentVersion?: string },
    clientIp?: string,
  ) {
    const token = randomBytes(24).toString('hex');
    await this.redis.getClient().set(
      this.sessionKey(token),
      JSON.stringify({
        tenantId: user.tenantId,
        agentId: user.sub,
        role: user.role,
        deviceId: dto.deviceId ?? null,
        currentVersion: dto.currentVersion ?? null,
        clientIp: clientIp ?? null,
      }),
      'EX',
      600,
    );

    return {
      success: true,
      data: {
        updateSessionToken: token,
        expiresIn: 600,
      },
      error: null,
    };
  }

  async initDownload(
    session: { tenantId: string; agentId: string; deviceId?: string | null },
    dto: { artifactId: string; currentVersion: string },
    clientIp?: string,
  ) {
    const release = await this.prisma.agentDesktopReleases.findFirst({
      where: {
        tenantId: session.tenantId,
        artifactId: dto.artifactId,
        isActive: true,
      },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
    });
    if (!release) {
      throw new Error('Approved desktop release not found');
    }

    const token = randomBytes(24).toString('hex');
    await this.redis.getClient().set(
      this.downloadKey(token),
      JSON.stringify({
        tenantId: session.tenantId,
        agentId: session.agentId,
        deviceId: session.deviceId ?? null,
        artifactId: release.artifactId,
        version: release.version,
        clientIp: clientIp ?? null,
      }),
      'EX',
      120,
    );

    return {
      success: true,
      data: {
        artifactId: release.artifactId,
        version: release.version,
        downloadUrl: `/agent-updates/artifacts/${release.artifactId}`,
        downloadToken: token,
        expiresIn: 120,
        sha256: release.sha256,
      },
      error: null,
    };
  }
```

- [ ] **Step 4: Rerun the tests**

Run:

```bash
cd apps/server
npm test -- --runTestsByPath test/agent-updates.service.spec.ts -t "update session token|1회성 download token"
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/modules/agent-updates/agent-updates.module.ts apps/server/src/modules/agent-updates/agent-updates.service.ts apps/server/src/modules/agent-updates/dto/create-update-session.dto.ts apps/server/src/modules/agent-updates/dto/download-init.dto.ts apps/server/test/agent-updates.service.spec.ts
git commit -m "feat: add update session and download tokens"
```

## Task 3: Add Controller Endpoints, Artifact Streaming, and Audit Writes

**Files:**
- Create: `apps/server/src/modules/agent-updates/agent-updates.controller.ts`
- Create: `apps/server/src/modules/agent-updates/dto/report-update.dto.ts`
- Modify: `apps/server/src/modules/agent-updates/agent-updates.module.ts`
- Modify: `apps/server/src/modules/agent-updates/agent-updates.service.ts`
- Modify: `apps/server/src/app.module.ts`
- Create: `apps/server/test/agent-updates.controller.spec.ts`
- Test: `apps/server/test/agent-updates.controller.spec.ts`

- [ ] **Step 1: Write the failing controller test**

Create `apps/server/test/agent-updates.controller.spec.ts`:

```ts
import { Test, TestingModule } from '@nestjs/testing';
jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(true),
  statSync: jest.fn().mockReturnValue({ size: 128 }),
  createReadStream: jest.fn().mockReturnValue({ pipe: jest.fn() }),
}));

import { AgentUpdatesController } from '../src/modules/agent-updates/agent-updates.controller';
import { AgentUpdatesService } from '../src/modules/agent-updates/agent-updates.service';

describe('AgentUpdatesController', () => {
  let controller: AgentUpdatesController;
  const service = {
    createUpdateSession: jest.fn(),
    validateUpdateSessionToken: jest.fn(),
    getManifest: jest.fn(),
    initDownload: jest.fn(),
    consumeDownloadToken: jest.fn(),
    recordAudit: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AgentUpdatesController],
      providers: [{ provide: AgentUpdatesService, useValue: service }],
    }).compile();

    controller = module.get(AgentUpdatesController);
  });

  it('manifest 는 update session token 검증 후 tenant 범위 manifest 를 반환한다', async () => {
    service.validateUpdateSessionToken.mockResolvedValue({
      tenantId: 'tenant-1',
      agentId: 'agent-1',
      deviceId: 'pc-001',
    });
    service.getManifest.mockResolvedValue({ success: true, data: { latestVersion: '1.4.0' }, error: null });

    await controller.getManifest(
      'Bearer session-token',
      '1.3.2',
    );

    expect(service.validateUpdateSessionToken).toHaveBeenCalledWith('session-token');
    expect(service.getManifest).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      currentVersion: '1.3.2',
      channel: 'stable',
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
cd apps/server
npm test -- --runTestsByPath test/agent-updates.controller.spec.ts
```

Expected: FAIL with `Cannot find module '../src/modules/agent-updates/agent-updates.controller'`.

- [ ] **Step 3: Add the controller, report DTO, audit helper, and app wiring**

Create `apps/server/src/modules/agent-updates/dto/report-update.dto.ts`:

```ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString } from 'class-validator';

export class ReportUpdateDto {
  @ApiProperty()
  @IsString()
  eventType: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deviceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  currentAppVersion?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  targetVersion?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  artifactId?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
```

Update `apps/server/src/modules/agent-updates/agent-updates.service.ts` with these methods:

```ts
  async validateUpdateSessionToken(token: string) {
    const raw = await this.redis.getClient().get(this.sessionKey(token));
    if (!raw) throw new Error('Invalid or expired update session token');
    return JSON.parse(raw) as {
      tenantId: string;
      agentId: string;
      role: string;
      deviceId?: string | null;
      currentVersion?: string | null;
      clientIp?: string | null;
    };
  }

  async consumeDownloadToken(token: string) {
    const raw = await this.redis.getClient().get(this.downloadKey(token));
    if (!raw) throw new Error('Invalid or expired download token');
    await this.redis.getClient().del(this.downloadKey(token));
    return JSON.parse(raw) as {
      tenantId: string;
      agentId: string;
      deviceId?: string | null;
      artifactId: string;
      version: string;
      clientIp?: string | null;
    };
  }

  async findArtifact(params: { tenantId: string; artifactId: string }) {
    return this.prisma.agentDesktopReleases.findFirst({
      where: {
        tenantId: params.tenantId,
        artifactId: params.artifactId,
        isActive: true,
      },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async recordAudit(params: {
    tenantId: string;
    agentId?: string | null;
    deviceId?: string | null;
    clientIp?: string | null;
    currentAppVersion?: string | null;
    targetVersion?: string | null;
    artifactId?: string | null;
    eventType: string;
    metadata?: Record<string, unknown>;
  }) {
    await this.prisma.agentDesktopUpdateAuditLogs.create({
      data: {
        tenantId: params.tenantId,
        agentId: params.agentId ?? null,
        deviceId: params.deviceId ?? null,
        clientIp: params.clientIp ?? null,
        currentAppVersion: params.currentAppVersion ?? null,
        targetVersion: params.targetVersion ?? null,
        artifactId: params.artifactId ?? null,
        eventType: params.eventType,
        metadata: params.metadata ?? undefined,
      },
    });
  }
```

Create `apps/server/src/modules/agent-updates/agent-updates.controller.ts`:

```ts
import { Body, Controller, Get, Headers, Ip, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { createReadStream, existsSync, statSync } from 'fs';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { AgentUpdatesService } from './agent-updates.service';
import { CreateUpdateSessionDto } from './dto/create-update-session.dto';
import { DownloadInitDto } from './dto/download-init.dto';
import { ReportUpdateDto } from './dto/report-update.dto';

@ApiTags('agent-updates')
@Controller('agent-updates')
export class AgentUpdatesController {
  constructor(private readonly agentUpdatesService: AgentUpdatesService) {}

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('session')
  @ApiOperation({ summary: '업데이트 세션 발급' })
  @ApiOkResponse({ schema: { example: { success: true, data: { updateSessionToken: 'token', expiresIn: 600 }, error: null } } })
  createSession(@Req() req: any, @Body() dto: CreateUpdateSessionDto, @Ip() clientIp?: string) {
    return this.agentUpdatesService.createUpdateSession(req.user, dto, clientIp);
  }

  @Get('manifest')
  @ApiOperation({ summary: '승인된 데스크톱 앱 manifest 조회' })
  getManifest(
    @Headers('authorization') authorization: string | undefined,
    @Query('currentVersion') currentVersion: string,
    @Query('channel') channel = 'stable',
  ) {
    const token = authorization?.replace(/^Bearer\s+/i, '') ?? '';
    return this.agentUpdatesService.validateUpdateSessionToken(token).then((session) =>
      this.agentUpdatesService.getManifest({
        tenantId: session.tenantId,
        currentVersion,
        channel,
      }),
    );
  }

  @Post('download-init')
  @ApiOperation({ summary: '업데이트 다운로드 토큰 발급' })
  async downloadInit(
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: DownloadInitDto,
    @Ip() clientIp?: string,
  ) {
    const token = authorization?.replace(/^Bearer\s+/i, '') ?? '';
    const session = await this.agentUpdatesService.validateUpdateSessionToken(token);
    return this.agentUpdatesService.initDownload(session, dto, clientIp);
  }

  @Get('artifacts/:artifactId')
  @ApiOperation({ summary: '업데이트 설치 파일 다운로드' })
  async downloadArtifact(
    @Param('artifactId') artifactId: string,
    @Headers('authorization') authorization: string | undefined,
    @Res() res: Response,
  ) {
    const token = authorization?.replace(/^Bearer\s+/i, '') ?? '';
    const session = await this.agentUpdatesService.consumeDownloadToken(token);
    const release = await this.agentUpdatesService.findArtifact({
      tenantId: session.tenantId,
      artifactId,
    });
    if (!release || !existsSync(release.filePath)) {
      throw new Error('Approved desktop artifact not found');
    }

    const stats = statSync(release.filePath);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', stats.size);
    res.setHeader('Content-Disposition', `attachment; filename="${release.fileName}"`);
    return createReadStream(release.filePath).pipe(res);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('report')
  @ApiOperation({ summary: '업데이트 다운로드/설치 결과 보고' })
  async report(
    @Req() req: any,
    @Body() dto: ReportUpdateDto,
    @Ip() clientIp?: string,
  ) {
    await this.agentUpdatesService.recordAudit({
      tenantId: req.user.tenantId,
      agentId: req.user.sub,
      deviceId: dto.deviceId ?? null,
      clientIp: clientIp ?? null,
      currentAppVersion: dto.currentAppVersion ?? null,
      targetVersion: dto.targetVersion ?? null,
      artifactId: dto.artifactId ?? null,
      eventType: dto.eventType,
      metadata: dto.metadata,
    });
    return { success: true, data: { recorded: true }, error: null };
  }
}
```

Update `apps/server/src/modules/agent-updates/agent-updates.module.ts`:

```ts
import { AgentUpdatesController } from './agent-updates.controller';

@Module({
  controllers: [AgentUpdatesController],
  providers: [AgentUpdatesService],
  exports: [AgentUpdatesService],
})
export class AgentUpdatesModule {}
```

Update `apps/server/src/app.module.ts`:

```ts
import { AgentUpdatesModule } from './modules/agent-updates/agent-updates.module';
```

```ts
    AgentUpdatesModule,
```

- [ ] **Step 4: Run the controller test**

Run:

```bash
cd apps/server
npm test -- --runTestsByPath test/agent-updates.controller.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/modules/agent-updates/agent-updates.controller.ts apps/server/src/modules/agent-updates/agent-updates.module.ts apps/server/src/modules/agent-updates/agent-updates.service.ts apps/server/src/modules/agent-updates/dto/report-update.dto.ts apps/server/src/app.module.ts apps/server/test/agent-updates.controller.spec.ts
git commit -m "feat: add agent update hub endpoints"
```

## Task 4: Publish the Concrete Update API Contract and Export OpenAPI

**Files:**
- Create: `docs/design/agent-desktop-update-api.md`
- Modify: `apps/server/src/modules/agent-updates/agent-updates.controller.ts`
- Test: `apps/server/scripts/export-openapi.ts` via `npm run openapi:export`

- [ ] **Step 1: Write the API contract document**

Create `docs/design/agent-desktop-update-api.md`:

```md
# Agent Desktop Update API

## Purpose

This document defines the server-side update hub exposed by each call-center server for the Windows agent desktop application.

## Authentication

- `POST /agent-updates/session` requires the normal CTI access token.
- `GET /agent-updates/manifest` and `POST /agent-updates/download-init` require `Authorization: Bearer <updateSessionToken>`.
- `GET /agent-updates/artifacts/:artifactId` requires `Authorization: Bearer <downloadToken>`.
- `POST /agent-updates/report` requires the normal CTI access token.

## Endpoints

- `POST /agent-updates/session`
- `GET /agent-updates/manifest`
- `POST /agent-updates/download-init`
- `GET /agent-updates/artifacts/:artifactId`
- `POST /agent-updates/report`

## Audit Events

- `download_started`
- `download_completed`
- `install_scheduled`
- `install_completed`
- `install_failed`
- `rollback_completed`
```

- [ ] **Step 2: Tighten Swagger descriptions in the controller**

Update the `@ApiOperation` descriptions in `apps/server/src/modules/agent-updates/agent-updates.controller.ts`:

```ts
  @ApiOperation({
    summary: '업데이트 세션 발급',
    description: '일반 CTI access token 을 updateSessionToken 으로 교환한다. updateSessionToken 은 manifest 와 download-init 호출에만 사용한다.',
  })
```

```ts
  @ApiOperation({
    summary: '승인된 데스크톱 앱 manifest 조회',
    description: '콜센터 서버에 승인된 최신 에이전트 데스크톱 버전과 강제 업데이트 정책을 반환한다. Authorization 헤더에는 updateSessionToken 을 보낸다.',
  })
```

```ts
  @ApiOperation({
    summary: '업데이트 설치 파일 다운로드',
    description: 'Authorization 헤더의 downloadToken 이 가리키는 artifact 와 요청 artifactId 가 일치할 때만 파일을 내려준다.',
  })
```

- [ ] **Step 3: Export OpenAPI**

Run:

```bash
cd apps/server
npm run openapi:export
```

Expected: PASS and `docs/openapi.json` contains the `agent-updates` endpoints.

- [ ] **Step 4: Commit**

```bash
git add docs/design/agent-desktop-update-api.md apps/server/src/modules/agent-updates/agent-updates.controller.ts docs/openapi.json
git commit -m "docs: publish agent desktop update api"
```

## Task 5: Final Regression Pass

**Files:**
- Modify: none unless regressions are found
- Test: focused service/controller tests, Prisma generate, Nest build, OpenAPI export

- [ ] **Step 1: Run the focused tests**

Run:

```bash
cd apps/server
npm test -- --runTestsByPath test/agent-updates.service.spec.ts test/agent-updates.controller.spec.ts
```

Expected: PASS.

- [ ] **Step 2: Regenerate Prisma client**

Run:

```bash
cd apps/server
npx prisma generate
```

Expected: PASS with the new update hub models available in the Prisma client.

- [ ] **Step 3: Build the server**

Run:

```bash
cd apps/server
npm run build
```

Expected: PASS.

- [ ] **Step 4: Check the diff**

Run:

```bash
git status --short
git diff --stat
```

Expected: only the planned update-hub files plus generated `docs/openapi.json` changes.

- [ ] **Step 5: Commit follow-up fixes only if needed**

```bash
git add apps/server/prisma/schema.prisma apps/server/prisma/migrations/20260422_agent_updates_hub/migration.sql apps/server/src/app.module.ts apps/server/src/modules/agent-updates/agent-updates.module.ts apps/server/src/modules/agent-updates/agent-updates.service.ts apps/server/src/modules/agent-updates/agent-updates.controller.ts apps/server/src/modules/agent-updates/dto/create-update-session.dto.ts apps/server/src/modules/agent-updates/dto/download-init.dto.ts apps/server/src/modules/agent-updates/dto/report-update.dto.ts apps/server/test/agent-updates.service.spec.ts apps/server/test/agent-updates.controller.spec.ts docs/design/agent-desktop-update-api.md docs/openapi.json
git commit -m "fix: polish agent update hub"
```

## Spec Coverage Check

- `운영사 -> 콜센터 서버 -> 상담원 앱`:
  Covered by the new update hub module and per-tenant approved release table.
- `콜센터 서버 HTTPS 업데이트 허브`:
  Covered by Task 3 endpoints.
- `별도 update session token / download token`:
  Covered by Task 2.
- `manifest / download-init / artifact / report API`:
  Covered by Tasks 2-4.
- `감사 로그`:
  Covered by Task 3 via `agentDesktopUpdateAuditLogs`.
- `롤백 / 운영사 중앙 배포 툴`:
  Only the data contract is covered here. Operator-side distribution tooling is deferred.

## Deferred Follow-Up Plans

- Electron desktop client update polling and safe-install behavior
- Operator-to-center file distribution tooling
- Internal CA based code-signing rollout on the operator build server before formal production
- Version compatibility enforcement against the running CTI server version
- Optional stronger download-token verification such as IP pinning or nonce replay telemetry
