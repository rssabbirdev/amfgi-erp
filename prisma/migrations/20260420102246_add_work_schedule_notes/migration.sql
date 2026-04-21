-- DropIndex
DROP INDEX `MaterialLog_companyId_materialId_timestamp_idx` ON `materiallog`;

-- DropIndex
DROP INDEX `PriceLog_companyId_materialId_timestamp_idx` ON `pricelog`;

-- AlterTable
ALTER TABLE `workschedule` ADD COLUMN `notes` TEXT NULL;

-- CreateIndex
CREATE INDEX `MaterialLog_companyId_materialId_timestamp_idx` ON `MaterialLog`(`companyId`, `materialId`, `timestamp`);

-- CreateIndex
CREATE INDEX `PriceLog_companyId_materialId_timestamp_idx` ON `PriceLog`(`companyId`, `materialId`, `timestamp`);
