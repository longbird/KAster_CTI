-- The column-only system setting migrations sort before the table creation
-- migration. Keep those early migrations harmless on fresh databases, then add
-- the columns here once tenantSystemSettings exists.

ALTER TABLE "tenantSystemSettings"
  ADD COLUMN IF NOT EXISTS "defaultSipPassword" TEXT,
  ADD COLUMN IF NOT EXISTS "allowDirectSipDial" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "allowedOutboundCallerIds" TEXT,
  ADD COLUMN IF NOT EXISTS "defaultOutboundCallerId" VARCHAR(32),
  ADD COLUMN IF NOT EXISTS "sipRegisterPort" INTEGER NOT NULL DEFAULT 5060;
