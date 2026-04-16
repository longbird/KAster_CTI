CREATE TABLE "branches" (
  "branchId" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "branchCode" VARCHAR(32) NOT NULL,
  "branchName" VARCHAR(128) NOT NULL,
  "description" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "branches_pkey" PRIMARY KEY ("branchId")
);

CREATE TABLE "rolePermissions" (
  "rolePermissionId" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "roleCode" VARCHAR(32) NOT NULL,
  "menuKey" VARCHAR(128) NOT NULL,
  "canAccess" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "rolePermissions_pkey" PRIMARY KEY ("rolePermissionId")
);

CREATE UNIQUE INDEX "branches_tenantId_branchCode_key"
  ON "branches"("tenantId", "branchCode");

CREATE INDEX "branches_tenantId_branchName_idx"
  ON "branches"("tenantId", "branchName");

CREATE UNIQUE INDEX "rolePermissions_tenantId_roleCode_menuKey_key"
  ON "rolePermissions"("tenantId", "roleCode", "menuKey");

CREATE INDEX "rolePermissions_tenantId_roleCode_idx"
  ON "rolePermissions"("tenantId", "roleCode");

ALTER TABLE "branches"
  ADD CONSTRAINT "branches_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "rolePermissions"
  ADD CONSTRAINT "rolePermissions_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;
