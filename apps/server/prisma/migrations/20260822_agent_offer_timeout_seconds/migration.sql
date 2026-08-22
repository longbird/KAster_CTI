-- 상담원에게 "받으시겠습니까" 를 묻고 기다리는 시간. 지금까지는 코드 상수 10초였다.
-- 기본값 10 은 그 상수와 같은 값이라 기존 테넌트의 동작이 바뀌지 않는다.
ALTER TABLE "tenantSystemSettings"
  ADD COLUMN IF NOT EXISTS "agentOfferTimeoutSeconds" INTEGER NOT NULL DEFAULT 10;
