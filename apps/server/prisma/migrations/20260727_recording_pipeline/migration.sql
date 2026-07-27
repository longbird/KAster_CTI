ALTER TABLE "callSessions"
  ADD COLUMN IF NOT EXISTS "recordingFinalizationStatus" VARCHAR(32) NOT NULL DEFAULT 'NOT_REQUESTED',
  ADD COLUMN IF NOT EXISTS "recordingFinalizedAt" TIMESTAMPTZ(6);

ALTER TABLE "callRecordings"
  ADD COLUMN IF NOT EXISTS "recordingStatus" VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS "encryptionStatus" VARCHAR(32) NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS "encryptedFilePath" TEXT,
  ADD COLUMN IF NOT EXISTS "keyRef" VARCHAR(128),
  ADD COLUMN IF NOT EXISTS "retentionUntil" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "finalizedAt" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "failureReason" TEXT,
  ADD COLUMN IF NOT EXISTS "speakerSeparationStatus" VARCHAR(32) NOT NULL DEFAULT 'NOT_REQUESTED',
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS "recordingFinalizeJobs" (
  "recordingFinalizeJobId" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "callId" UUID NOT NULL,
  "linkedid" VARCHAR(32) NOT NULL,
  "recFile" TEXT NOT NULL,
  "status" VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "lastError" TEXT,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  CONSTRAINT "recordingFinalizeJobs_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("tenantId") ON DELETE CASCADE,
  CONSTRAINT "recordingFinalizeJobs_callId_fkey"
    FOREIGN KEY ("callId") REFERENCES "callSessions"("callId") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "recordingFinalizeJobs_tenantId_linkedid_recFile_key"
  ON "recordingFinalizeJobs"("tenantId", "linkedid", "recFile");

CREATE INDEX IF NOT EXISTS "recordingFinalizeJobs_tenantId_status_nextAttemptAt_idx"
  ON "recordingFinalizeJobs"("tenantId", "status", "nextAttemptAt");

CREATE INDEX IF NOT EXISTS "recordingFinalizeJobs_tenantId_callId_idx"
  ON "recordingFinalizeJobs"("tenantId", "callId");

CREATE TABLE IF NOT EXISTS "recordingRetentionPolicies" (
  "recordingRetentionPolicyId" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "retentionDays" INTEGER NOT NULL DEFAULT 1095,
  "deleteMode" VARCHAR(32) NOT NULL DEFAULT 'DAILY_SWEEP',
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  CONSTRAINT "recordingRetentionPolicies_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("tenantId") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "recordingRetentionPolicies_tenantId_key"
  ON "recordingRetentionPolicies"("tenantId");
