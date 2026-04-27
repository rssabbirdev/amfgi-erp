-- Phase 3: tenant-safe composite foreign keys for models that already carry companyId

-- Drop legacy single-column foreign keys
ALTER TABLE `StockBatch` DROP FOREIGN KEY `StockBatch_materialId_fkey`;
ALTER TABLE `StockBatch` DROP FOREIGN KEY `StockBatch_supplierId_fkey`;
ALTER TABLE `Transaction` DROP FOREIGN KEY `Transaction_materialId_fkey`;
ALTER TABLE `Transaction` DROP FOREIGN KEY `Transaction_jobId_fkey`;
ALTER TABLE `Transaction` DROP FOREIGN KEY `Transaction_parentTransactionId_fkey`;
ALTER TABLE `Job` DROP FOREIGN KEY `Job_customerId_fkey`;
ALTER TABLE `Job` DROP FOREIGN KEY `Job_parentJobId_fkey`;
ALTER TABLE `VisaPeriod` DROP FOREIGN KEY `VisaPeriod_employeeId_fkey`;
ALTER TABLE `EmployeeDocument` DROP FOREIGN KEY `EmployeeDocument_employeeId_fkey`;
ALTER TABLE `EmployeeDocument` DROP FOREIGN KEY `EmployeeDocument_visaPeriodId_fkey`;
ALTER TABLE `EmployeeDocument` DROP FOREIGN KEY `EmployeeDocument_documentTypeId_fkey`;

-- Add composite unique keys on tenant-scoped parents
CREATE UNIQUE INDEX `Material_companyId_id_key` ON `Material`(`companyId`, `id`);
CREATE UNIQUE INDEX `Transaction_companyId_id_key` ON `Transaction`(`companyId`, `id`);
CREATE UNIQUE INDEX `Job_companyId_id_key` ON `Job`(`companyId`, `id`);
CREATE UNIQUE INDEX `Customer_companyId_id_key` ON `Customer`(`companyId`, `id`);
CREATE UNIQUE INDEX `Supplier_companyId_id_key` ON `Supplier`(`companyId`, `id`);
CREATE UNIQUE INDEX `Employee_companyId_id_key` ON `Employee`(`companyId`, `id`);
CREATE UNIQUE INDEX `VisaPeriod_companyId_id_key` ON `VisaPeriod`(`companyId`, `id`);
CREATE UNIQUE INDEX `EmployeeDocumentType_companyId_id_key` ON `EmployeeDocumentType`(`companyId`, `id`);

-- Replace child indexes where the new composite FK needs companyId in the key
DROP INDEX `Job_customerId_idx` ON `Job`;
CREATE INDEX `Job_companyId_customerId_idx` ON `Job`(`companyId`, `customerId`);

DROP INDEX `Job_parentJobId_idx` ON `Job`;
CREATE INDEX `Job_companyId_parentJobId_idx` ON `Job`(`companyId`, `parentJobId`);

DROP INDEX `StockBatch_supplierId_idx` ON `StockBatch`;
CREATE INDEX `StockBatch_companyId_supplierId_idx` ON `StockBatch`(`companyId`, `supplierId`);

DROP INDEX `Transaction_parentTransactionId_idx` ON `Transaction`;
CREATE INDEX `Transaction_companyId_parentTransactionId_idx` ON `Transaction`(`companyId`, `parentTransactionId`);

DROP INDEX `EmployeeDocument_documentTypeId_idx` ON `EmployeeDocument`;
CREATE INDEX `EmployeeDocument_companyId_documentTypeId_idx` ON `EmployeeDocument`(`companyId`, `documentTypeId`);
CREATE INDEX `EmployeeDocument_companyId_visaPeriodId_idx` ON `EmployeeDocument`(`companyId`, `visaPeriodId`);

-- Recreate tenant-safe composite foreign keys
ALTER TABLE `StockBatch`
  ADD CONSTRAINT `StockBatch_materialId_fkey`
    FOREIGN KEY (`companyId`, `materialId`) REFERENCES `Material`(`companyId`, `id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `StockBatch_supplierId_fkey`
    FOREIGN KEY (`companyId`, `supplierId`) REFERENCES `Supplier`(`companyId`, `id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `Transaction`
  ADD CONSTRAINT `Transaction_materialId_fkey`
    FOREIGN KEY (`companyId`, `materialId`) REFERENCES `Material`(`companyId`, `id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `Transaction_jobId_fkey`
    FOREIGN KEY (`companyId`, `jobId`) REFERENCES `Job`(`companyId`, `id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `Transaction_parentTransactionId_fkey`
    FOREIGN KEY (`companyId`, `parentTransactionId`) REFERENCES `Transaction`(`companyId`, `id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `Job`
  ADD CONSTRAINT `Job_customerId_fkey`
    FOREIGN KEY (`companyId`, `customerId`) REFERENCES `Customer`(`companyId`, `id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `Job_parentJobId_fkey`
    FOREIGN KEY (`companyId`, `parentJobId`) REFERENCES `Job`(`companyId`, `id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `VisaPeriod`
  ADD CONSTRAINT `VisaPeriod_employeeId_fkey`
    FOREIGN KEY (`companyId`, `employeeId`) REFERENCES `Employee`(`companyId`, `id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `EmployeeDocument`
  ADD CONSTRAINT `EmployeeDocument_employeeId_fkey`
    FOREIGN KEY (`companyId`, `employeeId`) REFERENCES `Employee`(`companyId`, `id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `EmployeeDocument_visaPeriodId_fkey`
    FOREIGN KEY (`companyId`, `visaPeriodId`) REFERENCES `VisaPeriod`(`companyId`, `id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `EmployeeDocument_documentTypeId_fkey`
    FOREIGN KEY (`companyId`, `documentTypeId`) REFERENCES `EmployeeDocumentType`(`companyId`, `id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;
