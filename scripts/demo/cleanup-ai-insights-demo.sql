-- seed-ai-insights-demo.sql 이 만든 시연 데이터를 전부 지운다. 실제 통화·분석은 건드리지 않는다.
--
--   docker exec -i kaster-postgres psql -U kaster -d kaster_cti -v ON_ERROR_STOP=1 < scripts/demo/cleanup-ai-insights-demo.sql

BEGIN;
DELETE FROM "callAnalyses"      WHERE "callId" IN (SELECT "callId" FROM "callSessions" WHERE "linkedid" LIKE 'demo-ai-%');
DELETE FROM "callTranscripts"   WHERE "callId" IN (SELECT "callId" FROM "callSessions" WHERE "linkedid" LIKE 'demo-ai-%');
DELETE FROM "callAnalysisJobs"  WHERE "callId" IN (SELECT "callId" FROM "callSessions" WHERE "linkedid" LIKE 'demo-ai-%');
DELETE FROM "callRecordings"    WHERE "linkedid" LIKE 'demo-ai-%';
DELETE FROM "callSessions"      WHERE "linkedid" LIKE 'demo-ai-%';
-- 시연 분류는 다른 분석이 참조하지 않을 때만 지운다.
DELETE FROM "consultCategories" c
 WHERE c."code" LIKE 'DEMO_%'
   AND NOT EXISTS (SELECT 1 FROM "callAnalyses" a WHERE a."categoryId" = c."categoryId");
COMMIT;

SELECT (SELECT count(*) FROM "callSessions" WHERE "linkedid" LIKE 'demo-ai-%') AS remaining_demo_sessions;
