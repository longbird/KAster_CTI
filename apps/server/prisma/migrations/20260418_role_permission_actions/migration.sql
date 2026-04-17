ALTER TABLE "rolePermissions"
  ADD COLUMN "canView" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN "canCreate" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "canUpdate" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "canDelete" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "canOperate" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "canExport" BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE "rolePermissions"
SET
  "canView" = "canAccess",
  "canCreate" = "canAccess",
  "canUpdate" = "canAccess",
  "canDelete" = "canAccess",
  "canOperate" = "canAccess",
  "canExport" = CASE
    WHEN "menuKey" LIKE 'reports/%' THEN "canAccess"
    ELSE FALSE
  END;
