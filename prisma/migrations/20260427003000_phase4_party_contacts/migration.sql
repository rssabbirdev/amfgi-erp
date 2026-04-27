-- Phase 4C: normalize Customer/Supplier contactsJson into relational contact tables

CREATE TABLE `CustomerContact` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `externalContactId` INTEGER NULL,
    `contactName` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `externalCreatedAt` VARCHAR(80) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `CustomerContact_companyId_customerId_sortOrder_idx`(`companyId`, `customerId`, `sortOrder`),
    INDEX `CustomerContact_companyId_externalContactId_idx`(`companyId`, `externalContactId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `SupplierContact` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `supplierId` VARCHAR(191) NOT NULL,
    `externalContactId` INTEGER NULL,
    `contactName` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `externalCreatedAt` VARCHAR(80) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `SupplierContact_companyId_supplierId_sortOrder_idx`(`companyId`, `supplierId`, `sortOrder`),
    INDEX `SupplierContact_companyId_externalContactId_idx`(`companyId`, `externalContactId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `CustomerContact`
  ADD CONSTRAINT `CustomerContact_companyId_fkey`
    FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `CustomerContact_customerId_fkey`
    FOREIGN KEY (`companyId`, `customerId`) REFERENCES `Customer`(`companyId`, `id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `SupplierContact`
  ADD CONSTRAINT `SupplierContact_companyId_fkey`
    FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `SupplierContact_supplierId_fkey`
    FOREIGN KEY (`companyId`, `supplierId`) REFERENCES `Supplier`(`companyId`, `id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO `CustomerContact` (
  `id`,
  `companyId`,
  `customerId`,
  `externalContactId`,
  `contactName`,
  `email`,
  `phone`,
  `sortOrder`,
  `externalCreatedAt`,
  `createdAt`,
  `updatedAt`
)
SELECT
  REPLACE(UUID(), '-', '') AS `id`,
  src.`companyId`,
  src.`customerId`,
  src.`externalContactId`,
  src.`contactName`,
  src.`email`,
  src.`phone`,
  src.`sortOrder`,
  src.`externalCreatedAt`,
  NOW(3) AS `createdAt`,
  NOW(3) AS `updatedAt`
FROM (
  SELECT
    c.`companyId`,
    c.`id` AS `customerId`,
    CASE
      WHEN jt.`externalContactId` REGEXP '^[0-9]+$' THEN CAST(jt.`externalContactId` AS UNSIGNED)
      ELSE NULL
    END AS `externalContactId`,
    TRIM(COALESCE(jt.`contactName`, '')) AS `contactName`,
    NULLIF(TRIM(COALESCE(jt.`email`, '')), '') AS `email`,
    NULLIF(TRIM(COALESCE(jt.`phone`, '')), '') AS `phone`,
    COALESCE(jt.`sortOrder`, jt.`ordinality` - 1) AS `sortOrder`,
    NULLIF(TRIM(COALESCE(jt.`externalCreatedAt`, '')), '') AS `externalCreatedAt`
  FROM `Customer` c
  JOIN JSON_TABLE(
    COALESCE(c.`contactsJson`, JSON_ARRAY()),
    '$[*]' COLUMNS (
      `ordinality` FOR ORDINALITY,
      `externalContactId` VARCHAR(191) PATH '$.id' NULL ON EMPTY,
      `contactName` VARCHAR(191) PATH '$.contact_name' NULL ON EMPTY,
      `email` VARCHAR(191) PATH '$.email' NULL ON EMPTY,
      `phone` VARCHAR(191) PATH '$.phone' NULL ON EMPTY,
      `sortOrder` INTEGER PATH '$.sort_order' NULL ON EMPTY,
      `externalCreatedAt` VARCHAR(80) PATH '$.created_at' NULL ON EMPTY
    )
  ) jt
) src
WHERE src.`contactName` <> ''
   OR src.`email` IS NOT NULL
   OR src.`phone` IS NOT NULL;

INSERT INTO `SupplierContact` (
  `id`,
  `companyId`,
  `supplierId`,
  `externalContactId`,
  `contactName`,
  `email`,
  `phone`,
  `sortOrder`,
  `externalCreatedAt`,
  `createdAt`,
  `updatedAt`
)
SELECT
  REPLACE(UUID(), '-', '') AS `id`,
  src.`companyId`,
  src.`supplierId`,
  src.`externalContactId`,
  src.`contactName`,
  src.`email`,
  src.`phone`,
  src.`sortOrder`,
  src.`externalCreatedAt`,
  NOW(3) AS `createdAt`,
  NOW(3) AS `updatedAt`
FROM (
  SELECT
    s.`companyId`,
    s.`id` AS `supplierId`,
    CASE
      WHEN jt.`externalContactId` REGEXP '^[0-9]+$' THEN CAST(jt.`externalContactId` AS UNSIGNED)
      ELSE NULL
    END AS `externalContactId`,
    TRIM(COALESCE(jt.`contactName`, '')) AS `contactName`,
    NULLIF(TRIM(COALESCE(jt.`email`, '')), '') AS `email`,
    NULLIF(TRIM(COALESCE(jt.`phone`, '')), '') AS `phone`,
    COALESCE(jt.`sortOrder`, jt.`ordinality` - 1) AS `sortOrder`,
    NULLIF(TRIM(COALESCE(jt.`externalCreatedAt`, '')), '') AS `externalCreatedAt`
  FROM `Supplier` s
  JOIN JSON_TABLE(
    COALESCE(s.`contactsJson`, JSON_ARRAY()),
    '$[*]' COLUMNS (
      `ordinality` FOR ORDINALITY,
      `externalContactId` VARCHAR(191) PATH '$.id' NULL ON EMPTY,
      `contactName` VARCHAR(191) PATH '$.contact_name' NULL ON EMPTY,
      `email` VARCHAR(191) PATH '$.email' NULL ON EMPTY,
      `phone` VARCHAR(191) PATH '$.phone' NULL ON EMPTY,
      `sortOrder` INTEGER PATH '$.sort_order' NULL ON EMPTY,
      `externalCreatedAt` VARCHAR(80) PATH '$.created_at' NULL ON EMPTY
    )
  ) jt
) src
WHERE src.`contactName` <> ''
   OR src.`email` IS NOT NULL
   OR src.`phone` IS NOT NULL;

ALTER TABLE `Customer` DROP COLUMN `contactsJson`;
ALTER TABLE `Supplier` DROP COLUMN `contactsJson`;
