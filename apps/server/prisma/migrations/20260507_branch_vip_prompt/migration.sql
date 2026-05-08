-- VIP 멘트 연결 (BlueSky Jisa.m_nMentVipCD 등가)
ALTER TABLE "branches" ADD COLUMN "vipPromptId" UUID;

ALTER TABLE "branches"
  ADD CONSTRAINT "branches_vipPromptId_fkey"
  FOREIGN KEY ("vipPromptId") REFERENCES "AsteriskPrompt"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "branches_tenantId_vipPromptId_idx"
  ON "branches" ("tenantId", "vipPromptId");
