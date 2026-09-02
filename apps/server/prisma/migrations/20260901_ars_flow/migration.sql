-- ARS 플로우 빌더: 그래프 모델 (노드/엣지) + DID 연결
-- Phase 0 은 컴파일러와 검증기만 쓰므로 이 마이그레이션만으로는 통화 처리가 바뀌지 않는다.
-- AsteriskDid.flowId 가 비어 있으면 기존 세 갈래(수신거부 / Smart ARS / 표준)가 그대로 동작한다.

CREATE TABLE "arsFlows" (
  "flowId" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "branchId" UUID,
  "name" VARCHAR(128) NOT NULL,
  "description" TEXT,
  "status" VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
  -- 진입 노드. arsFlowNodes 를 가리키지만 FK 를 걸지 않는다 (순환 FK → 생성 순서가 꼬인다).
  "entryNodeId" UUID,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "arsFlows_pkey" PRIMARY KEY ("flowId")
);

CREATE UNIQUE INDEX "arsFlows_tenantId_name_key" ON "arsFlows" ("tenantId", "name");
CREATE INDEX "arsFlows_tenantId_status_idx" ON "arsFlows" ("tenantId", "status");

CREATE TABLE "arsFlowNodes" (
  "nodeId" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "flowId" UUID NOT NULL,
  "nodeType" VARCHAR(24) NOT NULL,
  "label" VARCHAR(128) NOT NULL,
  "config" JSONB NOT NULL,
  -- 편집기 좌표. 컴파일러에는 전달하지 않는다.
  "posX" INTEGER NOT NULL DEFAULT 0,
  "posY" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "arsFlowNodes_pkey" PRIMARY KEY ("nodeId")
);

CREATE INDEX "arsFlowNodes_tenantId_flowId_idx" ON "arsFlowNodes" ("tenantId", "flowId");

CREATE TABLE "arsFlowEdges" (
  "edgeId" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "flowId" UUID NOT NULL,
  "fromNodeId" UUID NOT NULL,
  "toNodeId" UUID NOT NULL,
  "condition" VARCHAR(24) NOT NULL,
  "digit" VARCHAR(2),
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "arsFlowEdges_pkey" PRIMARY KEY ("edgeId")
);

CREATE UNIQUE INDEX "arsFlowEdges_flowId_fromNodeId_condition_digit_key"
  ON "arsFlowEdges" ("flowId", "fromNodeId", "condition", "digit");
CREATE INDEX "arsFlowEdges_tenantId_flowId_idx" ON "arsFlowEdges" ("tenantId", "flowId");

ALTER TABLE "AsteriskDid" ADD COLUMN "flowId" UUID;

ALTER TABLE "arsFlows"
    ADD CONSTRAINT "arsFlows_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "arsFlows"
    ADD CONSTRAINT "arsFlows_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "branches"("branchId") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "arsFlowNodes"
    ADD CONSTRAINT "arsFlowNodes_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "arsFlowNodes"
    ADD CONSTRAINT "arsFlowNodes_flowId_fkey"
    FOREIGN KEY ("flowId") REFERENCES "arsFlows"("flowId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "arsFlowEdges"
    ADD CONSTRAINT "arsFlowEdges_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "arsFlowEdges"
    ADD CONSTRAINT "arsFlowEdges_flowId_fkey"
    FOREIGN KEY ("flowId") REFERENCES "arsFlows"("flowId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "arsFlowEdges"
    ADD CONSTRAINT "arsFlowEdges_fromNodeId_fkey"
    FOREIGN KEY ("fromNodeId") REFERENCES "arsFlowNodes"("nodeId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "arsFlowEdges"
    ADD CONSTRAINT "arsFlowEdges_toNodeId_fkey"
    FOREIGN KEY ("toNodeId") REFERENCES "arsFlowNodes"("nodeId") ON DELETE CASCADE ON UPDATE CASCADE;

-- 플로우를 지워도 DID 는 남아야 한다. NULL 이 되면 그 DID 는 기존 표준 경로로 되돌아간다.
ALTER TABLE "AsteriskDid"
    ADD CONSTRAINT "AsteriskDid_flowId_fkey"
    FOREIGN KEY ("flowId") REFERENCES "arsFlows"("flowId") ON DELETE SET NULL ON UPDATE CASCADE;
