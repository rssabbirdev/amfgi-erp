-- Phase 3B: extend tenant-safe composite foreign keys to additional company-scoped relations

-- Drop legacy single-column foreign keys
ALTER TABLE `MaterialUom` DROP FOREIGN KEY `MaterialUom_materialId_fkey`;
ALTER TABLE `JobLpoValueHistory` DROP FOREIGN KEY `JobLpoValueHistory_jobId_fkey`;
ALTER TABLE `JobItem` DROP FOREIGN KEY `JobItem_jobId_fkey`;
ALTER TABLE `JobItem` DROP FOREIGN KEY `JobItem_formulaLibraryId_fkey`;
ALTER TABLE `AttendanceEntry` DROP FOREIGN KEY `AttendanceEntry_employeeId_fkey`;
ALTER TABLE `EmployeeMobileAccessToken` DROP FOREIGN KEY `EmployeeMobileAccessToken_employeeId_fkey`;

-- Add composite unique keys on tenant-scoped parents
CREATE UNIQUE INDEX `FormulaLibrary_companyId_id_key` ON `FormulaLibrary`(`companyId`, `id`);

-- Replace child indexes where the new composite FK needs companyId in the key
DROP INDEX `JobLpoValueHistory_jobId_createdAt_idx` ON `JobLpoValueHistory`;
CREATE INDEX `JobLpoValueHistory_companyId_jobId_createdAt_idx` ON `JobLpoValueHistory`(`companyId`, `jobId`, `createdAt`);

-- Recreate tenant-safe composite foreign keys
ALTER TABLE `MaterialUom`
  ADD CONSTRAINT `MaterialUom_materialId_fkey`
    FOREIGN KEY (`companyId`, `materialId`) REFERENCES `Material`(`companyId`, `id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `JobLpoValueHistory`
  ADD CONSTRAINT `JobLpoValueHistory_jobId_fkey`
    FOREIGN KEY (`companyId`, `jobId`) REFERENCES `Job`(`companyId`, `id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `JobItem`
  ADD CONSTRAINT `JobItem_jobId_fkey`
    FOREIGN KEY (`companyId`, `jobId`) REFERENCES `Job`(`companyId`, `id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `JobItem_formulaLibraryId_fkey`
    FOREIGN KEY (`companyId`, `formulaLibraryId`) REFERENCES `FormulaLibrary`(`companyId`, `id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `AttendanceEntry`
  ADD CONSTRAINT `AttendanceEntry_employeeId_fkey`
    FOREIGN KEY (`companyId`, `employeeId`) REFERENCES `Employee`(`companyId`, `id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `EmployeeMobileAccessToken`
  ADD CONSTRAINT `EmployeeMobileAccessToken_employeeId_fkey`
    FOREIGN KEY (`companyId`, `employeeId`) REFERENCES `Employee`(`companyId`, `id`)
    ON DELETE CASCADE ON UPDATE CASCADE;
