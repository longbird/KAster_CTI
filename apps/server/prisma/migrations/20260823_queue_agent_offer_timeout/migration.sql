-- 제안 대기 시간을 시스템 설정에서 호분배룰(큐)로 옮긴다.
--
-- 큐마다 성격이 다르다. 상담 큐는 상담원이 생각할 시간이 필요하고, 긴급 큐는 짧아야 한다.
-- 테넌트에 하나뿐이면 둘 중 하나는 늘 틀린 값으로 돈다.

ALTER TABLE "queues"
  ADD COLUMN IF NOT EXISTS "agentOfferTimeoutSeconds" INTEGER NOT NULL DEFAULT 10;

-- 지금 쓰던 값을 그대로 물려준다. 기본값 10 으로 두면 10 이 아닌 값을 설정해 둔 현장은
-- 이 마이그레이션만으로 동작이 바뀐다 — 아무도 안 건드렸는데 대기 시간이 달라진다.
UPDATE "queues" q
   SET "agentOfferTimeoutSeconds" = LEAST(60, GREATEST(1, COALESCE(s."agentOfferTimeoutSeconds", 10)))
  FROM "tenantSystemSettings" s
 WHERE s."tenantId" = q."tenantId";

ALTER TABLE "tenantSystemSettings"
  DROP COLUMN IF EXISTS "agentOfferTimeoutSeconds";
