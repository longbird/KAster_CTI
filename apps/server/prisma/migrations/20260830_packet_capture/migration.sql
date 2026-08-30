-- 관리자 패킷 캡처: 마스터 토글 + 작업 이력 + 접근 감사
-- 토글 기본값은 false. 캡처 파일에는 통화 음성(RTP)이 담기므로 명시적으로 켜야 한다.

ALTER TABLE "tenantSystemSettings"
  ADD COLUMN "packetCaptureEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "packetCaptureJobs" (
  "packetCaptureJobId" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "nodeId" VARCHAR(64) NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'RUNNING',
  "requestedBy" UUID,
  "interfaceName" VARCHAR(64) NOT NULL,
  "captureFilter" TEXT NOT NULL DEFAULT '',
  "durationSeconds" INTEGER NOT NULL,
  "startedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMPTZ(6),
  "filePath" TEXT,
  "encryptedFilePath" TEXT,
  "encryptionStatus" VARCHAR(16) NOT NULL DEFAULT 'NONE',
  "fileSizeBytes" BIGINT,
  "packetCount" INTEGER,
  "checksumSha256" VARCHAR(64),
  "retentionUntil" TIMESTAMPTZ(6),
  "failureReason" TEXT,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "packetCaptureJobs_pkey" PRIMARY KEY ("packetCaptureJobId")
);

CREATE INDEX "packetCaptureJobs_tenantId_startedAt_idx"
  ON "packetCaptureJobs" ("tenantId", "startedAt" DESC);
CREATE INDEX "packetCaptureJobs_tenantId_status_idx"
  ON "packetCaptureJobs" ("tenantId", "status");

CREATE TABLE "packetCaptureAccessAuditLogs" (
  "auditLogId" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "packetCaptureJobId" UUID NOT NULL,
  "agentId" UUID,
  "userRole" VARCHAR(32),
  "action" VARCHAR(32) NOT NULL,
  "clientIp" VARCHAR(64),
  "userAgent" VARCHAR(255),
  "success" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "packetCaptureAccessAuditLogs_pkey" PRIMARY KEY ("auditLogId")
);

CREATE INDEX "packetCaptureAccessAuditLogs_tenantId_createdAt_idx"
  ON "packetCaptureAccessAuditLogs" ("tenantId", "createdAt" DESC);
CREATE INDEX "packetCaptureAccessAuditLogs_tenantId_job_createdAt_idx"
  ON "packetCaptureAccessAuditLogs" ("tenantId", "packetCaptureJobId", "createdAt" DESC);
