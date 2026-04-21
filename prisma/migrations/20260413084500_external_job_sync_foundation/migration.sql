-- Company external mapping id
ALTER TABLE `Company`
  ADD COLUMN `externalCompanyId` VARCHAR(191) NULL;

-- Integration credential table
CREATE TABLE `ApiCredential` (
  `id` VARCHAR(191) NOT NULL,
  `companyId` VARCHAR(191) NOT NULL,
  `label` VARCHAR(191) NOT NULL,
  `keyPrefix` VARCHAR(191) NOT NULL,
  `keyHash` VARCHAR(191) NOT NULL,
  `scopes` JSON NULL,
  `lastUsedAt` DATETIME(3) NULL,
  `revokedAt` DATETIME(3) NULL,
  `createdBy` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `ApiCredential_companyId_keyPrefix_key`(`companyId`, `keyPrefix`),
  INDEX `ApiCredential_companyId_revokedAt_idx`(`companyId`, `revokedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Job LPO value history table
CREATE TABLE `JobLpoValueHistory` (
  `id` VARCHAR(191) NOT NULL,
  `companyId` VARCHAR(191) NOT NULL,
  `jobId` VARCHAR(191) NOT NULL,
  `previousValue` DOUBLE NULL,
  `newValue` DOUBLE NULL,
  `changedBy` VARCHAR(191) NOT NULL,
  `source` VARCHAR(191) NOT NULL DEFAULT 'manual',
  `note` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `JobLpoValueHistory_companyId_createdAt_idx`(`companyId`, `createdAt`),
  INDEX `JobLpoValueHistory_jobId_createdAt_idx`(`jobId`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Extend jobs for external sync payload
ALTER TABLE `Job`
  ADD COLUMN `externalJobId` VARCHAR(191) NULL,
  ADD COLUMN `address` TEXT NULL,
  ADD COLUMN `locationName` VARCHAR(191) NULL,
  ADD COLUMN `locationLat` DOUBLE NULL,
  ADD COLUMN `locationLng` DOUBLE NULL,
  ADD COLUMN `quotationDate` DATETIME(3) NULL,
  ADD COLUMN `lpoDate` DATETIME(3) NULL,
  ADD COLUMN `lpoValue` DOUBLE NULL,
  ADD COLUMN `contactsJson` JSON NULL,
  ADD COLUMN `salesPerson` VARCHAR(191) NULL,
  ADD COLUMN `source` ENUM('LOCAL','EXTERNAL_API') NOT NULL DEFAULT 'LOCAL',
  ADD COLUMN `externalUpdatedAt` DATETIME(3) NULL;

-- New unique constraints / indexes
CREATE UNIQUE INDEX `Company_externalCompanyId_key` ON `Company`(`externalCompanyId`);
CREATE UNIQUE INDEX `Job_companyId_externalJobId_key` ON `Job`(`companyId`, `externalJobId`);
CREATE INDEX `Job_companyId_source_idx` ON `Job`(`companyId`, `source`);

-- Foreign keys
ALTER TABLE `ApiCredential`
  ADD CONSTRAINT `ApiCredential_companyId_fkey`
    FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `JobLpoValueHistory`
  ADD CONSTRAINT `JobLpoValueHistory_companyId_fkey`
    FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `JobLpoValueHistory_jobId_fkey`
    FOREIGN KEY (`jobId`) REFERENCES `Job`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
