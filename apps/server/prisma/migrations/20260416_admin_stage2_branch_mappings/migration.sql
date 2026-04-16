CREATE TABLE "branchAgents" (
  "branchAgentId" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "branchId" UUID NOT NULL,
  "agentId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "branchAgents_pkey" PRIMARY KEY ("branchAgentId")
);

CREATE TABLE "branchQueues" (
  "branchQueueId" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "branchId" UUID NOT NULL,
  "queueId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "branchQueues_pkey" PRIMARY KEY ("branchQueueId")
);

CREATE UNIQUE INDEX "branchAgents_branchId_agentId_key"
  ON "branchAgents"("branchId", "agentId");

CREATE INDEX "branchAgents_tenantId_branchId_idx"
  ON "branchAgents"("tenantId", "branchId");

CREATE UNIQUE INDEX "branchQueues_branchId_queueId_key"
  ON "branchQueues"("branchId", "queueId");

CREATE INDEX "branchQueues_tenantId_branchId_idx"
  ON "branchQueues"("tenantId", "branchId");

ALTER TABLE "branchAgents"
  ADD CONSTRAINT "branchAgents_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "branchAgents"
  ADD CONSTRAINT "branchAgents_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "branches"("branchId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "branchAgents"
  ADD CONSTRAINT "branchAgents_agentId_fkey"
  FOREIGN KEY ("agentId") REFERENCES "agents"("agentId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "branchQueues"
  ADD CONSTRAINT "branchQueues_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "branchQueues"
  ADD CONSTRAINT "branchQueues_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "branches"("branchId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "branchQueues"
  ADD CONSTRAINT "branchQueues_queueId_fkey"
  FOREIGN KEY ("queueId") REFERENCES "queues"("queueId")
  ON DELETE CASCADE ON UPDATE CASCADE;
