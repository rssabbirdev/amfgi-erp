-- Add required expertises field on Job
ALTER TABLE `Job`
ADD COLUMN `requiredExpertises` JSON NULL;

-- Create workforce expertise catalog per company
CREATE TABLE `WorkforceExpertise` (
  `id` VARCHAR(191) NOT NULL,
  `companyId` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `sortOrder` INTEGER NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `WorkforceExpertise_companyId_name_key`(`companyId`, `name`),
  INDEX `WorkforceExpertise_companyId_isActive_sortOrder_idx`(`companyId`, `isActive`, `sortOrder`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `WorkforceExpertise`
ADD CONSTRAINT `WorkforceExpertise_companyId_fkey`
FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
