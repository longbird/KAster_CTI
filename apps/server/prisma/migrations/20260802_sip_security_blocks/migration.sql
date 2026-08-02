CREATE TABLE IF NOT EXISTS "sipSecurityBlocks" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "blockType" VARCHAR(16) NOT NULL,
    "blockKey" VARCHAR(96) NOT NULL,
    "value" VARCHAR(64) NOT NULL,
    "reason" VARCHAR(64) NOT NULL,
    "sourceIp" VARCHAR(64),
    "sourceNumber" VARCHAR(64),
    "targetNumber" VARCHAR(64),
    "hitCount" INTEGER NOT NULL DEFAULT 0,
    "blockedUntil" TIMESTAMPTZ(6) NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sipSecurityBlocks_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "tenants"("tenantId") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "sipSecurityBlocks_tenantId_blockKey_key"
    ON "sipSecurityBlocks"("tenantId", "blockKey");

CREATE INDEX IF NOT EXISTS "sipSecurityBlocks_tenantId_blockType_blockedUntil_idx"
    ON "sipSecurityBlocks"("tenantId", "blockType", "blockedUntil");

CREATE INDEX IF NOT EXISTS "sipSecurityBlocks_tenantId_value_idx"
    ON "sipSecurityBlocks"("tenantId", "value");
