-- Add new printTemplates column
ALTER TABLE Company ADD COLUMN printTemplates JSON NULL AFTER letterheadUrl;

-- Migrate data: wrap printTemplate JSON in array if it exists
UPDATE Company 
SET printTemplates = JSON_ARRAY(printTemplate)
WHERE printTemplate IS NOT NULL;

-- Drop old column
ALTER TABLE Company DROP COLUMN printTemplate;
