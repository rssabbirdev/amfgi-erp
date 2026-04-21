ALTER TABLE `IntegrationSyncLog`
  ADD COLUMN `idempotencyKey` VARCHAR(191) NULL,
  ADD COLUMN `requestHash` VARCHAR(191) NULL,
  ADD COLUMN `httpStatus` INTEGER NULL;

CREATE UNIQUE INDEX `IntegrationSyncLog_companyId_idempotencyKey_key`
  ON `IntegrationSyncLog`(`companyId`, `idempotencyKey`);
