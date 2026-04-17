CREATE TABLE "AsteriskBlocklistEntry" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "phoneNumber" VARCHAR(32) NOT NULL,
    "description" VARCHAR(255),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AsteriskBlocklistEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AsteriskBlocklistEntry_tenantId_phoneNumber_key"
ON "AsteriskBlocklistEntry"("tenantId", "phoneNumber");

CREATE INDEX "AsteriskBlocklistEntry_tenantId_isActive_idx"
ON "AsteriskBlocklistEntry"("tenantId", "isActive");

ALTER TABLE "AsteriskBlocklistEntry"
ADD CONSTRAINT "AsteriskBlocklistEntry_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("tenantId")
ON DELETE CASCADE ON UPDATE CASCADE;
