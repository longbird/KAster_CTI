ALTER TABLE "tenantSystemSettings"
ADD COLUMN IF NOT EXISTS "defaultSipPassword" TEXT;
