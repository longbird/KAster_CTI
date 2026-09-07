-- AI 인사이트 대시보드 시연용 데이터.
--
-- 실 녹취·전사 없이 "분석이 끝난 통화" 를 만든다. 최근 14일에 하루 ~30건, 감정·상담분류·키워드가
-- 시연에서 읽히도록 분포를 줬다 (최근 3일 부정 비율 상승, 오늘 '앱 오류' 급상승).
-- 전부 시드 테넌트(00000000-...-0001)에 들어가고, 세션 linkedid 가 'demo-ai-' 로 시작한다.
-- 되돌리기: scripts/demo/cleanup-ai-insights-demo.sql
--
--   docker exec -i kaster-postgres psql -U kaster -d kaster_cti -v ON_ERROR_STOP=1 < scripts/demo/seed-ai-insights-demo.sql
--
-- 다시 실행하면 기존 시연 데이터를 지우고 새로 만든다 (오늘 기준으로 날짜가 다시 깔린다).
-- 녹취 행에는 실제 파일이 없다. 분석 job 을 COMPLETED 로 같이 넣어 reconcile 이 다시 집어 가지 않게 한다.

\set tenant '00000000-0000-0000-0000-000000000001'

BEGIN;
SELECT setseed(0.42);

-- 0) 기존 시연 데이터 제거 (cleanup 과 같은 순서)
DELETE FROM "callAnalyses"      WHERE "callId" IN (SELECT "callId" FROM "callSessions" WHERE "linkedid" LIKE 'demo-ai-%');
DELETE FROM "callTranscripts"   WHERE "callId" IN (SELECT "callId" FROM "callSessions" WHERE "linkedid" LIKE 'demo-ai-%');
DELETE FROM "callAnalysisJobs"  WHERE "callId" IN (SELECT "callId" FROM "callSessions" WHERE "linkedid" LIKE 'demo-ai-%');
DELETE FROM "callRecordings"    WHERE "linkedid" LIKE 'demo-ai-%';
DELETE FROM "callSessions"      WHERE "linkedid" LIKE 'demo-ai-%';

-- 1) 상담분류 (없을 때만)
INSERT INTO "consultCategories" ("categoryId", "tenantId", "level", "code", "name", "sortOrder", "updatedAt")
VALUES
  (gen_random_uuid(), :'tenant'::uuid, 1, 'DEMO_DISPATCH',  '배차 문의',   10, now()),
  (gen_random_uuid(), :'tenant'::uuid, 1, 'DEMO_FARE',      '요금 문의',   20, now()),
  (gen_random_uuid(), :'tenant'::uuid, 1, 'DEMO_CANCEL',    '취소·변경',   30, now()),
  (gen_random_uuid(), :'tenant'::uuid, 1, 'DEMO_COMPLAINT', '불만·민원',   40, now()),
  (gen_random_uuid(), :'tenant'::uuid, 1, 'DEMO_DRIVER',    '기사 문의',   50, now()),
  (gen_random_uuid(), :'tenant'::uuid, 1, 'DEMO_ETC',       '기타',        60, now())
ON CONFLICT ("tenantId", "code") DO NOTHING;

-- 2) 세션: 14일 × 30건, 08~22시 (KST), 통화 1~10분
CREATE TEMP TABLE demo_calls ON COMMIT DROP AS
WITH agents AS (
  SELECT array_agg("agentId") AS ids
  FROM "agents" WHERE "tenantId" = :'tenant'::uuid AND "isActive" AND "role" = 'agent'
),
gen AS (
  SELECT
    d AS day_age,
    n,
    (date_trunc('day', now() AT TIME ZONE 'Asia/Seoul') - (d || ' days')::interval
       + (8 + floor(random() * 14))::int * interval '1 hour'
       + floor(random() * 60)::int * interval '1 minute') AT TIME ZONE 'Asia/Seoul' AS started_at,
    (60 + floor(random() * 540))::int AS talk_seconds,
    random() AS r_sent,
    random() AS r_cat
  FROM generate_series(0, 13) AS d,
       generate_series(1, 30) AS n
)
SELECT
  gen_random_uuid() AS call_id,
  gen_random_uuid() AS recording_id,
  gen_random_uuid() AS transcript_id,
  'demo-ai-' || lpad((day_age * 100 + n)::text, 5, '0') AS linkedid,
  started_at,
  talk_seconds,
  day_age,
  (SELECT ids[1 + floor(random() * cardinality(ids))::int] FROM agents) AS agent_id,
  -- 최근 3일은 부정이 늘어난다 (감정 추이가 움직여 보이게)
  CASE
    WHEN r_sent < (CASE WHEN day_age <= 2 THEN 0.32 ELSE 0.14 END) THEN 'NEGATIVE'
    WHEN r_sent < (CASE WHEN day_age <= 2 THEN 0.62 ELSE 0.50 END) THEN 'NEUTRAL'
    ELSE 'POSITIVE'
  END AS sentiment,
  r_cat
FROM gen
WHERE started_at < now();

INSERT INTO "callSessions" (
  "callId", "tenantId", "linkedid", "direction", "ani", "aniNormalized", "dnis", "didNumber", "trunkName",
  "queueId", "queueName", "primaryAgentId", "sessionStatus", "resultCode", "resultDetail",
  "recordingFlag", "recordingFinalizationStatus", "recordingFinalizedAt",
  "startedAt", "queuedAt", "ringingAt", "answeredAt", "endedAt",
  "waitSeconds", "ringSeconds", "talkSeconds", "acwSeconds", "createdAt", "updatedAt"
)
SELECT
  call_id, :'tenant'::uuid, linkedid, 'inbound',
  '010' || lpad(floor(random() * 100000000)::text, 8, '0'),
  '010' || lpad(floor(random() * 100000000)::text, 8, '0'),
  '07052346382', '07052346382', 'trunk-demo',
  '00000000-0000-0000-0000-000000000101'::uuid, 'sales', agent_id, 'ENDED', 'DEMO_AI', 'AI 인사이트 시연 데이터',
  true, 'FINALIZED', started_at + (talk_seconds + 40) * interval '1 second' + interval '60 seconds',
  started_at, started_at + interval '2 seconds', started_at + interval '20 seconds', started_at + interval '40 seconds',
  started_at + (talk_seconds + 40) * interval '1 second',
  18, 20, talk_seconds, 15, started_at, started_at
FROM demo_calls;

-- 3) 녹취 (파일 없음) + 완료된 분석 job
INSERT INTO "callRecordings" (
  "recordingId", "callId", "tenantId", "linkedid", "recordingType", "filePath", "fileName", "fileFormat",
  "durationSeconds", "recordingStatus", "encryptionStatus", "recordingStartedAt", "recordingEndedAt", "finalizedAt", "updatedAt"
)
SELECT
  recording_id, call_id, :'tenant'::uuid, linkedid, 'mixmonitor',
  '/var/spool/asterisk/monitor/demo/' || linkedid || '.wav', linkedid || '.wav', 'wav',
  talk_seconds, 'READY', 'NONE',
  started_at + interval '40 seconds', started_at + (talk_seconds + 40) * interval '1 second',
  started_at + (talk_seconds + 40) * interval '1 second' + interval '60 seconds', now()
FROM demo_calls;

INSERT INTO "callAnalysisJobs" ("callAnalysisJobId", "tenantId", "callId", "recordingId", "stage", "status", "attempts", "nextAttemptAt", "updatedAt")
SELECT gen_random_uuid(), :'tenant'::uuid, call_id, recording_id, 'ANALYZE', 'COMPLETED', 1, now(), now()
FROM demo_calls;

-- 4) 전사문 (모의)
INSERT INTO "callTranscripts" ("transcriptId", "tenantId", "callId", "recordingId", "provider", "modelName", "language", "fullText", "durationSeconds", "status", "updatedAt")
SELECT transcript_id, :'tenant'::uuid, call_id, recording_id, 'demo', 'demo-seed', 'ko',
       '시연용 모의 전사문입니다. 실제 통화 내용이 아닙니다.', talk_seconds, 'READY', now()
FROM demo_calls;

-- 5) 분석 결과: 분류는 감정과 상관되게, 키워드는 날짜에 따라 (오늘 '앱 오류'·'결제 실패' 급상승, 최근 7일 '야간할증')
INSERT INTO "callAnalyses" ("analysisId", "tenantId", "callId", "transcriptId", "summary", "sentiment", "sentimentScore", "categoryId", "keywords", "riskFlags", "provider", "modelName", "createdAt", "updatedAt")
SELECT
  gen_random_uuid(), :'tenant'::uuid, c.call_id, c.transcript_id,
  '모의 요약: ' || cat.name || ' 관련 통화 (' || c.talk_seconds || '초)',
  c.sentiment,
  CASE c.sentiment WHEN 'POSITIVE' THEN 0.4 + random() * 0.5 WHEN 'NEGATIVE' THEN -0.9 + random() * 0.5 ELSE -0.15 + random() * 0.3 END,
  cat."categoryId",
  kw.keywords,
  CASE WHEN c.sentiment = 'NEGATIVE' AND random() < 0.3 THEN '["ESCALATION"]'::jsonb ELSE '[]'::jsonb END,
  'demo', 'demo-seed',
  c.started_at + (c.talk_seconds + 300) * interval '1 second',
  now()
FROM demo_calls c
JOIN LATERAL (
  SELECT "categoryId", "name" FROM "consultCategories"
  WHERE "tenantId" = :'tenant'::uuid AND "code" =
    CASE
      WHEN c.sentiment = 'NEGATIVE' AND c.r_cat < 0.55 THEN 'DEMO_COMPLAINT'
      WHEN c.r_cat < 0.30 THEN 'DEMO_DISPATCH'
      WHEN c.r_cat < 0.50 THEN 'DEMO_FARE'
      WHEN c.r_cat < 0.65 THEN 'DEMO_CANCEL'
      WHEN c.r_cat < 0.80 THEN 'DEMO_DRIVER'
      WHEN c.r_cat < 0.90 THEN 'DEMO_COMPLAINT'
      ELSE 'DEMO_ETC'
    END
) cat ON true
JOIN LATERAL (
  SELECT jsonb_agg(DISTINCT k) AS keywords
  FROM (
    SELECT (ARRAY['배차','지연','요금','취소','기사','친절','대기','예약','위치','도착시간','환불','카드결제','콜 취소','재배차','안내'])
             [1 + floor(random() * 15)::int] AS k
    FROM generate_series(1, 3)
    UNION ALL
    SELECT '야간할증' WHERE c.day_age <= 6 AND random() < 0.35
    UNION ALL
    SELECT '앱 오류'  WHERE c.day_age = 0 AND random() < 0.45
    UNION ALL
    SELECT '결제 실패' WHERE c.day_age = 0 AND random() < 0.30
  ) s
) kw ON true;

COMMIT;

SELECT
  (SELECT count(*) FROM "callSessions" WHERE "linkedid" LIKE 'demo-ai-%')   AS demo_sessions,
  (SELECT count(*) FROM "callAnalyses" a JOIN "callSessions" s ON s."callId" = a."callId" WHERE s."linkedid" LIKE 'demo-ai-%') AS demo_analyses,
  (SELECT count(*) FROM "consultCategories" WHERE "code" LIKE 'DEMO_%')      AS demo_categories;
