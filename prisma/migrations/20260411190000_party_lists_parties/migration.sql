-- Party lists API sync + local-only delete rules
-- Drop legacy unique on name (sync may introduce naming overlap with locals; index name retained for lookups)

DROP INDEX `Customer_companyId_name_key` ON `Customer`;

ALTER TABLE `Customer`
    ADD COLUMN `source` ENUM('LOCAL', 'PARTY_API_SYNC') NOT NULL DEFAULT 'LOCAL',
    ADD COLUMN `externalPartyId` INTEGER NULL,
    ADD COLUMN `externalSyncedAt` DATETIME(3) NULL,
    ADD COLUMN `tradeLicenseNumber` VARCHAR(191) NULL,
    ADD COLUMN `tradeLicenseAuthority` VARCHAR(255) NULL,
    ADD COLUMN `tradeLicenseExpiry` DATETIME(3) NULL,
    ADD COLUMN `trnNumber` VARCHAR(191) NULL,
    ADD COLUMN `trnExpiry` DATETIME(3) NULL,
    ADD COLUMN `contactsJson` JSON NULL;

CREATE UNIQUE INDEX `Customer_companyId_externalPartyId_key` ON `Customer`(`companyId`, `externalPartyId`);
CREATE INDEX `Customer_companyId_name_idx` ON `Customer`(`companyId`, `name`);
CREATE INDEX `Customer_companyId_source_idx` ON `Customer`(`companyId`, `source`);

DROP INDEX `Supplier_companyId_name_key` ON `Supplier`;

ALTER TABLE `Supplier`
    ADD COLUMN `source` ENUM('LOCAL', 'PARTY_API_SYNC') NOT NULL DEFAULT 'LOCAL',
    ADD COLUMN `externalPartyId` INTEGER NULL,
    ADD COLUMN `externalSyncedAt` DATETIME(3) NULL,
    ADD COLUMN `tradeLicenseNumber` VARCHAR(191) NULL,
    ADD COLUMN `tradeLicenseAuthority` VARCHAR(255) NULL,
    ADD COLUMN `tradeLicenseExpiry` DATETIME(3) NULL,
    ADD COLUMN `trnNumber` VARCHAR(191) NULL,
    ADD COLUMN `trnExpiry` DATETIME(3) NULL,
    ADD COLUMN `contactsJson` JSON NULL;

CREATE UNIQUE INDEX `Supplier_companyId_externalPartyId_key` ON `Supplier`(`companyId`, `externalPartyId`);
CREATE INDEX `Supplier_companyId_name_idx` ON `Supplier`(`companyId`, `name`);
CREATE INDEX `Supplier_companyId_source_idx` ON `Supplier`(`companyId`, `source`);

ALTER TABLE `StockBatch` ADD COLUMN `supplierId` VARCHAR(191) NULL;
CREATE INDEX `StockBatch_supplierId_idx` ON `StockBatch`(`supplierId`);
ALTER TABLE `StockBatch` ADD CONSTRAINT `StockBatch_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `Supplier`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
