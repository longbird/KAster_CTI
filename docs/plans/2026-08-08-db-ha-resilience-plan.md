# K-CTI DB HA Resilience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 첨부 DB 장애 대응 설계를 현재 KAster_CTI 코드에 맞춰 운영 모드, LKG 설정, 영속 이벤트 스풀, 재처리, 모니터링, 백업 Runbook으로 구현한다.

**Architecture:** 기존 NestJS 모듈 구조를 유지하고 `ResilienceModule`을 새로 추가한다. AMI 이벤트는 DB 처리 전에 durable spool에 기록하고, DB 장애 중에는 operating mode와 정책 가드가 기능을 축소하며, 복구 후 Recovery Coordinator가 PBX 실제 상태와 spool/replay batch를 기준으로 상태를 재구성한다.

**Tech Stack:** NestJS 10, Prisma 5, PostgreSQL 16, Redis/ioredis, prom-client, React 18, Ant Design 5, Vite, Jest.

---

## File Structure

- Modify: `apps/server/src/modules/redis/ami-leader-election.service.ts` **(Task 0A, 선행)**
  - Makes `tick()` fault-tolerant so a Redis outage cannot leak an unhandled rejection or freeze leadership.
- Create: `apps/server/src/modules/redis/ami-leader-election.service.spec.ts` **(Task 0A, 선행)**
  - Covers Redis-outage leadership release and re-acquisition.
- Create: `apps/server/prisma/migrations/20260808_db_resilience/migration.sql`
  - Adds config versioning, apply status, emergency changes, spool/replay audit tables.
- Modify: `apps/server/prisma/schema.prisma`
  - Adds Prisma models matching the migration.
- Create: `apps/server/src/modules/resilience/resilience.module.ts`
  - Wires operating mode, spool, config snapshot, recovery services.
- Create: `apps/server/src/modules/resilience/operating-mode.service.ts`
  - Owns `NORMAL`, `DB_FAILOVER`, `DEGRADED`, `RECOVERING` state transitions.
- Create: `apps/server/src/modules/resilience/operating-mode.types.ts`
  - Exports shared policy/result types.
- Create: `apps/server/src/modules/resilience/write-availability.guard.ts`
  - Blocks unsafe writes in `DEGRADED` and `RECOVERING`.
- Create: `apps/server/src/modules/resilience/durable-spool.service.ts`
  - Writes AMI events and offline commands to Redis Streams with local append-only fallback.
- Create: `apps/server/src/modules/resilience/local-spool.store.ts`
  - Handles JSONL append, fsync, cursor, and atomic archive.
- Create: `apps/server/src/modules/resilience/config-snapshot.service.ts`
  - Builds, validates, stores, and loads LKG snapshots.
- Create: `apps/server/src/modules/resilience/recovery-coordinator.service.ts`
  - Runs replay batches and PBX state reconciliation.
- Create: `apps/server/src/modules/resilience/resilience.controller.ts`
  - Exposes admin status, queue depth, replay batch, LKG status, emergency changes.
- Create: `apps/server/src/modules/resilience/*.spec.ts`
  - Focused Jest tests for mode transitions, spool fallback, LKG validation, replay idempotency.
- Modify: `apps/server/src/app.module.ts`
  - Imports `ResilienceModule` before `AmiModule`, `CallsModule`, `HealthModule`.
- Modify: `apps/server/src/modules/ami/ami-connection.service.ts`
  - Records normalized AMI event to durable spool before session processing.
- Modify: `apps/server/src/modules/calls/session-engine.service.ts` **(Task 0B, 선행)**
  - Adds a replay path that bypasses the Redis dedupe key, and releases that key when the DB write fails.
- Modify: `apps/server/src/modules/calls/session-engine.service.spec.ts` **(Task 0B, 선행)**
  - Covers dedupe-key release on DB failure and replay-mode behavior.
- Modify: `apps/server/src/modules/health/health-summary.service.ts`
  - Adds operating mode, LKG, spool, DB role, backup/WAL fields.
- Modify: `apps/server/src/modules/health/dto/health-response.dto.ts`
  - Extends API contract for admin UI.
- Modify: `apps/server/src/modules/monitoring/metrics.service.ts`
  - Adds resilience gauges.
- Modify: `apps/admin/src/features/monitoring/types/health.ts`
  - Extends `HealthResponse` with resilience fields.
- Modify: `apps/admin/src/features/monitoring/hooks/useHealthData.ts`
  - No behavior change expected; update typing only if needed.
- Modify: `apps/admin/src/pages/MonitoringPage.tsx`
  - Adds operating mode, LKG, queue depth, version mismatch panels.
- Modify: `apps/admin/src/components/AppLayout.tsx`
  - Adds global top banner for degraded operation.
- Create: `apps/admin/src/features/resilience/useOperatingMode.ts`
  - Polls `/health` and exposes mode/restrictions to pages.
- Create: `infra/postgres/README.md`
  - Documents Patroni, HAProxy/VIP, pgBackRest, WAL archive, PITR, and drill steps.
- Create: `infra/postgres/patroni.sample.yml`
  - Sample Patroni config using environment-variable substitution.
- Create: `infra/postgres/haproxy.sample.cfg`
  - Sample writer endpoint routing.
- Create: `infra/postgres/pgbackrest.sample.conf`
  - Sample backup repository and retention policy.

## Task 0A: AMI Leader Election Hardening (선행)

**왜 먼저 하는가:** `ami-leader-election.service.ts` 의 `tick()` 에는 try/catch 가 없다. Redis 가 죽으면
`client.set()` 이 reject 하고 `setInterval` 콜백에서 unhandled rejection 이 발생한다 (Node 기본 설정에서는
프로세스가 죽을 수 있다). 그리고 `isLeaderNode` 는 **직전 값 그대로 굳는다** — 리더였던 노드는 Redis 락이
만료됐는데도 계속 리더로 동작하고(복구 후 split-brain), 비리더였던 노드는 영원히 비리더로 남는다.
`ami-connection.service.ts:88` 이 이 값으로 이벤트 처리를 게이트하므로, Task 9 의 `DB+Redis 동시 장애` 와
`Middleware 재시작` 인수 테스트는 Task 3 의 spool 로직에 닿기도 전에 무너진다.

**Files:**
- Modify: `apps/server/src/modules/redis/ami-leader-election.service.ts`
- Test: `apps/server/src/modules/redis/ami-leader-election.service.spec.ts`

- [ ] **Step 1: Write failing leadership tests**

```ts
import { AmiLeaderElectionService } from './ami-leader-election.service';

const redisOf = (client: any) => ({ getClient: () => client }) as any;

describe('AmiLeaderElectionService', () => {
  it('Redis 장애 시 예외를 밖으로 흘리지 않고 리더십을 내려놓는다', async () => {
    const client = {
      set: jest.fn().mockResolvedValueOnce('OK').mockRejectedValue(new Error('redis down')),
      get: jest.fn(),
      pexpire: jest.fn(),
    };
    const service = new AmiLeaderElectionService(redisOf(client));

    await service.tick();
    expect(service.isLeader()).toBe(true);

    await expect(service.tick()).resolves.toBeUndefined();
    expect(service.isLeader()).toBe(false);
  });

  it('Redis 복구 후 리더십을 다시 잡는다', async () => {
    const client = {
      set: jest.fn().mockRejectedValueOnce(new Error('redis down')).mockResolvedValue('OK'),
      get: jest.fn(),
      pexpire: jest.fn(),
    };
    const service = new AmiLeaderElectionService(redisOf(client));

    await service.tick();
    expect(service.isLeader()).toBe(false);

    await service.tick();
    expect(service.isLeader()).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/server
npm test -- ami-leader-election.service.spec.ts --runInBand
```

Expected: FAIL — `tick()` 이 `private` 이고 Redis 예외가 그대로 reject 된다.

- [ ] **Step 3: Make `tick()` public and absorb Redis faults**

```ts
async tick(): Promise<void> {
  try {
    const client = this.redis.getClient();
    const result = await client.set(this.lockKey, this.nodeId, 'PX', 10000, 'NX');

    if (result === 'OK') {
      if (!this.isLeaderNode) {
        this.logger.log(`Leadership acquired by ${this.nodeId}`);
      }
      this.isLeaderNode = true;
      return;
    }

    const current = await client.get(this.lockKey);
    if (current === this.nodeId) {
      await client.pexpire(this.lockKey, 10000);
      this.isLeaderNode = true;
      return;
    }

    this.isLeaderNode = false;
  } catch (err) {
    // Redis 를 못 쓰면 리더십을 증명할 수 없다. fail-safe 로 내려놓는다.
    // 이벤트 유실은 Task 3 의 spool 이 막는다 (spool 은 리더 게이트 앞에서 동작).
    if (this.isLeaderNode) {
      this.logger.warn(`Leadership released: redis unavailable (${(err as Error).message})`);
    }
    this.isLeaderNode = false;
  }
}
```

- [ ] **Step 4: Stop the interval from leaking rejections**

```ts
onModuleInit(): void {
  void this.tick();
  setInterval(() => void this.tick(), 5000);
}
```

- [ ] **Step 5: Red-Green verification**

1. 테스트 실행 → PASS
2. Step 3 의 `try`/`catch` 를 임시 제거 → 재실행 → **FAIL 확인** (테스트가 실제로 이 결함을 잡는지 증명)
3. 되돌리고 재실행 → PASS

```bash
cd apps/server
npm test -- ami-leader-election.service.spec.ts ami-connection.service.spec.ts --runInBand
```

**Task 3 에 대한 계약:** 이 태스크는 Redis 장애 시 **어떤 노드도 리더가 아닌** 상태를 만든다. 따라서 Task 3 의
spool append 는 반드시 `ami-connection.service.ts` 의 리더 게이트(`if (!this.leader.isLeader()) continue;`)
**앞**에서 일어나야 한다. 게이트 뒤에 두면 Redis 장애 구간의 이벤트가 통째로 사라진다. 모든 노드가 같은
`eventFingerprint` 를 idempotency key 로 쓰므로 노드 수만큼 생기는 중복은 replay 단계에서 제거된다.

## Task 0B: Replay-Safe Dedupe (선행)

**왜 먼저 하는가:** `session-engine.service.ts:226-239` 는 Redis dedupe 키를 DB insert **앞에서**
`SET NX EX 21600`(6시간)으로 선점한다. DB 장애 중에는 (1) Redis 는 살아 있으므로 키 선점이 성공하고,
(2) `prisma.rawAmiEvents.create()` 가 실패하며, (3) 키는 6시간 그대로 남는다. 복구 후 Task 5 의 Recovery
Coordinator 가 같은 이벤트를 다시 넣으면 line 232 의 `ok !== 'OK'` 에서 즉시 return 되어
**spool 에 보존한 이벤트가 전부 조용히 버려진다.** 즉 6시간 미만 장애에서는 Task 3 의 Durable Event Spool 이
통째로 무의미해진다.

**Files:**
- Modify: `apps/server/src/modules/calls/session-engine.service.ts`
- Test: `apps/server/src/modules/calls/session-engine.service.spec.ts`

- [ ] **Step 1: Write failing dedupe/replay tests**

```ts
import { Prisma } from '@prisma/client';
import { SessionEngineService } from './session-engine.service';

const P2002 = new Prisma.PrismaClientKnownRequestError('unique', {
  code: 'P2002',
  clientVersion: '5.22.0',
});

function build(overrides: { create?: jest.Mock; redisSet?: jest.Mock } = {}) {
  const set = overrides.redisSet ?? jest.fn().mockResolvedValue('OK');
  const del = jest.fn().mockResolvedValue(1);
  const prisma = {
    rawAmiEvents: { create: overrides.create ?? jest.fn().mockResolvedValue({}) },
    agents: { findFirst: jest.fn() },
    $transaction: jest.fn(async (handler: any) =>
      handler({
        callSessions: { findUnique: jest.fn(), upsert: jest.fn(), update: jest.fn() },
        eventOutbox: { create: jest.fn() },
        customerPhones: { findFirst: jest.fn() },
      }),
    ),
  };
  const redis = { getClient: () => ({ set, del }) };
  const service = new SessionEngineService(prisma as any, redis as any, {} as any);
  return { service, set, del, prisma };
}

const event = {
  tenantId: '00000000-0000-0000-0000-000000000001',
  eventName: 'QueueCallerJoin',
  linkedid: '1700000000.1',
  uniqueid: '1700000000.1',
  eventTime: '2026-08-08T00:00:00.000Z',
};

describe('SessionEngineService dedupe / replay', () => {
  it('DB insert 가 실패하면 선점한 dedupe 키를 해제한다', async () => {
    const { service, del } = build({ create: jest.fn().mockRejectedValue(new Error('db down')) });

    await expect(service.processNormalizedEvent({ ...event })).rejects.toThrow('db down');
    expect(del).toHaveBeenCalledWith(expect.stringMatching(/^dedupe:ami:/));
  });

  it('replay 모드는 Redis dedupe 를 건너뛴다', async () => {
    // 장애 중 선점된 키가 아직 남아 있는 상황
    const { service, set } = build({ redisSet: jest.fn().mockResolvedValue(null) });

    await service.processNormalizedEvent({ ...event }, { replay: true });

    expect(set).not.toHaveBeenCalled();
  });

  it('replay 모드는 raw 행이 이미 있어도 상태 전이를 계속한다', async () => {
    const { service, prisma } = build({ create: jest.fn().mockRejectedValue(P2002) });

    await service.processNormalizedEvent({ ...event }, { replay: true });

    expect(prisma.$transaction).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/server
npm test -- session-engine.service.spec.ts --runInBand
```

Expected: FAIL — `processNormalizedEvent` 에 두 번째 인자가 없고, DB 실패 시 dedupe 키를 풀지 않는다.

- [ ] **Step 3: Add the replay option and bypass Redis dedupe**

```ts
async processNormalizedEvent(
  event: Record<string, any>,
  options: { replay?: boolean } = {},
) {
  const linkedid = event.linkedid || event.Linkedid;
  if (!linkedid) return;

  const fingerprint = computeFingerprint(event);
  const dedupeKey = `dedupe:ami:${fingerprint}`;
  let dedupeKeyOwned = false;

  // replay 는 Redis dedupe 를 건너뛴다. DB 장애 중 선점된 키가 최대 6시간 남아 있어
  // 재처리를 통째로 막기 때문. 중복은 rawAmiEvents unique 가 막는다.
  if (!options.replay) {
    try {
      const ok = await this.redis
        .getClient()
        .set(dedupeKey, '1', 'EX', DEDUPE_TTL_SECONDS, 'NX');
      if (ok !== 'OK') {
        this.logger.debug(`dedupe skip ${event.eventName} fp=${fingerprint.slice(0, 12)}`);
        return;
      }
      dedupeKeyOwned = true;
    } catch (err) {
      // Redis 장애 시에도 DB unique 가 최종 방어선이 되도록 계속 진행.
      this.logger.warn(`redis dedupe failed: ${(err as Error).message}`);
    }
  }
```

- [ ] **Step 4: Release the dedupe key when the DB write fails**

```ts
  try {
    await this.prisma.rawAmiEvents.create({ /* 기존과 동일 */ });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      this.logger.debug(`db dedupe skip ${event.eventName} fp=${fingerprint.slice(0, 12)}`);
      if (!options.replay) return;   // Step 5 참고
    } else {
      // 이 이벤트를 저장하지 못했으므로 선점을 반드시 풀어준다. 풀지 않으면 복구 후
      // replay 뿐 아니라 정상 경로의 재수신까지 6시간 동안 막힌다.
      if (dedupeKeyOwned) {
        await this.releaseDedupeKey(dedupeKey);
      }
      throw err;
    }
  }
```

```ts
private async releaseDedupeKey(dedupeKey: string) {
  try {
    await this.redis.getClient().del(dedupeKey);
  } catch (err) {
    this.logger.warn(`dedupe key release failed ${dedupeKey}: ${(err as Error).message}`);
  }
}
```

- [ ] **Step 5: In replay mode, keep going past P2002**

raw 이벤트 저장과 세션 상태 전이는 **서로 다른 두 번의 쓰기**다. 장애 중 `rawAmiEvents` insert 는 성공했지만
뒤따르는 `$transaction` 상태 전이가 실패한 이벤트가 존재할 수 있다. 현재 코드는 P2002 이면 상태 전이 **전에**
return 하므로, 그런 이벤트는 아무리 replay 해도 세션에 영원히 반영되지 않는다.

- 정상 경로: P2002 → 즉시 return (기존 동작 유지)
- replay 경로: P2002 → "raw 는 이미 기록됨" 으로 해석하고 **상태 전이 switch 를 계속 수행**

멱등성은 `callSessions` upsert 와 상단 `SESSION_PRECEDENCE` 역행 가드가 보장한다.

- [ ] **Step 6: Red-Green verification**

1. 테스트 실행 → PASS
2. Step 4 의 `releaseDedupeKey` 호출을 임시 제거 → 재실행 → **FAIL 확인**
3. 되돌리고 전체 회귀 실행 → PASS

```bash
cd apps/server
npm test -- session-engine.service.spec.ts calls.service.spec.ts --runInBand
npm test -- --runInBand
```

Expected: 신규 3건 포함 전체 PASS. 기존 `session-engine.spec.ts`(통합) 회귀 없음.

**Task 5 에 대한 계약:** Recovery Coordinator 는 `processNormalizedEvent(event, { replay: true })` 로 호출한다.
Task 5 Step 1 의 테스트("skips raw events already stored by fingerprint during replay")는 이 계약과 **모순되므로
폐기한다.** replay 는 raw 중복을 건너뛰는 것이 아니라, raw 중복 삽입은 무시하고 상태 전이는 다시 수행한다.

## Task 1: Schema Contract

**Files:**
- Create: `apps/server/prisma/migrations/20260808_db_resilience/migration.sql`
- Modify: `apps/server/prisma/schema.prisma`
- Test: `apps/server/src/modules/resilience/schema-contract.spec.ts`

- [ ] **Step 1: Write the schema contract test**

```ts
import { PrismaClient } from '@prisma/client';

describe('DB resilience schema contract', () => {
  const prisma = new PrismaClient();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('exposes config version, apply status, replay, and audit models', () => {
    expect(prisma.configVersions).toBeDefined();
    expect(prisma.configApplyStatus).toBeDefined();
    expect(prisma.configEmergencyChanges).toBeDefined();
    expect(prisma.offlineSpoolEntries).toBeDefined();
    expect(prisma.replayBatches).toBeDefined();
    expect(prisma.recoveryAuditLog).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd apps/server
npm test -- schema-contract.spec.ts --runInBand
```

Expected: FAIL because the Prisma models do not exist.

- [ ] **Step 3: Add migration SQL**

Create `apps/server/prisma/migrations/20260808_db_resilience/migration.sql`:

```sql
CREATE TABLE config_versions (
  config_version_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id),
  config_type VARCHAR(64) NOT NULL,
  version BIGINT NOT NULL,
  schema_version INTEGER NOT NULL,
  payload JSONB NOT NULL,
  checksum VARCHAR(64) NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_agent_id UUID NULL REFERENCES agents(agent_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, config_type, version)
);

CREATE TABLE config_apply_status (
  apply_status_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id),
  node_id VARCHAR(128) NOT NULL,
  config_type VARCHAR(64) NOT NULL,
  desired_version BIGINT NOT NULL,
  applied_version BIGINT NULL,
  applied_checksum VARCHAR(64) NULL,
  status VARCHAR(32) NOT NULL,
  last_error TEXT NULL,
  applied_at TIMESTAMPTZ NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, node_id, config_type)
);

CREATE TABLE config_emergency_changes (
  emergency_change_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id),
  config_type VARCHAR(64) NOT NULL,
  requested_by_agent_id UUID NOT NULL REFERENCES agents(agent_id),
  approved_by_agent_id UUID NOT NULL REFERENCES agents(agent_id),
  reason TEXT NOT NULL,
  before_payload JSONB NOT NULL,
  after_payload JSONB NOT NULL,
  applied_version BIGINT NOT NULL,
  merge_status VARCHAR(32) NOT NULL DEFAULT 'PENDING_REVIEW',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ NULL
);

CREATE TABLE offline_spool_entries (
  spool_entry_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id),
  entry_type VARCHAR(32) NOT NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  linkedid VARCHAR(32) NULL,
  uniqueid VARCHAR(32) NULL,
  payload JSONB NOT NULL,
  source VARCHAR(32) NOT NULL,
  redis_stream_id VARCHAR(64) NULL,
  local_spool_path TEXT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ NULL,
  last_error TEXT NULL,
  UNIQUE (tenant_id, entry_type, idempotency_key)
);

CREATE TABLE replay_batches (
  replay_batch_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id),
  replay_type VARCHAR(32) NOT NULL,
  status VARCHAR(32) NOT NULL,
  range_start TIMESTAMPTZ NULL,
  range_end TIMESTAMPTZ NULL,
  linkedid VARCHAR(32) NULL,
  cursor JSONB NOT NULL DEFAULT '{}'::jsonb,
  total_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  failure_count INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NULL,
  finished_at TIMESTAMPTZ NULL,
  created_by_agent_id UUID NULL REFERENCES agents(agent_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE recovery_audit_log (
  recovery_audit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id),
  event_type VARCHAR(64) NOT NULL,
  operating_mode VARCHAR(32) NOT NULL,
  message TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor_agent_id UUID NULL REFERENCES agents(agent_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_config_versions_latest ON config_versions (tenant_id, config_type, version DESC);
CREATE INDEX idx_config_apply_status_node ON config_apply_status (node_id, status);
CREATE INDEX idx_offline_spool_pending ON offline_spool_entries (status, received_at);
CREATE INDEX idx_replay_batches_status ON replay_batches (status, created_at);
CREATE INDEX idx_recovery_audit_created ON recovery_audit_log (tenant_id, created_at DESC);
```

- [ ] **Step 4: Add Prisma models**

Add models using existing lower-camel plural naming style:

```prisma
model configVersions {
  configVersionId String   @id @default(uuid()) @map("config_version_id") @db.Uuid
  tenantId        String   @map("tenant_id") @db.Uuid
  configType      String   @map("config_type") @db.VarChar(64)
  version         BigInt
  schemaVersion   Int      @map("schema_version")
  payload         Json
  checksum        String   @db.VarChar(64)
  generatedAt     DateTime @default(now()) @map("generated_at") @db.Timestamptz(6)
  createdByAgentId String? @map("created_by_agent_id") @db.Uuid
  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  tenant          tenants  @relation(fields: [tenantId], references: [tenantId])
  createdByAgent  agents?  @relation(fields: [createdByAgentId], references: [agentId])

  @@unique([tenantId, configType, version])
  @@index([tenantId, configType, version(sort: Desc)])
  @@map("config_versions")
}

model configApplyStatus {
  applyStatusId  String    @id @default(uuid()) @map("apply_status_id") @db.Uuid
  tenantId       String    @map("tenant_id") @db.Uuid
  nodeId         String    @map("node_id") @db.VarChar(128)
  configType     String    @map("config_type") @db.VarChar(64)
  desiredVersion BigInt    @map("desired_version")
  appliedVersion BigInt?   @map("applied_version")
  appliedChecksum String?  @map("applied_checksum") @db.VarChar(64)
  status         String    @db.VarChar(32)
  lastError      String?   @map("last_error")
  appliedAt      DateTime? @map("applied_at") @db.Timestamptz(6)
  updatedAt      DateTime  @default(now()) @map("updated_at") @db.Timestamptz(6)

  tenant         tenants   @relation(fields: [tenantId], references: [tenantId])

  @@unique([tenantId, nodeId, configType])
  @@index([nodeId, status])
  @@map("config_apply_status")
}

model configEmergencyChanges {
  emergencyChangeId String    @id @default(uuid()) @map("emergency_change_id") @db.Uuid
  tenantId          String    @map("tenant_id") @db.Uuid
  configType        String    @map("config_type") @db.VarChar(64)
  requestedByAgentId String   @map("requested_by_agent_id") @db.Uuid
  approvedByAgentId String    @map("approved_by_agent_id") @db.Uuid
  reason            String
  beforePayload     Json      @map("before_payload")
  afterPayload      Json      @map("after_payload")
  appliedVersion    BigInt    @map("applied_version")
  mergeStatus       String    @default("PENDING_REVIEW") @map("merge_status") @db.VarChar(32)
  createdAt         DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  reviewedAt        DateTime? @map("reviewed_at") @db.Timestamptz(6)

  tenant            tenants   @relation(fields: [tenantId], references: [tenantId])
  requestedByAgent  agents    @relation("config_emergency_requested_by", fields: [requestedByAgentId], references: [agentId])
  approvedByAgent   agents    @relation("config_emergency_approved_by", fields: [approvedByAgentId], references: [agentId])

  @@map("config_emergency_changes")
}

model offlineSpoolEntries {
  spoolEntryId   String    @id @default(uuid()) @map("spool_entry_id") @db.Uuid
  tenantId       String    @map("tenant_id") @db.Uuid
  entryType      String    @map("entry_type") @db.VarChar(32)
  idempotencyKey String    @map("idempotency_key") @db.VarChar(128)
  linkedid       String?   @db.VarChar(32)
  uniqueid       String?   @db.VarChar(32)
  payload        Json
  source         String    @db.VarChar(32)
  redisStreamId  String?   @map("redis_stream_id") @db.VarChar(64)
  localSpoolPath String?   @map("local_spool_path")
  status         String    @default("PENDING") @db.VarChar(32)
  receivedAt     DateTime  @default(now()) @map("received_at") @db.Timestamptz(6)
  processedAt    DateTime? @map("processed_at") @db.Timestamptz(6)
  lastError      String?   @map("last_error")

  tenant         tenants   @relation(fields: [tenantId], references: [tenantId])

  @@unique([tenantId, entryType, idempotencyKey])
  @@index([status, receivedAt])
  @@map("offline_spool_entries")
}

model replayBatches {
  replayBatchId   String    @id @default(uuid()) @map("replay_batch_id") @db.Uuid
  tenantId        String    @map("tenant_id") @db.Uuid
  replayType      String    @map("replay_type") @db.VarChar(32)
  status          String    @db.VarChar(32)
  rangeStart      DateTime? @map("range_start") @db.Timestamptz(6)
  rangeEnd        DateTime? @map("range_end") @db.Timestamptz(6)
  linkedid        String?   @db.VarChar(32)
  cursor          Json      @default("{}")
  totalCount      Int       @default(0) @map("total_count")
  successCount    Int       @default(0) @map("success_count")
  failureCount    Int       @default(0) @map("failure_count")
  startedAt       DateTime? @map("started_at") @db.Timestamptz(6)
  finishedAt      DateTime? @map("finished_at") @db.Timestamptz(6)
  createdByAgentId String?  @map("created_by_agent_id") @db.Uuid
  createdAt       DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt       DateTime  @default(now()) @map("updated_at") @db.Timestamptz(6)

  tenant          tenants   @relation(fields: [tenantId], references: [tenantId])
  createdByAgent  agents?   @relation("replay_created_by", fields: [createdByAgentId], references: [agentId])

  @@index([status, createdAt])
  @@map("replay_batches")
}

model recoveryAuditLog {
  recoveryAuditId String   @id @default(uuid()) @map("recovery_audit_id") @db.Uuid
  tenantId        String   @map("tenant_id") @db.Uuid
  eventType       String   @map("event_type") @db.VarChar(64)
  operatingMode   String   @map("operating_mode") @db.VarChar(32)
  message         String
  details         Json     @default("{}")
  actorAgentId    String?  @map("actor_agent_id") @db.Uuid
  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  tenant          tenants  @relation(fields: [tenantId], references: [tenantId])
  actorAgent      agents?  @relation("recovery_audit_actor", fields: [actorAgentId], references: [agentId])

  @@index([tenantId, createdAt(sort: Desc)])
  @@map("recovery_audit_log")
}
```

- [ ] **Step 5: Generate Prisma client and run the schema test**

Run:

```bash
cd apps/server
npm run prisma:generate
npm test -- schema-contract.spec.ts --runInBand
```

Expected: PASS.

## Task 2: Operating Mode Service

**Files:**
- Create: `apps/server/src/modules/resilience/operating-mode.types.ts`
- Create: `apps/server/src/modules/resilience/operating-mode.service.ts`
- Create: `apps/server/src/modules/resilience/write-availability.guard.ts`
- Create: `apps/server/src/modules/resilience/resilience.module.ts`
- Modify: `apps/server/src/app.module.ts`
- Test: `apps/server/src/modules/resilience/operating-mode.service.spec.ts`

- [ ] **Step 1: Write failing mode transition tests**

```ts
import { OperatingModeService } from './operating-mode.service';

describe('OperatingModeService', () => {
  it('enters DB_FAILOVER on short DB outage and DEGRADED after threshold', () => {
    const service = new OperatingModeService({ degradedAfterMs: 30_000 } as any);
    service.recordDbFailure(new Date('2026-08-08T00:00:00.000Z'));
    expect(service.snapshot().mode).toBe('DB_FAILOVER');

    service.recordDbFailure(new Date('2026-08-08T00:00:31.000Z'));
    expect(service.snapshot().mode).toBe('DEGRADED');
    expect(service.snapshot().restrictions.allowGeneralConfigWrites).toBe(false);
  });

  it('moves through RECOVERING before NORMAL', () => {
    const service = new OperatingModeService({ degradedAfterMs: 30_000 } as any);
    service.recordDbFailure(new Date('2026-08-08T00:00:00.000Z'));
    service.recordDbRecovered(new Date('2026-08-08T00:01:00.000Z'));
    expect(service.snapshot().mode).toBe('RECOVERING');
    service.markRecoveryComplete(new Date('2026-08-08T00:02:00.000Z'));
    expect(service.snapshot().mode).toBe('NORMAL');
  });
});
```

- [ ] **Step 2: Implement shared types**

```ts
export type OperatingMode = 'NORMAL' | 'DB_FAILOVER' | 'DEGRADED' | 'RECOVERING';

export interface OperatingRestrictions {
  allowExistingCallControl: boolean;
  allowGeneralConfigWrites: boolean;
  allowEmergencyConfigWrites: boolean;
  allowNewLogin: boolean;
  allowCustomerCacheMissLookup: boolean;
}

export interface OperatingModeSnapshot {
  mode: OperatingMode;
  since: string;
  lastDbFailureAt: string | null;
  lastDbRecoveredAt: string | null;
  dataFreshness: {
    db: 'fresh' | 'stale' | 'unavailable';
    config: 'fresh' | 'lkg' | 'missing';
    customer: 'fresh' | 'cache-only' | 'unavailable';
  };
  restrictions: OperatingRestrictions;
}
```

- [ ] **Step 3: Implement mode service**

Implement deterministic transitions:

- `recordDbFailure(now)`: `NORMAL -> DB_FAILOVER`; if first failure age exceeds `degradedAfterMs`, set `DEGRADED`.
- `recordDbRecovered(now)`: `DB_FAILOVER|DEGRADED -> RECOVERING`.
- `markRecoveryComplete(now)`: `RECOVERING -> NORMAL`.
- `snapshot()`: returns restrictions:
  - `NORMAL`: all allowed.
  - `DB_FAILOVER`: existing call control allowed, general config writes blocked.
  - `DEGRADED`: existing call control allowed, emergency config writes allowed, new login blocked.
  - `RECOVERING`: existing call control allowed, general config writes blocked until replay complete.

- [ ] **Step 4: Add write availability guard**

`WriteAvailabilityGuard` should reject unsafe writes:

```ts
throw new ServiceUnavailableException({
  code: 'OPERATING_MODE_RESTRICTED',
  message: 'DB 장애 대응 모드에서는 일반 설정 변경을 저장할 수 없습니다.',
  operatingMode: snapshot.mode,
});
```

- [ ] **Step 5: Wire module before AMI and Health**

Modify `apps/server/src/app.module.ts`:

```ts
import { ResilienceModule } from './modules/resilience/resilience.module';

// imports order
MonitoringModule,
RedisModule,
ResilienceModule,
EventsModule,
OutboxModule,
SessionRecoveryModule,
```

- [ ] **Step 6: Run focused tests**

Run:

```bash
cd apps/server
npm test -- operating-mode.service.spec.ts --runInBand
```

Expected: PASS.

## Task 3: Durable Event Spool

**Files:**
- Create: `apps/server/src/modules/resilience/local-spool.store.ts`
- Create: `apps/server/src/modules/resilience/durable-spool.service.ts`
- Modify: `apps/server/src/modules/ami/ami-connection.service.ts`
- Modify: `apps/server/src/modules/calls/session-engine.service.ts`
- Test: `apps/server/src/modules/resilience/durable-spool.service.spec.ts`

- [ ] **Step 1: Write failing spool fallback test**

```ts
describe('DurableSpoolService', () => {
  it('falls back to local append-only spool when Redis stream write fails', async () => {
    const redis = { getClient: () => ({ xadd: jest.fn().mockRejectedValue(new Error('redis down')) }) };
    const local = { append: jest.fn().mockResolvedValue({ path: 'tmp/spool/ami.jsonl', offset: 12 }) };
    const service = new DurableSpoolService(redis as any, local as any);

    const result = await service.appendAmiEvent({
      tenantId: '00000000-0000-0000-0000-000000000001',
      eventName: 'QueueCallerJoin',
      linkedid: '1700000000.1',
      uniqueid: '1700000000.2',
      dedupeKey: 'abc',
      payload: { Event: 'QueueCallerJoin' },
    });

    expect(result.source).toBe('LOCAL');
    expect(local.append).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Implement local JSONL store**

Use `fs.promises.open(path, 'a')`, write one JSON object per line, call `filehandle.sync()`, then close in `finally`. Store under `RESILIENCE_LOCAL_SPOOL_DIR` or `./var/spool/kcti`.

- [ ] **Step 3: Implement Redis Streams append**

Use stream names:

```ts
const streamKey = `kcti:spool:${tenantId}:ami`;
await redis.xadd(streamKey, 'MAXLEN', '~', maxLen, '*', 'payload', JSON.stringify(record));
```

Record fields:

- `entryType`: `AMI_EVENT`
- `idempotencyKey`: existing `eventFingerprint`
- `linkedid`
- `uniqueid`
- `receivedAt`
- `payload`

- [ ] **Step 4: Integrate BEFORE the leader gate**

`AmiConnectionService` 에서 정규화 직후, **리더 게이트보다 앞에서** spool 에 append 한다.
Task 0A 이후 Redis 장애 구간에는 어떤 노드도 리더가 아니므로, 게이트 뒤에 두면 그 구간 이벤트가 통째로 사라진다.

```ts
// ami-connection.service.ts — 리더 여부와 무관하게 먼저 보존한다
const spoolRecord = await this.durableSpool.appendAmiEventFromNormalized(normalized);

if (!this.leader.isLeader()) {
  // 비리더 노드는 보존만 하고 처리는 하지 않는다.
  // 같은 eventFingerprint 로 append 되므로 중복은 replay 단계에서 제거된다.
  continue;
}

await this.sipSecurity.processAmiEvent(normalized);
await this.sessionEngine.processNormalizedEvent({
  ...normalized,
  spoolEntryId: spoolRecord.spoolEntryId,
  redisStreamId: spoolRecord.redisStreamId,
});
```

**`offline_spool_entries` 는 durable store 가 아니다.** 이 테이블은 PostgreSQL 에 있으므로 DB 장애 중에는 쓸 수 없다.
실제 내구 저장소는 Redis Streams 와 로컬 JSONL 이고, 이 테이블은 **DB 가 살아 있을 때만 기록하는 감사·추적용 투영**이다.
따라서:

- `appendAmiEventFromNormalized()` 의 반환 식별자는 `redisStreamId` 또는 로컬 spool `{path, offset}` 이어야 한다.
  `spoolEntryId` 는 DB 가 가용할 때만 채워지는 optional 값이다.
- DB 장애 중 `offline_spool_entries` insert 실패는 **spool 실패로 취급하지 않는다** (경고 로그 후 계속).

- [ ] **Step 5: Mark processed via the Redis/local cursor, not the DB**

`SessionEngineService.processNormalizedEvent` 가 switch 처리까지 성공하면 `durableSpool.markProcessed(...)` 를 호출한다.
`markProcessed` 는 **Redis Stream 의 consumer-group ack 또는 로컬 spool 커서 파일**을 갱신한다. DB row 갱신은
가용할 때만 하는 부수 작업이다. DB 가 죽은 상태에서 DB 를 갱신하려 하면 markProcessed 자체가 실패한다.

DB insert 가 연결 오류로 실패하면 spool entry 를 pending 으로 남기고 operating mode 를 실패로 전환한다.
이때 **Redis dedupe 키 해제는 Task 0B 가 처리한다** — 여기서 다시 구현하지 않는다.

- [ ] **Step 6: Run tests**

Run:

```bash
cd apps/server
npm test -- durable-spool.service.spec.ts ami-connection.service.spec.ts session-engine.service.spec.ts --runInBand
```

Expected: PASS.

## Task 4: LKG Config Snapshot

**Files:**
- Create: `apps/server/src/modules/resilience/config-snapshot.service.ts`
- Create: `apps/server/src/modules/resilience/config-snapshot.service.spec.ts`
- Modify: `apps/server/src/modules/asterisk-config/asterisk-config.service.ts`
- Modify: `apps/server/src/modules/admin/admin.service.ts`

- [ ] **Step 1: Write checksum validation test**

```ts
it('rejects a tampered LKG snapshot', async () => {
  const store = fakeLocalSnapshotStore({
    checksum: 'bad',
    payload: { queues: [] },
  });
  const service = new ConfigSnapshotService(store as any, {} as any, {} as any);
  await expect(service.loadLocalLkg('tenant-a', 'queue')).rejects.toThrow('LKG_CHECKSUM_MISMATCH');
});
```

- [ ] **Step 2: Implement snapshot format**

```ts
interface ConfigSnapshot {
  tenantId: string;
  configType: 'queue' | 'routing' | 'permission' | 'feature_flag' | 'pbx';
  version: string;
  schemaVersion: number;
  generatedAt: string;
  checksum: string;
  desiredVersion: string;
  appliedVersion: string | null;
  payload: Record<string, unknown>;
}
```

- [ ] **Step 3: Implement atomic local write**

Write to `<tenantId>.<configType>.<version>.json.tmp`, fsync, then rename to `.json`. Update `latest.json` using the same temp-and-rename pattern.

- [ ] **Step 4: Integrate with PBX config changes**

When PBX-related settings are saved, create `config_versions`, publish outbox, validate renderer output, update memory/Redis, then write LKG only after validation passes.

- [ ] **Step 5: Enforce degraded write policy**

Apply `WriteAvailabilityGuard` to general setting save endpoints. Emergency settings use a separate endpoint with approver and reason fields.

- [ ] **Step 6: Run tests**

Run:

```bash
cd apps/server
npm test -- config-snapshot.service.spec.ts asterisk-config.service.spec.ts admin.service.branch-mappings.spec.ts --runInBand
```

Expected: PASS.

## Task 5: Recovery Coordinator

**Files:**
- Create: `apps/server/src/modules/resilience/recovery-coordinator.service.ts`
- Create: `apps/server/src/modules/resilience/recovery-coordinator.service.spec.ts`
- Create: `apps/server/src/modules/resilience/replay-batch.repository.ts`
- Modify: `apps/server/src/modules/ami/ami-connection.service.ts`

- [ ] **Step 1: Write replay idempotency test**

> **주의 — Task 0B 계약.** 이 단계의 초안에는
> `it('skips raw events already stored by fingerprint during replay')` 테스트가 있었으나 **폐기했다.**
> raw 이벤트 저장과 세션 상태 전이는 서로 다른 두 번의 쓰기이므로, raw 행이 있다고 해서 상태 전이가
> 반영됐다는 보장이 없다. replay 는 `processNormalizedEvent` 를 **건너뛰지 않고** `{ replay: true }` 로
> 호출해야 한다. 멱등성은 `rawAmiEvents` unique(P2002 무시) + `callSessions` upsert + `SESSION_PRECEDENCE`
> 역행 가드가 보장한다.

```ts
it('replay 는 raw 중복 여부와 무관하게 replay 플래그로 세션 엔진을 호출한다', async () => {
  const sessionEngine = { processNormalizedEvent: jest.fn().mockResolvedValue(undefined) };
  const prisma = {
    rawAmiEvents: { findUnique: jest.fn().mockResolvedValue({ eventId: 'existing' }) },
    replayBatches: { update: jest.fn().mockResolvedValue({}) },
  };
  const coordinator = new RecoveryCoordinatorService(
    prisma as any, sessionEngine as any, {} as any, {} as any,
  );

  await coordinator.replayOne({
    tenantId: 'tenant-a',
    eventFingerprint: 'fp-1',
    payload: { eventName: 'QueueCallerJoin', linkedid: '1700000000.1' },
  } as any);

  expect(sessionEngine.processNormalizedEvent).toHaveBeenCalledWith(
    expect.objectContaining({ linkedid: '1700000000.1' }),
    { replay: true },
  );
});

it('같은 spool entry 를 두 번 replay 해도 세션 상태가 어긋나지 않는다', async () => {
  // 재실행 안전성: 같은 entry 를 2회 흘려도 성공 카운트만 증가하고 예외가 없어야 한다
  const sessionEngine = { processNormalizedEvent: jest.fn().mockResolvedValue(undefined) };
  const coordinator = new RecoveryCoordinatorService(
    { rawAmiEvents: { findUnique: jest.fn() }, replayBatches: { update: jest.fn() } } as any,
    sessionEngine as any, {} as any, {} as any,
  );
  const entry = { tenantId: 'tenant-a', eventFingerprint: 'fp-1', payload: { linkedid: 'x' } } as any;

  await coordinator.replayOne(entry);
  await expect(coordinator.replayOne(entry)).resolves.not.toThrow();
});
```

- [ ] **Step 2: Implement recovery sequence**

Implement:

1. `startRecovery(tenantId)`
2. Check DB read/write with `SELECT 1`
3. Load latest LKG and compare `desiredVersion`/`appliedVersion`
4. Query PBX current channels and queues through `sendActionWithResponse`
5. Create `replay_batches`
6. Replay pending spool entries by `receivedAt` — 각 건은
   `sessionEngine.processNormalizedEvent(payload, { replay: true })` 로 호출한다 (Task 0B).
   Redis Streams 와 로컬 JSONL 양쪽을 모두 훑고, `eventFingerprint` 로 합집합 중복을 제거한다.
7. Rebuild open sessions by `linkedid`
8. Mark conflicts for manual review
9. Call `OperatingModeService.markRecoveryComplete()` when queues are empty

- [ ] **Step 3: Add PBX state queries**

Use existing AMI action support:

```ts
await ami.sendActionWithResponse({ Action: 'CoreShowChannels' }, { eventList: true, timeoutMs: 8000 });
await ami.sendActionWithResponse({ Action: 'QueueStatus' }, { eventList: true, timeoutMs: 8000 });
```

- [ ] **Step 4: Persist audit events**

Every recovery phase writes `recovery_audit_log` with `operatingMode`, message, and structured details.

- [ ] **Step 5: Run tests**

Run:

```bash
cd apps/server
npm test -- recovery-coordinator.service.spec.ts session-engine.service.spec.ts --runInBand
```

Expected: PASS.

## Task 6: Health and Metrics

**Files:**
- Modify: `apps/server/src/modules/health/health-summary.service.ts`
- Modify: `apps/server/src/modules/health/dto/health-response.dto.ts`
- Modify: `apps/server/src/modules/monitoring/metrics.service.ts`
- Test: `apps/server/src/modules/health/health-summary.service.spec.ts`
- Test: `apps/server/src/modules/monitoring/metrics.service.spec.ts`

- [ ] **Step 1: Add DTO fields**

Extend `HealthResponseDto` with:

```ts
operatingMode!: OperatingMode;
dataFreshness!: OperatingModeSnapshot['dataFreshness'];
restrictions!: OperatingModeSnapshot['restrictions'];
resilience!: {
  lkgVersion: string | null;
  lkgAgeSeconds: number | null;
  offlineEventQueueDepth: number;
  offlineCommandQueueDepth: number;
  configVersionMismatch: number;
  dbRole: 'primary' | 'standby' | 'unknown';
  replicationLagSeconds: number | null;
  walArchiveAgeSeconds: number | null;
  backupLastSuccessTimestamp: string | null;
};
```

- [ ] **Step 2: Add health summary fields**

Read operating snapshot from `OperatingModeService`, queue depth from `DurableSpoolService`, and DB role via:

```sql
SELECT CASE WHEN pg_is_in_recovery() THEN 'standby' ELSE 'primary' END AS role;
```

- [ ] **Step 3: Add Prometheus gauges**

Use current `cti_` prefix convention:

- `cti_operating_mode`
- `cti_config_snapshot_age_seconds`
- `cti_config_version_mismatch`
- `cti_offline_event_queue_depth`
- `cti_offline_command_queue_depth`
- `cti_db_replication_lag_seconds`
- `cti_wal_archive_age_seconds`
- `cti_backup_last_success_timestamp`

- [ ] **Step 4: Run tests**

Run:

```bash
cd apps/server
npm test -- health-summary.service.spec.ts metrics.service.spec.ts --runInBand
```

Expected: PASS.

## Task 7: Admin UI Degraded Operation

**Files:**
- Create: `apps/admin/src/features/resilience/useOperatingMode.ts`
- Modify: `apps/admin/src/features/monitoring/types/health.ts`
- Modify: `apps/admin/src/pages/MonitoringPage.tsx`
- Modify: `apps/admin/src/components/AppLayout.tsx`
- Modify: setting pages that perform general writes:
  - `apps/admin/src/features/system-settings/SystemSettingsPage.tsx`
  - `apps/admin/src/features/queue-settings/QueueSettingsPage.tsx`
  - `apps/admin/src/features/branch-settings/BranchSettingsPage.tsx`
  - `apps/admin/src/features/asterisk-config/components/*.tsx`

- [ ] **Step 1: Add operating mode hook**

```ts
export function useOperatingMode() {
  const { data } = useHealthData({ intervalMs: 10_000 });
  return {
    mode: data?.operatingMode ?? 'NORMAL',
    restrictions: data?.restrictions,
    dataFreshness: data?.dataFreshness,
    isRestricted: data?.operatingMode === 'DEGRADED' || data?.operatingMode === 'RECOVERING',
  };
}
```

- [ ] **Step 2: Add global banner**

In `AppLayout`, render an Ant Design `Alert` above `Content` when mode is not `NORMAL`:

```tsx
{mode !== 'NORMAL' ? (
  <Alert
    type={mode === 'DB_FAILOVER' ? 'warning' : 'error'}
    showIcon
    message={`DB 장애 대응 모드: ${mode}`}
    description="일반 설정 변경은 제한되며 기존 통화 처리를 우선 유지합니다."
  />
) : null}
```

- [ ] **Step 3: Disable unsafe save buttons**

For setting pages, derive:

```ts
const disableGeneralWrites = restrictions?.allowGeneralConfigWrites === false;
```

Apply to save buttons and show tooltip text:

```tsx
disabled={disableGeneralWrites}
```

- [ ] **Step 4: Extend monitoring page**

Add cards for operating mode, LKG age, offline queue depth, version mismatch, WAL age, backup timestamp.

- [ ] **Step 5: Build admin**

Run:

```bash
cd apps/admin
npm run build
```

Expected: PASS.

## Task 8: PostgreSQL HA and Backup Runbook

**Files:**
- Create: `infra/postgres/README.md`
- Create: `infra/postgres/patroni.sample.yml`
- Create: `infra/postgres/haproxy.sample.cfg`
- Create: `infra/postgres/pgbackrest.sample.conf`

- [ ] **Step 1: Document supported topology**

Write the initial supported topology:

- PostgreSQL primary: 1
- Synchronous standby: 1
- DCS witness: 3 voters total, separated from a single DB failure domain
- HAProxy/VIP writer endpoint: `db-writer.internal:5432`
- Remote DR standby: P2 optional

- [ ] **Step 2: Add sample Patroni config**

Use environment variables for node-specific values:

```yaml
scope: kcti-postgres
name: ${PATRONI_NODE_NAME}
restapi:
  listen: 0.0.0.0:8008
  connect_address: ${PATRONI_REST_ADDRESS}
postgresql:
  listen: 0.0.0.0:5432
  connect_address: ${POSTGRES_CONNECT_ADDRESS}
  data_dir: /var/lib/postgresql/16/main
  authentication:
    replication:
      username: ${REPLICATION_USER}
      password: ${REPLICATION_PASSWORD}
    superuser:
      username: ${POSTGRES_SUPERUSER}
      password: ${POSTGRES_SUPERUSER_PASSWORD}
  parameters:
    synchronous_commit: 'on'
    wal_level: replica
    archive_mode: 'on'
    archive_command: 'pgbackrest --stanza=kcti archive-push %p'
```

- [ ] **Step 3: Add HAProxy writer route**

```cfg
listen postgres-writer
  bind *:5432
  option httpchk GET /primary
  default-server inter 3s fall 3 rise 2 on-marked-down shutdown-sessions
  server db1 ${DB1_HOST}:5432 check port 8008
  server db2 ${DB2_HOST}:5432 check port 8008
```

- [ ] **Step 4: Add pgBackRest sample**

```ini
[global]
repo1-path=/backup/pgbackrest
repo1-retention-full=5
repo1-retention-diff=35
start-fast=y
process-max=4

[kcti]
pg1-path=/var/lib/postgresql/16/main
```

- [ ] **Step 5: Add drill commands**

Include commands for:

- Primary process stop and automatic promotion check
- HAProxy writer endpoint check
- DB unavailable degraded mode check
- PITR to isolated server
- Backup integrity verification

## Task 9: End-to-End Acceptance

**Files:**
- Create: `docs/operations/2026-08-08-db-ha-resilience-runbook.md`
- Create: `docs/qa/2026-08-08-db-ha-resilience-acceptance-report-template.md`

- [ ] **Step 1: Create acceptance report template**

Include rows for the source document acceptance tests:

- Primary 강제 종료
- Primary 네트워크 격리
- DB 전체 접근 불가
- DB+Redis 동시 장애
- Middleware 재시작
- 유효 LKG 없이 부팅
- AMI 이벤트 중복 수신
- 대량 이벤트 재처리
- 설정 적용 중 DB 장애
- 긴급 설정 적용
- PITR
- 백업 손상

- [ ] **Step 2: Run full verification**

Run:

```bash
cd apps/server
npm test -- --runInBand
npm run build
cd ../admin
npm run build
```

Expected: all tests and builds pass.

- [ ] **Step 3: Record completion evidence**

Update `docs/qa/2026-08-08-db-ha-resilience-acceptance-report-template.md` with:

- command output summary
- failure injection date/time
- observed RPO/RTO
- spool queue before/after
- replay batch id
- LKG version/checksum
- approver for NORMAL transition

## Execution Notes

### 실행 순서 (Task 0A → 0B → 1 …)

**Task 0A 와 0B 를 먼저 끝낸다.** 둘 다 신규 기능이 아니라 **기존 코드의 결함 수정**이며, 이 둘이 안 고쳐지면
Task 3~5 가 테스트를 통과해도 실제 장애에서 동작하지 않는다.

| 선행 | 고치는 것 | 안 고치면 |
|---|---|---|
| Task 0A | `ami-leader-election.service.ts` 의 Redis 장애 내성 | Redis 장애 시 unhandled rejection + 리더십 고착. Task 9 의 `DB+Redis 동시 장애`·`Middleware 재시작` 인수 테스트가 Task 3 로직에 닿기 전에 실패 |
| Task 0B | `session-engine.service.ts` 의 dedupe 키 수명 | 장애 중 선점된 dedupe 키가 6시간 남아 replay 를 전량 차단. Task 3 의 Durable Event Spool 이 무의미해짐 |

두 태스크는 서로 독립이라 병렬로 진행해도 된다. 다만 **Task 3 은 두 태스크가 모두 끝난 뒤에 시작한다** —
Task 3 Step 4(리더 게이트 앞 spool)는 0A 의 fail-safe 동작을, Step 5 는 0B 의 dedupe 키 해제를 전제로 한다.

- Keep remote DR out of P0/P1 unless the customer confirms a second center and link characteristics.
- Keep user-facing text as `PBX`; use `Asterisk` only in code identifiers, AMI action names, and existing paths.
- Do not queue general configuration edits during DB outage. Only emergency changes with approval should be persisted locally and later reviewed.
- Do not claim HA readiness until failover, replay, and PITR drills are run and recorded.
