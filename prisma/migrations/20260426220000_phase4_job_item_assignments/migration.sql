-- Phase 4A: normalize JobItem assigned employees into a relational join table

CREATE UNIQUE INDEX `JobItem_companyId_id_key` ON `JobItem`(`companyId`, `id`);

CREATE TABLE `JobItemAssignment` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `jobItemId` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `JobItemAssignment_jobItemId_employeeId_key`(`jobItemId`, `employeeId`),
    INDEX `JobItemAssignment_companyId_jobItemId_sortOrder_idx`(`companyId`, `jobItemId`, `sortOrder`),
    INDEX `JobItemAssignment_companyId_employeeId_idx`(`companyId`, `employeeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `JobItemAssignment`
  ADD CONSTRAINT `JobItemAssignment_companyId_fkey`
    FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `JobItemAssignment_jobItemId_fkey`
    FOREIGN KEY (`companyId`, `jobItemId`) REFERENCES `JobItem`(`companyId`, `id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `JobItemAssignment_employeeId_fkey`
    FOREIGN KEY (`companyId`, `employeeId`) REFERENCES `Employee`(`companyId`, `id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO `JobItemAssignment` (`id`, `companyId`, `jobItemId`, `employeeId`, `sortOrder`, `createdAt`, `updatedAt`)
SELECT
  REPLACE(UUID(), '-', '') AS `id`,
  src.`companyId`,
  src.`jobItemId`,
  src.`employeeId`,
  MIN(src.`ordinality`) - 1 AS `sortOrder`,
  NOW(3) AS `createdAt`,
  NOW(3) AS `updatedAt`
FROM (
  SELECT
    ji.`companyId`,
    ji.`id` AS `jobItemId`,
    jt.`employeeId`,
    jt.`ordinality`
  FROM `JobItem` ji
  JOIN JSON_TABLE(
    COALESCE(ji.`assignedEmployeeIds`, JSON_ARRAY()),
    '$[*]' COLUMNS (
      `ordinality` FOR ORDINALITY,
      `employeeId` VARCHAR(191) PATH '$'
    )
  ) jt
) src
JOIN `Employee` e
  ON e.`companyId` = src.`companyId`
 AND e.`id` = (src.`employeeId` COLLATE utf8mb4_unicode_ci)
WHERE src.`employeeId` IS NOT NULL
  AND src.`employeeId` <> ''
GROUP BY src.`companyId`, src.`jobItemId`, src.`employeeId`;

ALTER TABLE `JobItem` DROP COLUMN `assignedEmployeeIds`;
