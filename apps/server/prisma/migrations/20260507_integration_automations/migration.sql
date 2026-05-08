-- 외부 연동 자동화 등록 (BlueSky DlgVixActionPhone / DlgVixActionSms 등가)
-- type 별 config Json 으로 다양한 통합(VIX, Webhook, Slack 등) 보관.

CREATE TABLE "integrationAutomations" (
  "integrationAutomationId" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "type" VARCHAR(32) NOT NULL,
  "name" VARCHAR(128) NOT NULL,
  "description" TEXT,
  "config" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "lastTriggeredAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "updatedById" UUID,
  CONSTRAINT "integrationAutomations_pkey" PRIMARY KEY ("integrationAutomationId")
);

CREATE INDEX "integrationAutomations_tenantId_type_enabled_idx"
  ON "integrationAutomations" ("tenantId", "type", "enabled");

CREATE INDEX "integrationAutomations_tenantId_name_idx"
  ON "integrationAutomations" ("tenantId", "name");

ALTER TABLE "integrationAutomations"
  ADD CONSTRAINT "integrationAutomations_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
