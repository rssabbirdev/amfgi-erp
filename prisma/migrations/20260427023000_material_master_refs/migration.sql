-- Phase 5A: add normalized category/warehouse refs to Material

ALTER TABLE `Material`
  ADD COLUMN `categoryId` VARCHAR(191) NULL,
  ADD COLUMN `warehouseId` VARCHAR(191) NULL;

CREATE UNIQUE INDEX `Category_companyId_id_key` ON `Category`(`companyId`, `id`);
CREATE UNIQUE INDEX `Warehouse_companyId_id_key` ON `Warehouse`(`companyId`, `id`);

UPDATE `Material` AS `m`
INNER JOIN `Category` AS `c`
  ON `c`.`companyId` = `m`.`companyId`
 AND `c`.`name` = `m`.`category`
SET `m`.`categoryId` = `c`.`id`
WHERE `m`.`category` IS NOT NULL
  AND TRIM(`m`.`category`) <> '';

UPDATE `Material` AS `m`
INNER JOIN `Warehouse` AS `w`
  ON `w`.`companyId` = `m`.`companyId`
 AND `w`.`name` = `m`.`warehouse`
SET `m`.`warehouseId` = `w`.`id`
WHERE `m`.`warehouse` IS NOT NULL
  AND TRIM(`m`.`warehouse`) <> '';

CREATE INDEX `Material_companyId_categoryId_idx` ON `Material`(`companyId`, `categoryId`);
CREATE INDEX `Material_companyId_warehouseId_idx` ON `Material`(`companyId`, `warehouseId`);

ALTER TABLE `Material`
  ADD CONSTRAINT `Material_companyId_categoryId_fkey`
    FOREIGN KEY (`companyId`, `categoryId`) REFERENCES `Category`(`companyId`, `id`)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  ADD CONSTRAINT `Material_companyId_warehouseId_fkey`
    FOREIGN KEY (`companyId`, `warehouseId`) REFERENCES `Warehouse`(`companyId`, `id`)
    ON DELETE RESTRICT
    ON UPDATE CASCADE;
