DO $$
BEGIN
  IF to_regclass('public."tenantSystemSettings"') IS NOT NULL THEN
    ALTER TABLE "tenantSystemSettings"
    ADD COLUMN IF NOT EXISTS "defaultSipPassword" TEXT;
  END IF;
END;
$$;
