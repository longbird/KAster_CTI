ALTER TABLE "tenantSystemSettings"
  ADD COLUMN IF NOT EXISTS "allowDirectSipDial" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "allowedOutboundCallerIds" TEXT,
  ADD COLUMN IF NOT EXISTS "defaultOutboundCallerId" VARCHAR(32);
