-- Phase 3C: tenant-safe composite FKs for schedule/work-assignment and geofence chains

-- Add tenant keys to workforce child tables
ALTER TABLE `WorkAssignment` ADD COLUMN `companyId` VARCHAR(191) NULL;
ALTER TABLE `WorkAssignmentMember` ADD COLUMN `companyId` VARCHAR(191) NULL;
ALTER TABLE `ScheduleAbsence` ADD COLUMN `companyId` VARCHAR(191) NULL;
ALTER TABLE `DriverRunLog` ADD COLUMN `companyId` VARCHAR(191) NULL;

-- Backfill tenant keys from parent records
UPDATE `WorkAssignment` wa
JOIN `WorkSchedule` ws ON ws.`id` = wa.`workScheduleId`
SET wa.`companyId` = ws.`companyId`
WHERE wa.`companyId` IS NULL;

UPDATE `WorkAssignmentMember` wam
JOIN `WorkAssignment` wa ON wa.`id` = wam.`workAssignmentId`
SET wam.`companyId` = wa.`companyId`
WHERE wam.`companyId` IS NULL;

UPDATE `ScheduleAbsence` sa
JOIN `WorkSchedule` ws ON ws.`id` = sa.`workScheduleId`
SET sa.`companyId` = ws.`companyId`
WHERE sa.`companyId` IS NULL;

UPDATE `DriverRunLog` drl
JOIN `WorkSchedule` ws ON ws.`id` = drl.`workScheduleId`
SET drl.`companyId` = ws.`companyId`
WHERE drl.`companyId` IS NULL;

-- Make tenant keys required
ALTER TABLE `WorkAssignment` MODIFY `companyId` VARCHAR(191) NOT NULL;
ALTER TABLE `WorkAssignmentMember` MODIFY `companyId` VARCHAR(191) NOT NULL;
ALTER TABLE `ScheduleAbsence` MODIFY `companyId` VARCHAR(191) NOT NULL;
ALTER TABLE `DriverRunLog` MODIFY `companyId` VARCHAR(191) NOT NULL;

-- Drop legacy single-column foreign keys
ALTER TABLE `WorkAssignment` DROP FOREIGN KEY `WorkAssignment_workScheduleId_fkey`;
ALTER TABLE `WorkAssignment` DROP FOREIGN KEY `WorkAssignment_jobId_fkey`;
ALTER TABLE `WorkAssignment` DROP FOREIGN KEY `WorkAssignment_teamLeaderEmployeeId_fkey`;
ALTER TABLE `WorkAssignment` DROP FOREIGN KEY `WorkAssignment_driver1EmployeeId_fkey`;
ALTER TABLE `WorkAssignment` DROP FOREIGN KEY `WorkAssignment_driver2EmployeeId_fkey`;
ALTER TABLE `WorkAssignmentMember` DROP FOREIGN KEY `WorkAssignmentMember_workAssignmentId_fkey`;
ALTER TABLE `WorkAssignmentMember` DROP FOREIGN KEY `WorkAssignmentMember_employeeId_fkey`;
ALTER TABLE `ScheduleAbsence` DROP FOREIGN KEY `ScheduleAbsence_workScheduleId_fkey`;
ALTER TABLE `ScheduleAbsence` DROP FOREIGN KEY `ScheduleAbsence_employeeId_fkey`;
ALTER TABLE `DriverRunLog` DROP FOREIGN KEY `DriverRunLog_workScheduleId_fkey`;
ALTER TABLE `DriverRunLog` DROP FOREIGN KEY `DriverRunLog_driverEmployeeId_fkey`;
ALTER TABLE `AttendanceEntry` DROP FOREIGN KEY `AttendanceEntry_workAssignmentId_fkey`;
ALTER TABLE `GeofenceAttendanceEvent` DROP FOREIGN KEY `GeofenceAttendanceEvent_zoneId_fkey`;
ALTER TABLE `GeofenceAttendanceEvent` DROP FOREIGN KEY `GeofenceAttendanceEvent_employeeId_fkey`;

-- Add composite unique keys on tenant-scoped parents
CREATE UNIQUE INDEX `WorkSchedule_companyId_id_key` ON `WorkSchedule`(`companyId`, `id`);
CREATE UNIQUE INDEX `WorkAssignment_companyId_id_key` ON `WorkAssignment`(`companyId`, `id`);
CREATE UNIQUE INDEX `GeofenceZone_companyId_id_key` ON `GeofenceZone`(`companyId`, `id`);

-- Replace indexes to match composite relations
DROP INDEX `WorkAssignment_workScheduleId_idx` ON `WorkAssignment`;
CREATE INDEX `WorkAssignment_companyId_workScheduleId_idx` ON `WorkAssignment`(`companyId`, `workScheduleId`);

DROP INDEX `WorkAssignment_jobId_idx` ON `WorkAssignment`;
CREATE INDEX `WorkAssignment_companyId_jobId_idx` ON `WorkAssignment`(`companyId`, `jobId`);
CREATE INDEX `WorkAssignment_companyId_teamLeaderEmployeeId_idx` ON `WorkAssignment`(`companyId`, `teamLeaderEmployeeId`);
CREATE INDEX `WorkAssignment_companyId_driver1EmployeeId_idx` ON `WorkAssignment`(`companyId`, `driver1EmployeeId`);
CREATE INDEX `WorkAssignment_companyId_driver2EmployeeId_idx` ON `WorkAssignment`(`companyId`, `driver2EmployeeId`);

DROP INDEX `WorkAssignmentMember_employeeId_idx` ON `WorkAssignmentMember`;
CREATE INDEX `WorkAssignmentMember_companyId_workAssignmentId_idx` ON `WorkAssignmentMember`(`companyId`, `workAssignmentId`);
CREATE INDEX `WorkAssignmentMember_companyId_employeeId_idx` ON `WorkAssignmentMember`(`companyId`, `employeeId`);

DROP INDEX `ScheduleAbsence_employeeId_idx` ON `ScheduleAbsence`;
CREATE INDEX `ScheduleAbsence_companyId_workScheduleId_idx` ON `ScheduleAbsence`(`companyId`, `workScheduleId`);
CREATE INDEX `ScheduleAbsence_companyId_employeeId_idx` ON `ScheduleAbsence`(`companyId`, `employeeId`);

DROP INDEX `DriverRunLog_workScheduleId_idx` ON `DriverRunLog`;
DROP INDEX `DriverRunLog_driverEmployeeId_idx` ON `DriverRunLog`;
CREATE INDEX `DriverRunLog_companyId_workScheduleId_idx` ON `DriverRunLog`(`companyId`, `workScheduleId`);
CREATE INDEX `DriverRunLog_companyId_driverEmployeeId_idx` ON `DriverRunLog`(`companyId`, `driverEmployeeId`);

CREATE INDEX `AttendanceEntry_companyId_workAssignmentId_idx` ON `AttendanceEntry`(`companyId`, `workAssignmentId`);

DROP INDEX `GeofenceAttendanceEvent_zoneId_occurredAt_idx` ON `GeofenceAttendanceEvent`;
DROP INDEX `GeofenceAttendanceEvent_employeeId_occurredAt_idx` ON `GeofenceAttendanceEvent`;
CREATE INDEX `GeofenceAttendanceEvent_companyId_zoneId_occurredAt_idx` ON `GeofenceAttendanceEvent`(`companyId`, `zoneId`, `occurredAt`);
CREATE INDEX `GeofenceAttendanceEvent_companyId_employeeId_occurredAt_idx` ON `GeofenceAttendanceEvent`(`companyId`, `employeeId`, `occurredAt`);

-- Recreate tenant-safe composite foreign keys
ALTER TABLE `WorkAssignment`
  ADD CONSTRAINT `WorkAssignment_companyId_fkey`
    FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `WorkAssignment_workScheduleId_fkey`
    FOREIGN KEY (`companyId`, `workScheduleId`) REFERENCES `WorkSchedule`(`companyId`, `id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `WorkAssignment_jobId_fkey`
    FOREIGN KEY (`companyId`, `jobId`) REFERENCES `Job`(`companyId`, `id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `WorkAssignment_teamLeaderEmployeeId_fkey`
    FOREIGN KEY (`companyId`, `teamLeaderEmployeeId`) REFERENCES `Employee`(`companyId`, `id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `WorkAssignment_driver1EmployeeId_fkey`
    FOREIGN KEY (`companyId`, `driver1EmployeeId`) REFERENCES `Employee`(`companyId`, `id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `WorkAssignment_driver2EmployeeId_fkey`
    FOREIGN KEY (`companyId`, `driver2EmployeeId`) REFERENCES `Employee`(`companyId`, `id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `WorkAssignmentMember`
  ADD CONSTRAINT `WorkAssignmentMember_companyId_fkey`
    FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `WorkAssignmentMember_workAssignmentId_fkey`
    FOREIGN KEY (`companyId`, `workAssignmentId`) REFERENCES `WorkAssignment`(`companyId`, `id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `WorkAssignmentMember_employeeId_fkey`
    FOREIGN KEY (`companyId`, `employeeId`) REFERENCES `Employee`(`companyId`, `id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `ScheduleAbsence`
  ADD CONSTRAINT `ScheduleAbsence_companyId_fkey`
    FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `ScheduleAbsence_workScheduleId_fkey`
    FOREIGN KEY (`companyId`, `workScheduleId`) REFERENCES `WorkSchedule`(`companyId`, `id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `ScheduleAbsence_employeeId_fkey`
    FOREIGN KEY (`companyId`, `employeeId`) REFERENCES `Employee`(`companyId`, `id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `DriverRunLog`
  ADD CONSTRAINT `DriverRunLog_companyId_fkey`
    FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `DriverRunLog_workScheduleId_fkey`
    FOREIGN KEY (`companyId`, `workScheduleId`) REFERENCES `WorkSchedule`(`companyId`, `id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `DriverRunLog_driverEmployeeId_fkey`
    FOREIGN KEY (`companyId`, `driverEmployeeId`) REFERENCES `Employee`(`companyId`, `id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `AttendanceEntry`
  ADD CONSTRAINT `AttendanceEntry_workAssignmentId_fkey`
    FOREIGN KEY (`companyId`, `workAssignmentId`) REFERENCES `WorkAssignment`(`companyId`, `id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `GeofenceAttendanceEvent`
  ADD CONSTRAINT `GeofenceAttendanceEvent_zoneId_fkey`
    FOREIGN KEY (`companyId`, `zoneId`) REFERENCES `GeofenceZone`(`companyId`, `id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `GeofenceAttendanceEvent_employeeId_fkey`
    FOREIGN KEY (`companyId`, `employeeId`) REFERENCES `Employee`(`companyId`, `id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;
