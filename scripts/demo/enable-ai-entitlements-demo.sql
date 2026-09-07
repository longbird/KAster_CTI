-- 시드 테넌트의 '통화 AI 분석' · 'AI 인사이트 대시보드' 자격을 켠다 (플랫폼 관리자 화면과 같은 결과).
-- 플랫폼 관리자 비밀번호 없이 시연을 준비할 때만 쓴다. 감사 로그에 platformAdminId 없이 note 로 남긴다.
-- 서버의 자격 캐시는 30초 뒤 반영된다.
--
--   docker exec -i kaster-postgres psql -U kaster -d kaster_cti -v ON_ERROR_STOP=1 < scripts/demo/enable-ai-entitlements-demo.sql

\set tenant '00000000-0000-0000-0000-000000000001'

BEGIN;
INSERT INTO "tenantFeatureEntitlementAuditLogs" ("auditLogId", "tenantId", "featureKey", "beforeEnabled", "afterEnabled", "note")
SELECT gen_random_uuid(), :'tenant'::uuid, f.key, e.enabled, true, 'scripts/demo/enable-ai-entitlements-demo.sql (SQL 직접)'
FROM (VALUES ('call-analysis'), ('ai-insights')) AS f(key)
LEFT JOIN "tenantFeatureEntitlements" e ON e."tenantId" = :'tenant'::uuid AND e."featureKey" = f.key
WHERE e.enabled IS DISTINCT FROM true;

INSERT INTO "tenantFeatureEntitlements" ("entitlementId", "tenantId", "featureKey", "enabled", "enabledAt", "note", "updatedAt")
VALUES
  (gen_random_uuid(), :'tenant'::uuid, 'call-analysis', true, now(), '시연 준비', now()),
  (gen_random_uuid(), :'tenant'::uuid, 'ai-insights',   true, now(), '시연 준비', now())
ON CONFLICT ("tenantId", "featureKey") DO UPDATE
  SET enabled = true,
      "enabledAt" = COALESCE("tenantFeatureEntitlements"."enabledAt", now()),
      note = EXCLUDED.note,
      "updatedAt" = now();
COMMIT;

SELECT "featureKey", enabled, "enabledAt" FROM "tenantFeatureEntitlements"
WHERE "tenantId" = :'tenant'::uuid AND "featureKey" IN ('call-analysis', 'ai-insights') ORDER BY 1;
