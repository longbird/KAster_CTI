-- SIP 수신 포트 기본값을 48950 으로 확정한다.
--
-- 배경: 이 컬럼은 도입 시점부터 schema.prisma 는 36070, 마이그레이션은 5060 으로 서로
-- 다른 기본값을 들고 있었다. Prisma 로 만든 행은 36070, raw SQL 로 만든 행은 5060 이
-- 들어가 어느 쪽이 진실인지 알 수 없는 상태였다. 48950 으로 통일한다.

ALTER TABLE "tenantSystemSettings"
  ALTER COLUMN "sipRegisterPort" SET DEFAULT 48950;

-- 기존 행은 건드리지 않는다.
--
-- 이 컬럼은 관리자가 화면에서 직접 설정할 수 있으므로, 36070/5060 을 들고 있는 행이
-- "기본값 그대로"인지 "일부러 그 값으로 설정한 것"인지 SQL 만으로 구분할 수 없다.
-- 잘못 덮어쓰면 운영 PBX 가 다른 포트로 bind 되어 전화가 끊긴다.
--
-- 운영 반영 시 아래를 먼저 조회해 대상과 값을 눈으로 확인한 뒤, 필요한 행만 갱신한다.
--
--   SELECT "tenantId", "sipRegisterPort"
--     FROM "tenantSystemSettings"
--    WHERE "sipRegisterPort" IN (5060, 36070);
--
--   -- 확인 후 (예시)
--   UPDATE "tenantSystemSettings"
--      SET "sipRegisterPort" = 48950
--    WHERE "tenantId" = '<확인한 tenantId>';
--
-- 갱신 후에는 PBX 설정을 반드시 재적용해야 pjsip.conf 의 bind 가 바뀐다.
-- 방화벽(infra/security/pbx-sip-hardening/*)도 같은 포트로 맞춰야 한다.
