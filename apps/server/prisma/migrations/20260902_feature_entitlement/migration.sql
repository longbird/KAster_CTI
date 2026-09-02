-- 기능 자격(entitlement)과 플랫폼 관리자
--
-- 자격 행이 없으면 서버의 feature-catalog.ts 기본값으로 판정한다.
-- 이 마이그레이션만으로는 아무 기능도 막히지 않는다 — 게이트 결선은 Phase 1 이다.
-- platformAdmins 는 tenantId 가 없다. 테넌트 밖의 계정이다.

CREATE TABLE "platformAdmins" (
  "platformAdminId" UUID NOT NULL DEFAULT gen_random_uuid(),
  "loginId" VARCHAR(64) NOT NULL,
  "displayName" VARCHAR(128) NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  -- 부트스트랩 env 로 만든 계정은 첫 로그인에서 비밀번호를 바꿔야 한다.
  "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
  "lastLoginAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platformAdmins_pkey" PRIMARY KEY ("platformAdminId")
);

CREATE UNIQUE INDEX "platformAdmins_loginId_key" ON "platformAdmins" ("loginId");

CREATE TABLE "platformAdminRefreshTokens" (
  "refreshTokenId" UUID NOT NULL DEFAULT gen_random_uuid(),
  "platformAdminId" UUID NOT NULL,
  "tokenHash" VARCHAR(64) NOT NULL,
  "issuedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMPTZ(6) NOT NULL,
  "revokedAt" TIMESTAMPTZ(6),
  "userAgent" VARCHAR(255),
  "ipAddress" VARCHAR(64),
  CONSTRAINT "platformAdminRefreshTokens_pkey" PRIMARY KEY ("refreshTokenId")
);

CREATE UNIQUE INDEX "platformAdminRefreshTokens_tokenHash_key"
  ON "platformAdminRefreshTokens" ("tokenHash");
CREATE INDEX "platformAdminRefreshTokens_platformAdminId_revokedAt_idx"
  ON "platformAdminRefreshTokens" ("platformAdminId", "revokedAt");
CREATE INDEX "platformAdminRefreshTokens_expiresAt_idx"
  ON "platformAdminRefreshTokens" ("expiresAt");

CREATE TABLE "tenantFeatureEntitlements" (
  "entitlementId" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "featureKey" VARCHAR(64) NOT NULL,
  "enabled" BOOLEAN NOT NULL,
  -- 처음 켠 시각. 되돌릴 수 없는 기능의 평문/암호문 경계다.
  "enabledAt" TIMESTAMPTZ(6),
  "note" TEXT,
  "updatedByAdminId" UUID,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tenantFeatureEntitlements_pkey" PRIMARY KEY ("entitlementId")
);

CREATE UNIQUE INDEX "tenantFeatureEntitlements_tenantId_featureKey_key"
  ON "tenantFeatureEntitlements" ("tenantId", "featureKey");
CREATE INDEX "tenantFeatureEntitlements_tenantId_idx"
  ON "tenantFeatureEntitlements" ("tenantId");

CREATE TABLE "tenantFeatureEntitlementAuditLogs" (
  "auditLogId" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "featureKey" VARCHAR(64) NOT NULL,
  "platformAdminId" UUID,
  "beforeEnabled" BOOLEAN,
  "afterEnabled" BOOLEAN NOT NULL,
  "note" TEXT,
  "clientIp" VARCHAR(64),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tenantFeatureEntitlementAuditLogs_pkey" PRIMARY KEY ("auditLogId")
);

CREATE INDEX "tenantFeatureEntitlementAuditLogs_tenantId_createdAt_idx"
  ON "tenantFeatureEntitlementAuditLogs" ("tenantId", "createdAt" DESC);

ALTER TABLE "platformAdminRefreshTokens"
    ADD CONSTRAINT "platformAdminRefreshTokens_platformAdminId_fkey"
    FOREIGN KEY ("platformAdminId") REFERENCES "platformAdmins"("platformAdminId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tenantFeatureEntitlements"
    ADD CONSTRAINT "tenantFeatureEntitlements_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tenantFeatureEntitlementAuditLogs"
    ADD CONSTRAINT "tenantFeatureEntitlementAuditLogs_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
