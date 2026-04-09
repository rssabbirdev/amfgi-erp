-- AlterTable
ALTER TABLE `job` ADD COLUMN `finishedGoods` JSON NULL,
    ADD COLUMN `jobWorkValue` DOUBLE NULL,
    ADD COLUMN `lpoNumber` VARCHAR(191) NULL,
    ADD COLUMN `projectDetails` TEXT NULL,
    ADD COLUMN `projectName` VARCHAR(191) NULL,
    ADD COLUMN `quotationNumber` VARCHAR(191) NULL;
