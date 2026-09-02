-- 통화 후 AI 분석: 상담분류 + 전문(STT) + 분석 결과 + 분석 job
-- 분석은 녹취 finalize 이후 별도 sweep 이 돌린다. CALL_ANALYSIS_ENABLED 기본값이 false 라
-- 이 마이그레이션만으로는 기존 운영 동작이 바뀌지 않는다.

CREATE TABLE "consultCategories" (
  "categoryId" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "parentCategoryId" UUID,
  "level" INTEGER NOT NULL DEFAULT 1,
  "code" VARCHAR(64) NOT NULL,
  "name" VARCHAR(128) NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "consultCategories_pkey" PRIMARY KEY ("categoryId")
);

CREATE UNIQUE INDEX "consultCategories_tenantId_code_key"
  ON "consultCategories" ("tenantId", "code");
CREATE INDEX "consultCategories_tenantId_parentCategoryId_sortOrder_idx"
  ON "consultCategories" ("tenantId", "parentCategoryId", "sortOrder");

CREATE TABLE "callTranscripts" (
  "transcriptId" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "callId" UUID NOT NULL,
  "recordingId" UUID NOT NULL,
  "provider" VARCHAR(32) NOT NULL,
  "modelName" VARCHAR(128),
  "language" VARCHAR(16) NOT NULL DEFAULT 'ko',
  "fullText" TEXT NOT NULL,
  "durationSeconds" INTEGER NOT NULL DEFAULT 0,
  "confidence" DOUBLE PRECISION,
  "status" VARCHAR(32) NOT NULL DEFAULT 'READY',
  "failureReason" TEXT,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "callTranscripts_pkey" PRIMARY KEY ("transcriptId")
);

CREATE UNIQUE INDEX "callTranscripts_tenantId_callId_recordingId_key"
  ON "callTranscripts" ("tenantId", "callId", "recordingId");
CREATE INDEX "callTranscripts_tenantId_callId_idx"
  ON "callTranscripts" ("tenantId", "callId");

CREATE TABLE "callTranscriptSegments" (
  "segmentId" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "transcriptId" UUID NOT NULL,
  "speaker" VARCHAR(16) NOT NULL DEFAULT 'UNKNOWN',
  "startMs" INTEGER NOT NULL DEFAULT 0,
  "endMs" INTEGER NOT NULL DEFAULT 0,
  "text" TEXT NOT NULL,
  "confidence" DOUBLE PRECISION,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "callTranscriptSegments_pkey" PRIMARY KEY ("segmentId")
);

CREATE INDEX "callTranscriptSegments_transcriptId_startMs_idx"
  ON "callTranscriptSegments" ("transcriptId", "startMs");
CREATE INDEX "callTranscriptSegments_tenantId_transcriptId_idx"
  ON "callTranscriptSegments" ("tenantId", "transcriptId");

CREATE TABLE "callAnalyses" (
  "analysisId" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "callId" UUID NOT NULL,
  "transcriptId" UUID NOT NULL,
  "summary" TEXT NOT NULL,
  "sentiment" VARCHAR(16) NOT NULL DEFAULT 'NEUTRAL',
  "sentimentScore" DOUBLE PRECISION,
  "categoryId" UUID,
  "keywords" JSONB,
  "riskFlags" JSONB,
  "provider" VARCHAR(32) NOT NULL,
  "modelName" VARCHAR(128),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "callAnalyses_pkey" PRIMARY KEY ("analysisId")
);

CREATE UNIQUE INDEX "callAnalyses_tenantId_callId_key"
  ON "callAnalyses" ("tenantId", "callId");
CREATE INDEX "callAnalyses_tenantId_sentiment_idx"
  ON "callAnalyses" ("tenantId", "sentiment");
CREATE INDEX "callAnalyses_tenantId_categoryId_idx"
  ON "callAnalyses" ("tenantId", "categoryId");

CREATE TABLE "callAnalysisJobs" (
  "callAnalysisJobId" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "callId" UUID NOT NULL,
  "recordingId" UUID NOT NULL,
  "stage" VARCHAR(16) NOT NULL DEFAULT 'TRANSCRIBE',
  "status" VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastError" TEXT,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "callAnalysisJobs_pkey" PRIMARY KEY ("callAnalysisJobId")
);

CREATE UNIQUE INDEX "callAnalysisJobs_tenantId_callId_recordingId_key"
  ON "callAnalysisJobs" ("tenantId", "callId", "recordingId");
CREATE INDEX "callAnalysisJobs_tenantId_status_nextAttemptAt_idx"
  ON "callAnalysisJobs" ("tenantId", "status", "nextAttemptAt");

ALTER TABLE "consultCategories"
    ADD CONSTRAINT "consultCategories_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "consultCategories"
    ADD CONSTRAINT "consultCategories_parentCategoryId_fkey"
    FOREIGN KEY ("parentCategoryId") REFERENCES "consultCategories"("categoryId") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "callTranscripts"
    ADD CONSTRAINT "callTranscripts_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "callTranscripts"
    ADD CONSTRAINT "callTranscripts_callId_fkey"
    FOREIGN KEY ("callId") REFERENCES "callSessions"("callId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "callTranscripts"
    ADD CONSTRAINT "callTranscripts_recordingId_fkey"
    FOREIGN KEY ("recordingId") REFERENCES "callRecordings"("recordingId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "callTranscriptSegments"
    ADD CONSTRAINT "callTranscriptSegments_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "callTranscriptSegments"
    ADD CONSTRAINT "callTranscriptSegments_transcriptId_fkey"
    FOREIGN KEY ("transcriptId") REFERENCES "callTranscripts"("transcriptId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "callAnalyses"
    ADD CONSTRAINT "callAnalyses_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "callAnalyses"
    ADD CONSTRAINT "callAnalyses_callId_fkey"
    FOREIGN KEY ("callId") REFERENCES "callSessions"("callId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "callAnalyses"
    ADD CONSTRAINT "callAnalyses_transcriptId_fkey"
    FOREIGN KEY ("transcriptId") REFERENCES "callTranscripts"("transcriptId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "callAnalyses"
    ADD CONSTRAINT "callAnalyses_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "consultCategories"("categoryId") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "callAnalysisJobs"
    ADD CONSTRAINT "callAnalysisJobs_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "callAnalysisJobs"
    ADD CONSTRAINT "callAnalysisJobs_callId_fkey"
    FOREIGN KEY ("callId") REFERENCES "callSessions"("callId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "callAnalysisJobs"
    ADD CONSTRAINT "callAnalysisJobs_recordingId_fkey"
    FOREIGN KEY ("recordingId") REFERENCES "callRecordings"("recordingId") ON DELETE CASCADE ON UPDATE CASCADE;
