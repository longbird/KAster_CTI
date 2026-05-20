CREATE TABLE "tenantHolidayRules" (
  "holidayRuleId" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "branchId" UUID,
  "ruleName" VARCHAR(128) NOT NULL,
  "ruleType" VARCHAR(24) NOT NULL,
  "holidayDate" VARCHAR(10),
  "monthDay" VARCHAR(5),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "tenantHolidayRules_pkey" PRIMARY KEY ("holidayRuleId")
);

ALTER TABLE "tenantHolidayRules"
  ADD CONSTRAINT "tenantHolidayRules_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tenantHolidayRules"
  ADD CONSTRAINT "tenantHolidayRules_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "branches"("branchId")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "tenantHolidayRules_tenantId_branchId_isActive_idx"
  ON "tenantHolidayRules" ("tenantId", "branchId", "isActive");

CREATE INDEX "tenantHolidayRules_tenantId_holidayDate_idx"
  ON "tenantHolidayRules" ("tenantId", "holidayDate");

CREATE INDEX "tenantHolidayRules_tenantId_monthDay_idx"
  ON "tenantHolidayRules" ("tenantId", "monthDay");
