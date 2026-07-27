CREATE TABLE IF NOT EXISTS "promptGenerationJobs" (
  "promptGenerationJobId" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "promptId" UUID,
  "promptKey" VARCHAR(128) NOT NULL,
  "displayName" VARCHAR(128) NOT NULL,
  "fileName" VARCHAR(255) NOT NULL,
  "sourceText" TEXT NOT NULL,
  "provider" VARCHAR(32) NOT NULL DEFAULT 'local-wav',
  "voice" VARCHAR(64),
  "language" VARCHAR(16) NOT NULL DEFAULT 'ko-KR',
  "format" VARCHAR(16) NOT NULL DEFAULT 'wav',
  "status" VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  "errorMessage" TEXT,
  "generatedBytes" INTEGER,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "completedAt" TIMESTAMPTZ(6),
  CONSTRAINT "promptGenerationJobs_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("tenantId") ON DELETE CASCADE,
  CONSTRAINT "promptGenerationJobs_promptId_fkey"
    FOREIGN KEY ("promptId") REFERENCES "AsteriskPrompt"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "promptGenerationJobs_tenantId_status_createdAt_idx"
  ON "promptGenerationJobs"("tenantId", "status", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "promptGenerationJobs_tenantId_promptKey_idx"
  ON "promptGenerationJobs"("tenantId", "promptKey");
