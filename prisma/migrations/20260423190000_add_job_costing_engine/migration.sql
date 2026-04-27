-- AlterTable
ALTER TABLE `Company`
  ADD COLUMN `jobCostingSettings` JSON NULL;

-- CreateTable
CREATE TABLE `FormulaLibrary` (
  `id` VARCHAR(191) NOT NULL,
  `companyId` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `slug` VARCHAR(191) NOT NULL,
  `fabricationType` VARCHAR(191) NOT NULL,
  `description` TEXT NULL,
  `specificationSchema` JSON NULL,
  `formulaConfig` JSON NOT NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `createdBy` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `FormulaLibrary_companyId_slug_key`(`companyId`, `slug`),
  INDEX `FormulaLibrary_companyId_fabricationType_isActive_idx`(`companyId`, `fabricationType`, `isActive`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `JobItem` (
  `id` VARCHAR(191) NOT NULL,
  `companyId` VARCHAR(191) NOT NULL,
  `jobId` VARCHAR(191) NOT NULL,
  `formulaLibraryId` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `description` TEXT NULL,
  `specifications` JSON NOT NULL,
  `assignedEmployeeIds` JSON NULL,
  `sortOrder` INTEGER NOT NULL DEFAULT 0,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `createdBy` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `JobItem_companyId_jobId_isActive_idx`(`companyId`, `jobId`, `isActive`),
  INDEX `JobItem_companyId_formulaLibraryId_idx`(`companyId`, `formulaLibraryId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `FormulaLibrary`
  ADD CONSTRAINT `FormulaLibrary_companyId_fkey`
  FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `JobItem`
  ADD CONSTRAINT `JobItem_companyId_fkey`
  FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `JobItem`
  ADD CONSTRAINT `JobItem_jobId_fkey`
  FOREIGN KEY (`jobId`) REFERENCES `Job`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `JobItem`
  ADD CONSTRAINT `JobItem_formulaLibraryId_fkey`
  FOREIGN KEY (`formulaLibraryId`) REFERENCES `FormulaLibrary`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;
