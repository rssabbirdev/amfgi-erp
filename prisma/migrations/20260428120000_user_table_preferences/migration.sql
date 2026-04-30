CREATE TABLE `UserTablePreference` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `companyId` VARCHAR(191) NOT NULL,
  `key` VARCHAR(191) NOT NULL,
  `state` JSON NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE UNIQUE INDEX `UserTablePreference_userId_companyId_key_key`
  ON `UserTablePreference`(`userId`, `companyId`, `key`);

CREATE INDEX `UserTablePreference_companyId_key_idx`
  ON `UserTablePreference`(`companyId`, `key`);

ALTER TABLE `UserTablePreference`
  ADD CONSTRAINT `UserTablePreference_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `User`(`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  ADD CONSTRAINT `UserTablePreference_companyId_fkey`
    FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE;
