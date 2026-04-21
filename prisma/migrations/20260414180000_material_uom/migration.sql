CREATE TABLE `MaterialUom` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `materialId` VARCHAR(191) NOT NULL,
    `unitId` VARCHAR(191) NOT NULL,
    `isBase` BOOLEAN NOT NULL DEFAULT false,
    `parentUomId` VARCHAR(191) NULL,
    `factorToParent` DOUBLE NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `MaterialUom_materialId_unitId_key`(`materialId`, `unitId`),
    INDEX `MaterialUom_companyId_materialId_idx`(`companyId`, `materialId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `MaterialUom` ADD CONSTRAINT `MaterialUom_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `MaterialUom` ADD CONSTRAINT `MaterialUom_materialId_fkey` FOREIGN KEY (`materialId`) REFERENCES `Material`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `MaterialUom` ADD CONSTRAINT `MaterialUom_unitId_fkey` FOREIGN KEY (`unitId`) REFERENCES `Unit`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `MaterialUom` ADD CONSTRAINT `MaterialUom_parentUomId_fkey` FOREIGN KEY (`parentUomId`) REFERENCES `MaterialUom`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO `MaterialUom` (`id`, `companyId`, `materialId`, `unitId`, `isBase`, `parentUomId`, `factorToParent`, `createdAt`, `updatedAt`)
SELECT REPLACE(UUID(), '-', ''), m.`companyId`, m.`id`, u.`id`, true, NULL, 1, NOW(3), NOW(3)
FROM `Material` m
INNER JOIN `Unit` u ON u.`companyId` = m.`companyId` AND u.`name` = m.`unit`;
