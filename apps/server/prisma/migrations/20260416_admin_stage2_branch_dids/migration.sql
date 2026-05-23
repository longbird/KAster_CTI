CREATE TABLE "branchDids" (
  "branchDidId" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "branchId" UUID NOT NULL,
  "didId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "branchDids_pkey" PRIMARY KEY ("branchDidId")
);

CREATE UNIQUE INDEX "branchDids_branchId_didId_key"
  ON "branchDids"("branchId", "didId");

CREATE INDEX "branchDids_tenantId_branchId_idx"
  ON "branchDids"("tenantId", "branchId");

ALTER TABLE "branchDids"
  ADD CONSTRAINT "branchDids_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;
