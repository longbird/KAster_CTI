UPDATE "rolePermissions"
SET
  "canView" = "canAccess",
  "canCreate" = "canAccess",
  "canUpdate" = "canAccess",
  "canDelete" = "canAccess",
  "canOperate" = "canAccess",
  "canExport" = CASE WHEN "menuKey" LIKE 'reports/%' THEN "canAccess" ELSE FALSE END;
