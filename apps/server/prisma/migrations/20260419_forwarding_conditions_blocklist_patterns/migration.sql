ALTER TABLE "asteriskForwardingRules"
ADD COLUMN "conditionType" VARCHAR(16) NOT NULL DEFAULT 'ALWAYS',
ADD COLUMN "timeStart" VARCHAR(5),
ADD COLUMN "timeEnd" VARCHAR(5),
ADD COLUMN "daysOfWeek" VARCHAR(32);

ALTER TABLE "AsteriskBlocklistEntry"
ADD COLUMN "matchType" VARCHAR(16) NOT NULL DEFAULT 'EXACT';

DROP INDEX "AsteriskBlocklistEntry_tenantId_phoneNumber_key";

CREATE UNIQUE INDEX "AsteriskBlocklistEntry_tenantId_matchType_phoneNumber_key"
ON "AsteriskBlocklistEntry"("tenantId", "matchType", "phoneNumber");
