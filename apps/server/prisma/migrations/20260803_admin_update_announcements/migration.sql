ALTER TABLE "announcements"
  ADD COLUMN IF NOT EXISTS "category" VARCHAR(32) NOT NULL DEFAULT 'NOTICE',
  ADD COLUMN IF NOT EXISTS "targetApp" VARCHAR(16) NOT NULL DEFAULT 'ALL',
  ADD COLUMN IF NOT EXISTS "showOnLogin" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "severity" VARCHAR(16) NOT NULL DEFAULT 'INFO',
  ADD COLUMN IF NOT EXISTS "releaseTag" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "effectiveFrom" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMPTZ(6);

CREATE INDEX IF NOT EXISTS "announcements_tenantId_category_targetApp_showOnLogin_createdAt_idx"
  ON "announcements"("tenantId", "category", "targetApp", "showOnLogin", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS "announcementReads" (
  "announcementReadId" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "announcementId" UUID NOT NULL,
  "agentId" UUID NOT NULL,
  "readAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acknowledgedAt" TIMESTAMPTZ(6),
  CONSTRAINT "announcementReads_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("tenantId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "announcementReads_announcementId_fkey"
    FOREIGN KEY ("announcementId") REFERENCES "announcements"("announcementId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "announcementReads_agentId_fkey"
    FOREIGN KEY ("agentId") REFERENCES "agents"("agentId") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "announcementReads_tenantId_announcementId_agentId_key"
  ON "announcementReads"("tenantId", "announcementId", "agentId");

CREATE INDEX IF NOT EXISTS "announcementReads_tenantId_agentId_acknowledgedAt_idx"
  ON "announcementReads"("tenantId", "agentId", "acknowledgedAt");
