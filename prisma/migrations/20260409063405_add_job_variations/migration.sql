-- AlterTable
ALTER TABLE `job` ADD COLUMN `parentJobId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `Job_parentJobId_idx` ON `Job`(`parentJobId`);

-- AddForeignKey
ALTER TABLE `Job` ADD CONSTRAINT `Job_parentJobId_fkey` FOREIGN KEY (`parentJobId`) REFERENCES `Job`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
