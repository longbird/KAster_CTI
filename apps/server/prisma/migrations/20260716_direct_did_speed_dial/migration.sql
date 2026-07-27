ALTER TABLE "AsteriskDid"
  ADD COLUMN IF NOT EXISTS "directExtension" VARCHAR(16);

ALTER TABLE "AsteriskDid"
  DROP CONSTRAINT IF EXISTS "asterisk_did_xor_check";

ALTER TABLE "AsteriskDid"
  ADD CONSTRAINT "asterisk_did_route_one_check"
  CHECK (
    (
      CASE WHEN "ivrMenuId" IS NULL THEN 0 ELSE 1 END
      + CASE WHEN "directQueue" IS NULL THEN 0 ELSE 1 END
      + CASE WHEN "directExtension" IS NULL THEN 0 ELSE 1 END
    ) = 1
  );

CREATE TABLE IF NOT EXISTS "AsteriskSpeedDial" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "code" VARCHAR(16) NOT NULL,
  "targetNumber" VARCHAR(32) NOT NULL,
  "displayName" VARCHAR(128),
  "description" VARCHAR(255),
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "AsteriskSpeedDial_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("tenantId") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "AsteriskSpeedDial_tenantId_code_key"
  ON "AsteriskSpeedDial"("tenantId", "code");

CREATE INDEX IF NOT EXISTS "AsteriskSpeedDial_tenantId_enabled_idx"
  ON "AsteriskSpeedDial"("tenantId", "enabled");
