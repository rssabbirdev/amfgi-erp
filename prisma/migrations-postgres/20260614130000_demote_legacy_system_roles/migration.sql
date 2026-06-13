-- Manager, Store Keeper, and HR are custom roles — only Admin and Employee self-service stay protected.
UPDATE "Role"
SET "isSystem" = false
WHERE "slug" IN ('manager', 'store-keeper', 'hr')
  AND "isSystem" = true;
