-- SIP 수신 포트를 48950 으로 확정한다.
--
-- 배경: 이 컬럼은 도입 시점부터 schema.prisma 와 마이그레이션이 서로 다른 기본값을 들고
-- 있었다 (앱에서 만든 행과 raw SQL 로 만든 행의 값이 달랐다). 48950 으로 통일한다.

ALTER TABLE "tenantSystemSettings"
  ALTER COLUMN "sipRegisterPort" SET DEFAULT 48950;

-- 아직 정식 배포 전이므로 기존 행도 함께 정리한다.
-- 운영 중이었다면 "기본값 그대로"인지 "일부러 설정한 값"인지 구분할 수 없어 건드리면
-- 안 되지만, 지금은 옛 기본값(5060 / 36070)을 들고 있는 행이 전부 미설정 상태다.
-- 이 조건 밖의 값(운영자가 실제로 지정한 포트)은 그대로 둔다.
UPDATE "tenantSystemSettings"
   SET "sipRegisterPort" = 48950
 WHERE "sipRegisterPort" IN (5060, 36070);

-- 적용 후 확인:
--   SELECT "tenantId", "sipRegisterPort" FROM "tenantSystemSettings";
--
-- 갱신 후에는 PBX 설정을 재적용해야 pjsip.conf 의 bind 가 바뀐다.
-- 방화벽(infra/security/pbx-sip-hardening/*)도 같은 포트여야 한다.
