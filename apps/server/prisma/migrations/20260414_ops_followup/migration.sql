-- conv 44 + share 69de045b 의 운영 후속 4종 마이그레이션
--   1) raw_ami_events 에 event_fingerprint + unique index (dedupe 최종 방어선)
--   2) attended_transfer_candidates 테이블 (Transfer Detector 상태머신)
--   3) refresh_tokens 테이블 (SHA-256 해시만 저장)

-- 1) Fingerprint dedupe ----------------------------------------------------
ALTER TABLE "rawAmiEvents"
  ADD COLUMN "eventFingerprint" VARCHAR(64) NOT NULL DEFAULT '';

-- 기존 행이 이미 있는 경우 중복 제거를 위해 uuid 로 채워 unique 충돌 회피.
UPDATE "rawAmiEvents"
  SET "eventFingerprint" = "eventId"::text
  WHERE "eventFingerprint" = '';

ALTER TABLE "rawAmiEvents"
  ALTER COLUMN "eventFingerprint" DROP DEFAULT;

CREATE UNIQUE INDEX "uq_raw_ami_fingerprint"
  ON "rawAmiEvents"("tenantId", "eventFingerprint");

-- 2) Attended transfer candidates ------------------------------------------
CREATE TABLE "attendedTransferCandidates" (
  "candidateId"      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"         UUID NOT NULL,
  "linkedid"         VARCHAR(32) NOT NULL,
  "fromAgentId"      UUID,
  "fromExtension"    VARCHAR(16),
  "toExtension"      VARCHAR(32),
  "consultUniqueid"  VARCHAR(32),
  "targetUniqueid"   VARCHAR(32),
  "phase"            VARCHAR(32) NOT NULL DEFAULT 'REQUESTED',
  "requestedAt"      TIMESTAMPTZ(6) NOT NULL,
  "completedAt"      TIMESTAMPTZ(6),
  "expiredAt"        TIMESTAMPTZ(6),
  "createdAt"        TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updatedAt"        TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "fk_atc_tenant" FOREIGN KEY ("tenantId") REFERENCES "tenants"("tenantId")
);

CREATE INDEX "idx_atc_tenant_linkedid" ON "attendedTransferCandidates"("tenantId", "linkedid");
CREATE INDEX "idx_atc_phase" ON "attendedTransferCandidates"("phase", "requestedAt");

-- 3) Refresh tokens --------------------------------------------------------
CREATE TABLE "refreshTokens" (
  "refreshTokenId" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"       UUID NOT NULL,
  "agentId"        UUID NOT NULL,
  "tokenHash"      VARCHAR(64) NOT NULL UNIQUE,
  "issuedAt"       TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "expiresAt"      TIMESTAMPTZ(6) NOT NULL,
  "revokedAt"      TIMESTAMPTZ(6),
  "userAgent"      VARCHAR(255),
  "ipAddress"      VARCHAR(64),
  CONSTRAINT "fk_refresh_tenant" FOREIGN KEY ("tenantId") REFERENCES "tenants"("tenantId"),
  CONSTRAINT "fk_refresh_agent"  FOREIGN KEY ("agentId")  REFERENCES "agents"("agentId") ON DELETE CASCADE
);

CREATE INDEX "idx_refresh_agent_revoked" ON "refreshTokens"("agentId", "revokedAt");
CREATE INDEX "idx_refresh_expires" ON "refreshTokens"("expiresAt");
