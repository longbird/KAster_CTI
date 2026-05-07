-- 아웃바운드 발신번호 매핑 룰 (BlueSky Outbound 등가)

-- matchType enum
CREATE TYPE "OutboundCallerIdMatchType" AS ENUM ('EXACT', 'PREFIX', 'REGEX', 'DIALPLAN_PATTERN');

CREATE TABLE "outboundCallerIdRules" (
  "outboundCallerIdRuleId" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "branchId" UUID,
  "matchType" "OutboundCallerIdMatchType" NOT NULL,
  "sourceNumberPattern" VARCHAR(64) NOT NULL,
  "callerIdNumber" VARCHAR(32) NOT NULL,
  "displayName" VARCHAR(64),
  "memo" TEXT,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  CONSTRAINT "outboundCallerIdRules_pkey" PRIMARY KEY ("outboundCallerIdRuleId")
);

CREATE INDEX "outboundCallerIdRules_tenant_branch_priority_idx"
  ON "outboundCallerIdRules" ("tenantId", "branchId", "priority");

CREATE INDEX "outboundCallerIdRules_tenant_enabled_idx"
  ON "outboundCallerIdRules" ("tenantId", "enabled");

ALTER TABLE "outboundCallerIdRules"
  ADD CONSTRAINT "outboundCallerIdRules_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "outboundCallerIdRules"
  ADD CONSTRAINT "outboundCallerIdRules_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "branches"("branchId")
  ON DELETE SET NULL ON UPDATE CASCADE;
