-- 관리자 추이 분석용 주기 스냅샷.
-- 대기큐 깊이/트렁크 점유/단말 등록수는 순간값이라 적재하지 않으면 소급 조회가 불가능하다.

CREATE TABLE "dashboardSnapshots" (
    "snapshotId"          UUID         NOT NULL DEFAULT gen_random_uuid(),
    "tenantId"            UUID         NOT NULL,
    "queueId"             UUID,
    "capturedAt"          TIMESTAMPTZ(6) NOT NULL,
    "resolution"          VARCHAR(8)   NOT NULL DEFAULT 'PT1M',

    "waitingCalls"        INTEGER      NOT NULL DEFAULT 0,
    "longestWaitSeconds"  INTEGER      NOT NULL DEFAULT 0,
    "talkingCalls"        INTEGER      NOT NULL DEFAULT 0,
    "ringingCalls"        INTEGER      NOT NULL DEFAULT 0,

    "agentsAvailable"     INTEGER      NOT NULL DEFAULT 0,
    "agentsRinging"       INTEGER      NOT NULL DEFAULT 0,
    "agentsTalking"       INTEGER      NOT NULL DEFAULT 0,
    "agentsAcw"           INTEGER      NOT NULL DEFAULT 0,
    "agentsBreak"         INTEGER      NOT NULL DEFAULT 0,
    "agentsLoggedIn"      INTEGER      NOT NULL DEFAULT 0,

    "trunkChannelsInUse"  INTEGER,
    "endpointsTotal"      INTEGER,
    "endpointsRegistered" INTEGER,
    "endpointsReachable"  INTEGER,
    "amiConnected"        BOOLEAN,

    "createdAt"           TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dashboardSnapshots_pkey" PRIMARY KEY ("snapshotId")
);

-- 리더 전환 순간 두 노드가 같은 분을 동시 적재하는 것을 막는 최종 방어선.
-- queueId 가 NULL 인 합계 행도 하나만 존재해야 하므로 NULLS NOT DISTINCT 를 쓴다.
CREATE UNIQUE INDEX "dashboardSnapshots_tenantId_queueId_resolution_capturedAt_key"
    ON "dashboardSnapshots" ("tenantId", "queueId", "resolution", "capturedAt") NULLS NOT DISTINCT;

CREATE INDEX "dashboardSnapshots_tenantId_resolution_capturedAt_idx"
    ON "dashboardSnapshots" ("tenantId", "resolution", "capturedAt" DESC);

ALTER TABLE "dashboardSnapshots"
    ADD CONSTRAINT "dashboardSnapshots_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "dashboardSnapshots"
    ADD CONSTRAINT "dashboardSnapshots_queueId_fkey"
    FOREIGN KEY ("queueId") REFERENCES "queues"("queueId") ON DELETE SET NULL ON UPDATE CASCADE;
