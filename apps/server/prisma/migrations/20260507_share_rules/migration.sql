-- 공유규칙 (BlueSky ShareRule + ShareRuleStaff + ShareRuleJisa 등가)
-- shareRules: 마스터
-- shareRuleAgents: 룰 → 상담원 매트릭스 (priority 정렬)
-- shareRuleAgentGroups: 룰 → 상담원 그룹 매트릭스 (priority 정렬)
-- shareRuleBranches: 룰 → 지사 매트릭스 (mainPhone/transferPhone 부속)
-- agentId/agentGroupId 분리 이유: Prisma schema 만으로 one-of 제약을 표현하기 어려움.

CREATE TABLE "shareRules" (
  "shareRuleId" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "ruleCode" VARCHAR(32) NOT NULL,
  "ruleName" VARCHAR(128) NOT NULL,
  "description" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "updatedById" UUID,
  CONSTRAINT "shareRules_pkey" PRIMARY KEY ("shareRuleId")
);

CREATE UNIQUE INDEX "shareRules_tenantId_ruleCode_key"
  ON "shareRules" ("tenantId", "ruleCode");

CREATE INDEX "shareRules_tenantId_isActive_idx"
  ON "shareRules" ("tenantId", "isActive");

ALTER TABLE "shareRules"
  ADD CONSTRAINT "shareRules_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- shareRuleAgents: 상담원 단위 우선순위
CREATE TABLE "shareRuleAgents" (
  "shareRuleAgentId" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "shareRuleId" UUID NOT NULL,
  "agentId" UUID NOT NULL,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  CONSTRAINT "shareRuleAgents_pkey" PRIMARY KEY ("shareRuleAgentId")
);

CREATE UNIQUE INDEX "shareRuleAgents_tenantId_shareRuleId_agentId_key"
  ON "shareRuleAgents" ("tenantId", "shareRuleId", "agentId");

CREATE INDEX "shareRuleAgents_shareRuleId_priority_idx"
  ON "shareRuleAgents" ("shareRuleId", "priority");

ALTER TABLE "shareRuleAgents"
  ADD CONSTRAINT "shareRuleAgents_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "shareRuleAgents"
  ADD CONSTRAINT "shareRuleAgents_shareRuleId_fkey"
  FOREIGN KEY ("shareRuleId") REFERENCES "shareRules"("shareRuleId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "shareRuleAgents"
  ADD CONSTRAINT "shareRuleAgents_agentId_fkey"
  FOREIGN KEY ("agentId") REFERENCES "agents"("agentId")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- shareRuleAgentGroups: 그룹 단위 우선순위
CREATE TABLE "shareRuleAgentGroups" (
  "shareRuleAgentGroupId" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "shareRuleId" UUID NOT NULL,
  "agentGroupId" UUID NOT NULL,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  CONSTRAINT "shareRuleAgentGroups_pkey" PRIMARY KEY ("shareRuleAgentGroupId")
);

CREATE UNIQUE INDEX "shareRuleAgentGroups_tenantId_shareRuleId_agentGroupId_key"
  ON "shareRuleAgentGroups" ("tenantId", "shareRuleId", "agentGroupId");

CREATE INDEX "shareRuleAgentGroups_shareRuleId_priority_idx"
  ON "shareRuleAgentGroups" ("shareRuleId", "priority");

ALTER TABLE "shareRuleAgentGroups"
  ADD CONSTRAINT "shareRuleAgentGroups_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "shareRuleAgentGroups"
  ADD CONSTRAINT "shareRuleAgentGroups_shareRuleId_fkey"
  FOREIGN KEY ("shareRuleId") REFERENCES "shareRules"("shareRuleId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "shareRuleAgentGroups"
  ADD CONSTRAINT "shareRuleAgentGroups_agentGroupId_fkey"
  FOREIGN KEY ("agentGroupId") REFERENCES "agentGroups"("agentGroupId")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- shareRuleBranches: 룰이 적용되는 지사와 부속 전화번호
CREATE TABLE "shareRuleBranches" (
  "shareRuleBranchId" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "shareRuleId" UUID NOT NULL,
  "branchId" UUID NOT NULL,
  "mainPhone" VARCHAR(32),
  "transferPhone" VARCHAR(32),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  CONSTRAINT "shareRuleBranches_pkey" PRIMARY KEY ("shareRuleBranchId")
);

CREATE UNIQUE INDEX "shareRuleBranches_tenantId_shareRuleId_branchId_key"
  ON "shareRuleBranches" ("tenantId", "shareRuleId", "branchId");

CREATE INDEX "shareRuleBranches_shareRuleId_idx"
  ON "shareRuleBranches" ("shareRuleId");

ALTER TABLE "shareRuleBranches"
  ADD CONSTRAINT "shareRuleBranches_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "shareRuleBranches"
  ADD CONSTRAINT "shareRuleBranches_shareRuleId_fkey"
  FOREIGN KEY ("shareRuleId") REFERENCES "shareRules"("shareRuleId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "shareRuleBranches"
  ADD CONSTRAINT "shareRuleBranches_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "branches"("branchId")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- customers 에 shareRuleId 추가 (고객별 오버라이드)
ALTER TABLE "customers" ADD COLUMN "shareRuleId" UUID;

ALTER TABLE "customers"
  ADD CONSTRAINT "customers_shareRuleId_fkey"
  FOREIGN KEY ("shareRuleId") REFERENCES "shareRules"("shareRuleId")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "customers_tenantId_shareRuleId_idx"
  ON "customers" ("tenantId", "shareRuleId");

-- branches 에 defaultShareRuleId 추가 (지사 기본 룰)
ALTER TABLE "branches" ADD COLUMN "defaultShareRuleId" UUID;

ALTER TABLE "branches"
  ADD CONSTRAINT "branches_defaultShareRuleId_fkey"
  FOREIGN KEY ("defaultShareRuleId") REFERENCES "shareRules"("shareRuleId")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "branches_tenantId_defaultShareRuleId_idx"
  ON "branches" ("tenantId", "defaultShareRuleId");
