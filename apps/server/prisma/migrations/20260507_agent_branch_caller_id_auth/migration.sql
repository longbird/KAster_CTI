-- 상담원-지사 CID 발신권한 매트릭스 (BlueSky JisaPossibleAuth 등가)
CREATE TABLE "agentBranchCallerIds" (
  "agentBranchCallerIdId" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "branchId" UUID NOT NULL,
  "agentId" UUID NOT NULL,
  "callerIdNumber" VARCHAR(32) NOT NULL,
  "displayName" VARCHAR(64),
  "allowedInbound" BOOLEAN NOT NULL DEFAULT TRUE,
  "allowedOutbound" BOOLEAN NOT NULL DEFAULT TRUE,
  "allowedTransfer" BOOLEAN NOT NULL DEFAULT TRUE,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  CONSTRAINT "agentBranchCallerIds_pkey" PRIMARY KEY ("agentBranchCallerIdId")
);

CREATE UNIQUE INDEX "agentBranchCallerIds_unique"
  ON "agentBranchCallerIds" ("tenantId", "branchId", "agentId", "callerIdNumber");

CREATE INDEX "agentBranchCallerIds_branch_agent_idx"
  ON "agentBranchCallerIds" ("tenantId", "branchId", "agentId");

CREATE INDEX "agentBranchCallerIds_agent_idx"
  ON "agentBranchCallerIds" ("tenantId", "agentId");

ALTER TABLE "agentBranchCallerIds"
  ADD CONSTRAINT "agentBranchCallerIds_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "agentBranchCallerIds"
  ADD CONSTRAINT "agentBranchCallerIds_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "branches"("branchId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "agentBranchCallerIds"
  ADD CONSTRAINT "agentBranchCallerIds_agentId_fkey"
  FOREIGN KEY ("agentId") REFERENCES "agents"("agentId")
  ON DELETE CASCADE ON UPDATE CASCADE;
