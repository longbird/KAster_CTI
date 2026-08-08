-- DB 장애 대응 (HA resilience) 스키마
--
-- 운영 테이블 4개는 tenants FK + ON DELETE CASCADE (recordingFinalizeJobs 관례).
-- 감사 테이블 2개는 FK 없이 plain UUID 컬럼 (callRecordingAccessAuditLogs 관례) —
-- 감사 기록은 참조 대상(상담원/테넌트)보다 오래 살아남아야 한다.
--
-- "version" 은 BIGINT 가 아니라 INTEGER 다. Prisma BigInt 는 JSON.stringify 에서
-- TypeError 를 던져 ResponseTransformInterceptor 를 깨뜨리는데, 설정 버전 카운터에
-- 21억은 충분하고도 남는다.

CREATE TABLE IF NOT EXISTS "configVersions" (
  "configVersionId"  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"         UUID NOT NULL,
  "configType"       VARCHAR(64) NOT NULL,
  "version"          INTEGER NOT NULL,
  "schemaVersion"    INTEGER NOT NULL DEFAULT 1,
  "payload"          JSONB NOT NULL,
  "checksum"         VARCHAR(64) NOT NULL,
  "generatedAt"      TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "createdByAgentId" UUID,
  "createdAt"        TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  CONSTRAINT "configVersions_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("tenantId") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "configVersions_tenantId_configType_version_key"
  ON "configVersions" ("tenantId", "configType", "version");
CREATE INDEX IF NOT EXISTS "configVersions_latest_idx"
  ON "configVersions" ("tenantId", "configType", "version" DESC);

CREATE TABLE IF NOT EXISTS "configApplyStatus" (
  "applyStatusId"    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"         UUID NOT NULL,
  "nodeId"           VARCHAR(128) NOT NULL,
  "configType"       VARCHAR(64) NOT NULL,
  "desiredVersion"   INTEGER NOT NULL,
  "appliedVersion"   INTEGER,
  "appliedChecksum"  VARCHAR(64),
  "status"           VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  "lastError"        TEXT,
  "appliedAt"        TIMESTAMPTZ(6),
  "updatedAt"        TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  CONSTRAINT "configApplyStatus_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("tenantId") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "configApplyStatus_tenantId_nodeId_configType_key"
  ON "configApplyStatus" ("tenantId", "nodeId", "configType");
CREATE INDEX IF NOT EXISTS "configApplyStatus_node_idx"
  ON "configApplyStatus" ("nodeId", "status");

-- 긴급 설정 변경 감사. 승인자/요청자는 삭제돼도 기록이 남아야 하므로 FK 를 걸지 않는다.
CREATE TABLE IF NOT EXISTS "configEmergencyChanges" (
  "emergencyChangeId"  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"           UUID NOT NULL,
  "configType"         VARCHAR(64) NOT NULL,
  "requestedByAgentId" UUID NOT NULL,
  "approvedByAgentId"  UUID NOT NULL,
  "reason"             TEXT NOT NULL,
  "beforePayload"      JSONB NOT NULL,
  "afterPayload"       JSONB NOT NULL,
  "appliedVersion"     INTEGER NOT NULL,
  "mergeStatus"        VARCHAR(32) NOT NULL DEFAULT 'PENDING_REVIEW',
  "createdAt"          TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "reviewedAt"         TIMESTAMPTZ(6)
);

CREATE INDEX IF NOT EXISTS "configEmergencyChanges_tenant_idx"
  ON "configEmergencyChanges" ("tenantId", "mergeStatus", "createdAt" DESC);

-- DB 가용 시에만 기록하는 spool 투영. 내구 저장소는 Redis Streams + 로컬 JSONL 이며
-- 이 테이블은 복구 후 감사/추적용이다. 여기 insert 가 실패해도 spool 실패가 아니다.
CREATE TABLE IF NOT EXISTS "offlineSpoolEntries" (
  "spoolEntryId"    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        UUID NOT NULL,
  "entryType"       VARCHAR(32) NOT NULL,
  "idempotencyKey"  VARCHAR(128) NOT NULL,
  "linkedid"        VARCHAR(32),
  "uniqueid"        VARCHAR(32),
  "payload"         JSONB NOT NULL,
  "source"          VARCHAR(32) NOT NULL,
  "redisStreamId"   VARCHAR(64),
  "localSpoolPath"  TEXT,
  "status"          VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  "receivedAt"      TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "processedAt"     TIMESTAMPTZ(6),
  "lastError"       TEXT,
  CONSTRAINT "offlineSpoolEntries_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("tenantId") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "offlineSpoolEntries_tenantId_entryType_idempotencyKey_key"
  ON "offlineSpoolEntries" ("tenantId", "entryType", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "offlineSpoolEntries_pending_idx"
  ON "offlineSpoolEntries" ("status", "receivedAt");

CREATE TABLE IF NOT EXISTS "replayBatches" (
  "replayBatchId"    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"         UUID NOT NULL,
  "replayType"       VARCHAR(32) NOT NULL,
  "status"           VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  "rangeStart"       TIMESTAMPTZ(6),
  "rangeEnd"         TIMESTAMPTZ(6),
  "linkedid"         VARCHAR(32),
  "cursor"           JSONB NOT NULL DEFAULT '{}'::jsonb,
  "totalCount"       INTEGER NOT NULL DEFAULT 0,
  "successCount"     INTEGER NOT NULL DEFAULT 0,
  "failureCount"     INTEGER NOT NULL DEFAULT 0,
  "startedAt"        TIMESTAMPTZ(6),
  "finishedAt"       TIMESTAMPTZ(6),
  "createdByAgentId" UUID,
  "createdAt"        TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "updatedAt"        TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  CONSTRAINT "replayBatches_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("tenantId") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "replayBatches_status_idx"
  ON "replayBatches" ("status", "createdAt");
CREATE INDEX IF NOT EXISTS "replayBatches_tenant_idx"
  ON "replayBatches" ("tenantId", "createdAt" DESC);

-- 복구 단계 감사 로그. 감사 기록이므로 FK 를 걸지 않는다.
CREATE TABLE IF NOT EXISTS "recoveryAuditLog" (
  "recoveryAuditId" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        UUID NOT NULL,
  "eventType"       VARCHAR(64) NOT NULL,
  "operatingMode"   VARCHAR(32) NOT NULL,
  "message"         TEXT NOT NULL,
  "details"         JSONB NOT NULL DEFAULT '{}'::jsonb,
  "actorAgentId"    UUID,
  "replayBatchId"   UUID,
  "createdAt"       TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "recoveryAuditLog_tenant_idx"
  ON "recoveryAuditLog" ("tenantId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "recoveryAuditLog_batch_idx"
  ON "recoveryAuditLog" ("replayBatchId", "createdAt");
