CREATE TABLE "tenantSystemSettings" (
    "tenantSystemSettingId" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "recordingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "defaultMaxWaitSeconds" INTEGER NOT NULL DEFAULT 45,
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'Asia/Seoul',
    "dateFormat" VARCHAR(32) NOT NULL DEFAULT 'YYYY-MM-DD HH:mm:ss',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenantSystemSettings_pkey" PRIMARY KEY ("tenantSystemSettingId")
);

CREATE UNIQUE INDEX "tenantSystemSettings_tenantId_key"
ON "tenantSystemSettings"("tenantId");

ALTER TABLE "tenantSystemSettings"
ADD CONSTRAINT "tenantSystemSettings_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("tenantId")
ON DELETE CASCADE ON UPDATE CASCADE;
