CREATE INDEX IF NOT EXISTS "agentStatusHistory_tenantId_agentId_endedAt_startedAt_idx"
ON "agentStatusHistory" ("tenantId", "agentId", "endedAt", "startedAt" DESC);
