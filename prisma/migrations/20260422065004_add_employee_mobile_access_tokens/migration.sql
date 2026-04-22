-- CreateTable
CREATE TABLE `EmployeeMobileAccessToken` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `tokenLabel` VARCHAR(191) NULL,
    `tokenPrefix` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NULL,
    `lastUsedAt` DATETIME(3) NULL,
    `revokedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `EmployeeMobileAccessToken_companyId_employeeId_idx`(`companyId`, `employeeId`),
    INDEX `EmployeeMobileAccessToken_userId_revokedAt_idx`(`userId`, `revokedAt`),
    UNIQUE INDEX `EmployeeMobileAccessToken_companyId_tokenPrefix_key`(`companyId`, `tokenPrefix`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `EmployeeMobileAccessToken` ADD CONSTRAINT `EmployeeMobileAccessToken_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmployeeMobileAccessToken` ADD CONSTRAINT `EmployeeMobileAccessToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmployeeMobileAccessToken` ADD CONSTRAINT `EmployeeMobileAccessToken_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
