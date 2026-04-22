CREATE TABLE "agentDesktopReleases" (
  "releaseId" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "channel" VARCHAR(32) NOT NULL DEFAULT 'stable',
  "version" VARCHAR(32) NOT NULL,
  "artifactId" VARCHAR(128) NOT NULL,
  "fileName" VARCHAR(255) NOT NULL,
  "filePath" TEXT NOT NULL,
  "fileSizeBytes" BIGINT,
  "sha256" VARCHAR(64) NOT NULL,
  "mandatory" BOOLEAN NOT NULL DEFAULT false,
  "minimumRequiredVersion" VARCHAR(32),
  "minimumServerVersion" VARCHAR(32),
  "maximumServerVersion" VARCHAR(32),
  "notes" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "publishedAt" TIMESTAMPTZ(6) NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agentDesktopReleases_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("tenantId") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "agentDesktopReleases_tenantId_artifactId_key"
  ON "agentDesktopReleases" ("tenantId", "artifactId");

CREATE INDEX "agentDesktopReleases_lookup_idx"
  ON "agentDesktopReleases" ("tenantId", "channel", "isActive", "publishedAt" DESC);

CREATE TABLE "agentDesktopUpdateAuditLogs" (
  "auditLogId" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "agentId" UUID,
  "deviceId" VARCHAR(128),
  "clientIp" VARCHAR(64),
  "currentAppVersion" VARCHAR(32),
  "targetVersion" VARCHAR(32),
  "artifactId" VARCHAR(128),
  "eventType" VARCHAR(64) NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agentDesktopUpdateAuditLogs_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("tenantId") ON DELETE CASCADE,
  CONSTRAINT "agentDesktopUpdateAuditLogs_agentId_fkey"
    FOREIGN KEY ("agentId") REFERENCES "agents"("agentId") ON DELETE SET NULL
);

CREATE INDEX "agentDesktopUpdateAuditLogs_tenant_created_idx"
  ON "agentDesktopUpdateAuditLogs" ("tenantId", "createdAt" DESC);

CREATE INDEX "agentDesktopUpdateAuditLogs_agent_created_idx"
  ON "agentDesktopUpdateAuditLogs" ("tenantId", "agentId", "createdAt" DESC);
