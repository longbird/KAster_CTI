DO $$
BEGIN
  IF to_regclass('public."tenantSystemSettings"') IS NOT NULL THEN
    ALTER TABLE "tenantSystemSettings"
    ADD COLUMN IF NOT EXISTS "sipRegisterPort" INTEGER NOT NULL DEFAULT 5060;
  END IF;
END;
$$;
