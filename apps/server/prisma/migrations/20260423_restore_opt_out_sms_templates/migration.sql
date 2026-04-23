CREATE TYPE "SmsTemplateCategory" AS ENUM (
  'OPT_OUT_080',
  'GENERAL_NOTICE',
  'RESERVATION_ALERT'
);

ALTER TABLE "AsteriskBlocklistEntry"
  ADD COLUMN "normalizedPhoneNumber" VARCHAR(32),
  ADD COLUMN "requesterPhoneNumber" VARCHAR(32),
  ADD COLUMN "normalizedRequesterPhone" VARCHAR(32),
  ADD COLUMN "sourceType" VARCHAR(32),
  ADD COLUMN "branchId" UUID,
  ADD COLUMN "entryDid" VARCHAR(32);

CREATE TABLE "tenantSmsTemplate" (
  "templateId" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "templateName" VARCHAR(120) NOT NULL,
  "category" "SmsTemplateCategory" NOT NULL,
  "content" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  CONSTRAINT "tenantSmsTemplate_tenantId_fkey"
    FOREIGN KEY ("tenantId")
    REFERENCES "tenants" ("tenantId")
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "tenantSmsTemplate_tenantId_templateName_key"
  ON "tenantSmsTemplate" ("tenantId", "templateName");

CREATE INDEX "tenantSmsTemplate_tenantId_category_idx"
  ON "tenantSmsTemplate" ("tenantId", "category");
