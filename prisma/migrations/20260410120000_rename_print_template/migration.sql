-- AlterTable
ALTER TABLE `Company` ADD COLUMN `printTemplates` JSON NULL;

-- Migrate data: wrap printTemplate JSON in array if it exists
UPDATE `Company` 
SET `printTemplates` = JSON_ARRAY(`printTemplate`)
WHERE `printTemplate` IS NOT NULL;

-- AlterTable (drop old column)
ALTER TABLE `Company` DROP COLUMN `printTemplate`;
