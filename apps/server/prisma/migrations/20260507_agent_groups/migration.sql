-- 상담원 그룹 (BlueSky StaffGroup 등가)
CREATE TABLE "agentGroups" (
  "agentGroupId" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "groupCode" VARCHAR(32) NOT NULL,
  "groupName" VARCHAR(128) NOT NULL,
  "description" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "updatedById" UUID,
  CONSTRAINT "agentGroups_pkey" PRIMARY KEY ("agentGroupId")
);

CREATE UNIQUE INDEX "agentGroups_tenantId_groupCode_key"
  ON "agentGroups" ("tenantId", "groupCode");

CREATE INDEX "agentGroups_tenantId_isActive_idx"
  ON "agentGroups" ("tenantId", "isActive");

ALTER TABLE "agentGroups"
  ADD CONSTRAINT "agentGroups_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- agents 테이블에 agentGroupId 추가 (NULL 허용 — 그룹 미지정 가능)
ALTER TABLE "agents" ADD COLUMN "agentGroupId" UUID;

ALTER TABLE "agents"
  ADD CONSTRAINT "agents_agentGroupId_fkey"
  FOREIGN KEY ("agentGroupId") REFERENCES "agentGroups"("agentGroupId")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "agents_tenantId_agentGroupId_idx"
  ON "agents" ("tenantId", "agentGroupId");
