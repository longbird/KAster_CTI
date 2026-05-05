CREATE TABLE IF NOT EXISTS "callRecordingAccessAuditLogs" (
  "auditLogId" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "recordingId" UUID NOT NULL,
  "callId" UUID,
  "linkedid" VARCHAR(32),
  "agentId" UUID,
  "userRole" VARCHAR(32),
  "action" VARCHAR(32) NOT NULL,
  "clientIp" VARCHAR(64),
  "userAgent" VARCHAR(255),
  "success" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "callRecordingAccessAuditLogs_tenantId_createdAt_idx"
  ON "callRecordingAccessAuditLogs" ("tenantId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "callRecordingAccessAuditLogs_tenantId_recordingId_createdAt_idx"
  ON "callRecordingAccessAuditLogs" ("tenantId", "recordingId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "callRecordingAccessAuditLogs_tenantId_agentId_createdAt_idx"
  ON "callRecordingAccessAuditLogs" ("tenantId", "agentId", "createdAt" DESC);
