CREATE TABLE `IntegrationSyncLog` (
  `id` VARCHAR(191) NOT NULL,
  `companyId` VARCHAR(191) NOT NULL,
  `credentialId` VARCHAR(191) NULL,
  `direction` VARCHAR(191) NOT NULL DEFAULT 'inbound',
  `entityType` VARCHAR(191) NOT NULL DEFAULT 'job',
  `entityKey` VARCHAR(191) NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'success',
  `requestBody` JSON NULL,
  `responseBody` JSON NULL,
  `errorMessage` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `IntegrationSyncLog_companyId_createdAt_idx`(`companyId`, `createdAt`),
  INDEX `IntegrationSyncLog_companyId_status_idx`(`companyId`, `status`),
  INDEX `IntegrationSyncLog_credentialId_idx`(`credentialId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `IntegrationSyncLog`
  ADD CONSTRAINT `IntegrationSyncLog_companyId_fkey`
  FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
