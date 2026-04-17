CREATE TABLE "AsteriskPrompt" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "promptKey" VARCHAR(128) NOT NULL,
    "displayName" VARCHAR(128) NOT NULL,
    "fileName" VARCHAR(255) NOT NULL,
    "category" VARCHAR(32) NOT NULL DEFAULT 'ivr',
    "description" VARCHAR(255),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AsteriskPrompt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AsteriskPrompt_tenantId_promptKey_key"
ON "AsteriskPrompt"("tenantId", "promptKey");

CREATE INDEX "AsteriskPrompt_tenantId_category_isActive_idx"
ON "AsteriskPrompt"("tenantId", "category", "isActive");

ALTER TABLE "AsteriskPrompt"
ADD CONSTRAINT "AsteriskPrompt_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("tenantId")
ON DELETE CASCADE ON UPDATE CASCADE;
