-- 기능코드 registry.
-- 기존에 env 로 흩어져 있던 ASTERISK_ATXFER_COMPLETE_CODE / ASTERISK_HOLD_FEATURE_CODE /
-- ASTERISK_RESUME_FEATURE_CODE 를 테넌트 단위 설정으로 옮기고, 단말 다이얼 기능코드
-- (대리응답)를 추가하기 위한 테이블이다.

CREATE TABLE "featureCodes" (
  "featureCodeId" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId"      UUID NOT NULL,
  "featureKey"    VARCHAR(64) NOT NULL,
  "code"          VARCHAR(16),
  "enabled"       BOOLEAN NOT NULL DEFAULT true,
  "createdAt"     TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updatedAt"     TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "featureCodes_pkey" PRIMARY KEY ("featureCodeId"),
  CONSTRAINT "featureCodes_tenantId_fkey" FOREIGN KEY ("tenantId")
    REFERENCES "tenants"("tenantId") ON DELETE CASCADE ON UPDATE CASCADE
);

-- 기능당 1행.
CREATE UNIQUE INDEX "featureCodes_tenantId_featureKey_key"
  ON "featureCodes"("tenantId", "featureKey");

-- 같은 테넌트 안에서 코드 값이 겹치면 안 된다.
-- code 가 NULL 인 행(미설정)은 여러 개 있을 수 있어야 하므로 NULL 중복을 허용하는
-- 일반 UNIQUE 를 쓴다. Postgres 의 UNIQUE 는 NULL 을 서로 다른 값으로 본다.
CREATE UNIQUE INDEX "featureCodes_tenantId_code_key"
  ON "featureCodes"("tenantId", "code");

CREATE INDEX "featureCodes_tenantId_enabled_idx"
  ON "featureCodes"("tenantId", "enabled");
