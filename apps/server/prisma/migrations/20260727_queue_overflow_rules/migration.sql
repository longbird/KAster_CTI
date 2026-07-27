CREATE TABLE IF NOT EXISTS "queueOverflowRules" (
  "queueOverflowRuleId" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "queueId" UUID NOT NULL,
  "triggerMode" VARCHAR(32) NOT NULL DEFAULT 'AFTER_WAIT',
  "waitSeconds" INTEGER NOT NULL DEFAULT 25,
  "targetType" VARCHAR(32) NOT NULL,
  "targetValue" VARCHAR(128) NOT NULL,
  "resultCode" VARCHAR(64) NOT NULL DEFAULT 'AI_OVERFLOW',
  "priority" INTEGER NOT NULL DEFAULT 100,
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "queueOverflowRules_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("tenantId") ON DELETE CASCADE,
  CONSTRAINT "queueOverflowRules_queueId_fkey"
    FOREIGN KEY ("queueId") REFERENCES "queues"("queueId") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "queueOverflowRules_tenantId_enabled_idx"
  ON "queueOverflowRules"("tenantId", "enabled");

CREATE INDEX IF NOT EXISTS "queueOverflowRules_tenantId_queueId_idx"
  ON "queueOverflowRules"("tenantId", "queueId");

CREATE INDEX IF NOT EXISTS "queueOverflowRules_tenantId_priority_idx"
  ON "queueOverflowRules"("tenantId", "priority");
