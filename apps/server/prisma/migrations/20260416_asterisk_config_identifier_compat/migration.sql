DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'agents'
      AND column_name = 'sip_password'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'agents'
      AND column_name = 'sipPassword'
  ) THEN
    ALTER TABLE "agents" RENAME COLUMN "sip_password" TO "sipPassword";
  END IF;
END;
$$;
