-- Phase 4D: normalize Job.contactsJson into a relational contact table

CREATE TABLE `JobContact` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `jobId` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NULL,
    `number` VARCHAR(191) NULL,
    `designation` VARCHAR(191) NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `JobContact_companyId_jobId_sortOrder_idx`(`companyId`, `jobId`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `JobContact`
  ADD CONSTRAINT `JobContact_companyId_fkey`
    FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `JobContact_jobId_fkey`
    FOREIGN KEY (`companyId`, `jobId`) REFERENCES `Job`(`companyId`, `id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO `JobContact` (
  `id`,
  `companyId`,
  `jobId`,
  `label`,
  `name`,
  `email`,
  `number`,
  `designation`,
  `sortOrder`,
  `createdAt`,
  `updatedAt`
)
SELECT
  REPLACE(UUID(), '-', '') AS `id`,
  src.`companyId`,
  src.`jobId`,
  src.`label`,
  src.`name`,
  src.`email`,
  src.`number`,
  src.`designation`,
  src.`sortOrder`,
  NOW(3) AS `createdAt`,
  NOW(3) AS `updatedAt`
FROM (
  SELECT
    j.`companyId`,
    j.`id` AS `jobId`,
    NULLIF(TRIM(COALESCE(jt.`label`, '')), '') AS `label`,
    TRIM(COALESCE(jt.`name`, '')) AS `name`,
    NULLIF(TRIM(COALESCE(jt.`email`, '')), '') AS `email`,
    NULLIF(TRIM(COALESCE(jt.`number`, '')), '') AS `number`,
    NULLIF(TRIM(COALESCE(jt.`designation`, '')), '') AS `designation`,
    jt.`ordinality` - 1 AS `sortOrder`
  FROM `Job` j
  JOIN JSON_TABLE(
    COALESCE(j.`contactsJson`, JSON_ARRAY()),
    '$[*]' COLUMNS (
      `ordinality` FOR ORDINALITY,
      `label` VARCHAR(191) PATH '$.label' NULL ON EMPTY,
      `name` VARCHAR(191) PATH '$.name' NULL ON EMPTY,
      `email` VARCHAR(191) PATH '$.email' NULL ON EMPTY,
      `number` VARCHAR(191) PATH '$.number' NULL ON EMPTY,
      `designation` VARCHAR(191) PATH '$.designation' NULL ON EMPTY
    )
  ) jt
) src
WHERE src.`name` <> '';

ALTER TABLE `Job` DROP COLUMN `contactsJson`;
