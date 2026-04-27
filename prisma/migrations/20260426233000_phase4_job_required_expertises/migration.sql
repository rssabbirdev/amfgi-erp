-- Phase 4B: normalize Job.requiredExpertises into a relational join table

CREATE UNIQUE INDEX `WorkforceExpertise_companyId_id_key` ON `WorkforceExpertise`(`companyId`, `id`);

CREATE TABLE `JobRequiredExpertise` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `jobId` VARCHAR(191) NOT NULL,
    `expertiseId` VARCHAR(191) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `JobRequiredExpertise_jobId_expertiseId_key`(`jobId`, `expertiseId`),
    INDEX `JobRequiredExpertise_companyId_jobId_sortOrder_idx`(`companyId`, `jobId`, `sortOrder`),
    INDEX `JobRequiredExpertise_companyId_expertiseId_idx`(`companyId`, `expertiseId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `JobRequiredExpertise`
  ADD CONSTRAINT `JobRequiredExpertise_companyId_fkey`
    FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `JobRequiredExpertise_jobId_fkey`
    FOREIGN KEY (`companyId`, `jobId`) REFERENCES `Job`(`companyId`, `id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `JobRequiredExpertise_expertiseId_fkey`
    FOREIGN KEY (`companyId`, `expertiseId`) REFERENCES `WorkforceExpertise`(`companyId`, `id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO `WorkforceExpertise` (`id`, `companyId`, `name`, `isActive`, `sortOrder`, `createdAt`, `updatedAt`)
SELECT
  REPLACE(UUID(), '-', '') AS `id`,
  src.`companyId`,
  src.`name`,
  true AS `isActive`,
  0 AS `sortOrder`,
  NOW(3) AS `createdAt`,
  NOW(3) AS `updatedAt`
FROM (
  SELECT DISTINCT
    j.`companyId`,
    TRIM(jt.`expertiseName`) AS `name`
  FROM `Job` j
  JOIN JSON_TABLE(
    COALESCE(j.`requiredExpertises`, JSON_ARRAY()),
    '$[*]' COLUMNS (
      `expertiseName` VARCHAR(191) PATH '$'
    )
  ) jt
) src
LEFT JOIN `WorkforceExpertise` we
  ON we.`companyId` = src.`companyId`
 AND we.`name` = (src.`name` COLLATE utf8mb4_unicode_ci)
WHERE src.`name` IS NOT NULL
  AND src.`name` <> ''
  AND we.`id` IS NULL;

INSERT INTO `JobRequiredExpertise` (`id`, `companyId`, `jobId`, `expertiseId`, `sortOrder`, `createdAt`, `updatedAt`)
SELECT
  REPLACE(UUID(), '-', '') AS `id`,
  src.`companyId`,
  src.`jobId`,
  we.`id` AS `expertiseId`,
  MIN(src.`ordinality`) - 1 AS `sortOrder`,
  NOW(3) AS `createdAt`,
  NOW(3) AS `updatedAt`
FROM (
  SELECT
    j.`companyId`,
    j.`id` AS `jobId`,
    jt.`ordinality`,
    TRIM(jt.`expertiseName`) AS `expertiseName`
  FROM `Job` j
  JOIN JSON_TABLE(
    COALESCE(j.`requiredExpertises`, JSON_ARRAY()),
    '$[*]' COLUMNS (
      `ordinality` FOR ORDINALITY,
      `expertiseName` VARCHAR(191) PATH '$'
    )
  ) jt
) src
JOIN `WorkforceExpertise` we
  ON we.`companyId` = src.`companyId`
 AND we.`name` = (src.`expertiseName` COLLATE utf8mb4_unicode_ci)
WHERE src.`expertiseName` IS NOT NULL
  AND src.`expertiseName` <> ''
GROUP BY src.`companyId`, src.`jobId`, we.`id`;

ALTER TABLE `Job` DROP COLUMN `requiredExpertises`;
