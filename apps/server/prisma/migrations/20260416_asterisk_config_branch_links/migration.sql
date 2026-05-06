-- These foreign keys depend on tables created by separate migrations whose
-- lexical order places branch mapping tables before branches and PBX DID
-- tables. Add the cross-table links once both sides exist.

DO $$
BEGIN
  IF to_regclass('public."branchDids"') IS NOT NULL
     AND to_regclass('public."branches"') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint WHERE conname = 'branchDids_branchId_fkey'
     ) THEN
    ALTER TABLE "branchDids"
      ADD CONSTRAINT "branchDids_branchId_fkey"
      FOREIGN KEY ("branchId") REFERENCES "branches"("branchId")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF to_regclass('public."branchDids"') IS NOT NULL
     AND to_regclass('public."AsteriskDid"') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint WHERE conname = 'branchDids_didId_fkey'
     ) THEN
    ALTER TABLE "branchDids"
      ADD CONSTRAINT "branchDids_didId_fkey"
      FOREIGN KEY ("didId") REFERENCES "AsteriskDid"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF to_regclass('public."branchAgents"') IS NOT NULL
     AND to_regclass('public."branches"') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint WHERE conname = 'branchAgents_branchId_fkey'
     ) THEN
    ALTER TABLE "branchAgents"
      ADD CONSTRAINT "branchAgents_branchId_fkey"
      FOREIGN KEY ("branchId") REFERENCES "branches"("branchId")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF to_regclass('public."branchQueues"') IS NOT NULL
     AND to_regclass('public."branches"') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint WHERE conname = 'branchQueues_branchId_fkey'
     ) THEN
    ALTER TABLE "branchQueues"
      ADD CONSTRAINT "branchQueues_branchId_fkey"
      FOREIGN KEY ("branchId") REFERENCES "branches"("branchId")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END;
$$;
