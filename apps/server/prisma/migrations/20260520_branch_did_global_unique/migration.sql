CREATE UNIQUE INDEX "branchDids_tenantId_didId_key"
  ON "branchDids"("tenantId", "didId");
