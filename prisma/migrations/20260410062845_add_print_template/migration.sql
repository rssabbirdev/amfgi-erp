-- DropForeignKey
ALTER TABLE `MaterialLog` DROP FOREIGN KEY `MaterialLog_companyId_fkey`;

-- DropForeignKey
ALTER TABLE `PriceLog` DROP FOREIGN KEY `PriceLog_companyId_fkey`;

-- AlterTable
ALTER TABLE `Company` ADD COLUMN `address` TEXT NULL,
    ADD COLUMN `email` VARCHAR(191) NULL,
    ADD COLUMN `letterheadDriveId` VARCHAR(191) NULL,
    ADD COLUMN `letterheadUrl` VARCHAR(191) NULL,
    ADD COLUMN `phone` VARCHAR(191) NULL,
    ADD COLUMN `printTemplate` JSON NULL;

-- AlterTable
ALTER TABLE `Transaction` ADD COLUMN `signedCopyDriveId` VARCHAR(191) NULL,
    ADD COLUMN `signedCopyUrl` VARCHAR(191) NULL;
