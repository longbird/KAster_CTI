ALTER TABLE "tenantSystemSettings"
  ADD COLUMN IF NOT EXISTS "recordingChannelMode" VARCHAR(16) NOT NULL DEFAULT 'MONO';
