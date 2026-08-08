ALTER TABLE "callRecordings"
  ADD COLUMN IF NOT EXISTS "playbackFilePath" TEXT,
  ADD COLUMN IF NOT EXISTS "playbackFileFormat" VARCHAR(16),
  ADD COLUMN IF NOT EXISTS "playbackFileSizeBytes" BIGINT,
  ADD COLUMN IF NOT EXISTS "encryptedPlaybackFilePath" TEXT;
