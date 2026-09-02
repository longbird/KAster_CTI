-- ARS HTTP_LOOKUP P1: 외부 조회 엔드포인트 레지스트리
-- 통화 경로는 아직 이 테이블을 읽지 않는다. 관리자 화면의 "테스트 호출" 만 쓴다.
-- URL 을 플로우 노드에 적지 못하게 하려고 별도 테이블로 둔다 (SSRF·시크릿 복사·변경 범위).

CREATE TABLE "arsHttpEndpoints" (
  "endpointId" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "name" VARCHAR(128) NOT NULL,
  "description" TEXT,
  "method" VARCHAR(8) NOT NULL DEFAULT 'GET',
  "url" VARCHAR(512) NOT NULL,
  -- 무엇을 보낼지. { "파라미터명": "CALLER|COLLECTED|ENTRY_DID|LINKEDID|LITERAL:..." }
  -- 자유 템플릿을 쓰지 않는 이유는 그 자체가 주입 표면이기 때문이다.
  "requestMapping" JSONB NOT NULL DEFAULT '{}',
  "authType" VARCHAR(16) NOT NULL DEFAULT 'NONE',
  "authHeaderName" VARCHAR(64),
  -- AES-256-GCM 암호문. API 로 절대 나가지 않는다 (조회 응답에는 hasSecret 만).
  "authSecretEnc" TEXT,
  "resultPath" VARCHAR(256) NOT NULL,
  "matchMode" VARCHAR(16) NOT NULL DEFAULT 'EXISTS',
  "matchValue" VARCHAR(256),
  -- 통화가 기다리는 시간이다. 상한은 코드가 5000ms 로 묶는다.
  "timeoutMs" INTEGER NOT NULL DEFAULT 2000,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "arsHttpEndpoints_pkey" PRIMARY KEY ("endpointId")
);

CREATE UNIQUE INDEX "arsHttpEndpoints_tenantId_name_key" ON "arsHttpEndpoints" ("tenantId", "name");
CREATE INDEX "arsHttpEndpoints_tenantId_isActive_idx" ON "arsHttpEndpoints" ("tenantId", "isActive");

ALTER TABLE "arsHttpEndpoints"
  ADD CONSTRAINT "arsHttpEndpoints_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
