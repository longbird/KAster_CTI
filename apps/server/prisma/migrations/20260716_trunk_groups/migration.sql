CREATE TABLE IF NOT EXISTS "AsteriskTrunkGroup" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "name" VARCHAR(128) NOT NULL,
  "description" VARCHAR(255),
  "strategy" VARCHAR(32) NOT NULL DEFAULT 'PRIORITY',
  "isDefault" BOOLEAN NOT NULL DEFAULT FALSE,
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "AsteriskTrunkGroup_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("tenantId") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "AsteriskTrunkGroup_tenantId_name_key"
  ON "AsteriskTrunkGroup"("tenantId", "name");

CREATE INDEX IF NOT EXISTS "AsteriskTrunkGroup_tenantId_enabled_idx"
  ON "AsteriskTrunkGroup"("tenantId", "enabled");

CREATE INDEX IF NOT EXISTS "AsteriskTrunkGroup_tenantId_isDefault_idx"
  ON "AsteriskTrunkGroup"("tenantId", "isDefault");

CREATE UNIQUE INDEX IF NOT EXISTS "AsteriskTrunkGroup_one_default_per_tenant"
  ON "AsteriskTrunkGroup"("tenantId")
  WHERE "isDefault" = TRUE;

CREATE TABLE IF NOT EXISTS "AsteriskTrunkGroupMember" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "groupId" UUID NOT NULL,
  "trunkId" UUID NOT NULL,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "AsteriskTrunkGroupMember_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("tenantId") ON DELETE CASCADE,
  CONSTRAINT "AsteriskTrunkGroupMember_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "AsteriskTrunkGroup"("id") ON DELETE CASCADE,
  CONSTRAINT "AsteriskTrunkGroupMember_trunkId_fkey"
    FOREIGN KEY ("trunkId") REFERENCES "AsteriskTrunk"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "AsteriskTrunkGroupMember_groupId_trunkId_key"
  ON "AsteriskTrunkGroupMember"("groupId", "trunkId");

CREATE INDEX IF NOT EXISTS "AsteriskTrunkGroupMember_tenantId_groupId_idx"
  ON "AsteriskTrunkGroupMember"("tenantId", "groupId");

CREATE INDEX IF NOT EXISTS "AsteriskTrunkGroupMember_tenantId_trunkId_idx"
  ON "AsteriskTrunkGroupMember"("tenantId", "trunkId");
