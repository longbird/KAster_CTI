-- 무조건 착신 대상(상담원/분배룰/외부번호)을 큐 설정에 저장
ALTER TABLE "queues" ADD COLUMN "unconditionalTargetType" VARCHAR(16);
ALTER TABLE "queues" ADD COLUMN "unconditionalTargetValue" VARCHAR(64);
