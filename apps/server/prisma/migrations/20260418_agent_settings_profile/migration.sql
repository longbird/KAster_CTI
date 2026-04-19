ALTER TABLE "agents"
  ADD COLUMN IF NOT EXISTS "settingsProfile" JSONB;
