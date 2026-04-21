CREATE TABLE "agentMenuPermissions" (
    "agentMenuPermissionId" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "agentId" UUID NOT NULL,
    "menuKey" VARCHAR(128) NOT NULL,
    "canAccess" BOOLEAN NOT NULL DEFAULT true,
    "canView" BOOLEAN NOT NULL DEFAULT true,
    "canCreate" BOOLEAN NOT NULL DEFAULT false,
    "canUpdate" BOOLEAN NOT NULL DEFAULT false,
    "canDelete" BOOLEAN NOT NULL DEFAULT false,
    "canOperate" BOOLEAN NOT NULL DEFAULT false,
    "canExport" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agentMenuPermissions_pkey" PRIMARY KEY ("agentMenuPermissionId")
);

CREATE UNIQUE INDEX "agentMenuPermissions_tenantId_agentId_menuKey_key"
    ON "agentMenuPermissions"("tenantId", "agentId", "menuKey");

CREATE INDEX "agentMenuPermissions_tenantId_agentId_idx"
    ON "agentMenuPermissions"("tenantId", "agentId");

ALTER TABLE "agentMenuPermissions"
    ADD CONSTRAINT "agentMenuPermissions_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("tenantId")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "agentMenuPermissions"
    ADD CONSTRAINT "agentMenuPermissions_agentId_fkey"
    FOREIGN KEY ("agentId") REFERENCES "agents"("agentId")
    ON DELETE CASCADE ON UPDATE CASCADE;
