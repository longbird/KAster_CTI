CREATE TABLE "asteriskForwardingRules" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "didId" UUID NOT NULL,
    "forwardType" VARCHAR(16) NOT NULL,
    "targetValue" VARCHAR(64) NOT NULL,
    "description" VARCHAR(255),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asteriskForwardingRules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "asteriskForwardingRules_tenantId_didId_key"
ON "asteriskForwardingRules"("tenantId", "didId");

CREATE INDEX "asteriskForwardingRules_tenantId_enabled_idx"
ON "asteriskForwardingRules"("tenantId", "enabled");

ALTER TABLE "asteriskForwardingRules"
ADD CONSTRAINT "asteriskForwardingRules_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("tenantId")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "asteriskForwardingRules"
ADD CONSTRAINT "asteriskForwardingRules_didId_fkey"
FOREIGN KEY ("didId") REFERENCES "AsteriskDid"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
