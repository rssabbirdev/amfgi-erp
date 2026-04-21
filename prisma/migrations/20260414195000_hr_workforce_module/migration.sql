-- HR / Workforce: employees, documents, schedule, attendance

CREATE TABLE `Employee` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `employeeCode` VARCHAR(191) NOT NULL,
    `fullName` VARCHAR(191) NOT NULL,
    `preferredName` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `nationality` VARCHAR(191) NULL,
    `dateOfBirth` DATE NULL,
    `gender` VARCHAR(191) NULL,
    `designation` VARCHAR(191) NULL,
    `department` VARCHAR(191) NULL,
    `employmentType` VARCHAR(191) NULL,
    `hireDate` DATE NULL,
    `terminationDate` DATE NULL,
    `status` ENUM('ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'EXITED') NOT NULL DEFAULT 'ACTIVE',
    `emergencyContactName` VARCHAR(191) NULL,
    `emergencyContactPhone` VARCHAR(191) NULL,
    `bloodGroup` VARCHAR(191) NULL,
    `photoDriveId` VARCHAR(191) NULL,
    `portalEnabled` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Employee_companyId_employeeCode_key`(`companyId`, `employeeCode`),
    UNIQUE INDEX `Employee_companyId_email_key`(`companyId`, `email`),
    INDEX `Employee_companyId_status_idx`(`companyId`, `status`),
    INDEX `Employee_companyId_fullName_idx`(`companyId`, `fullName`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Employee` ADD CONSTRAINT `Employee_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `User` ADD COLUMN `linkedEmployeeId` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `User_linkedEmployeeId_key` ON `User`(`linkedEmployeeId`);
ALTER TABLE `User` ADD CONSTRAINT `User_linkedEmployeeId_fkey` FOREIGN KEY (`linkedEmployeeId`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE `VisaPeriod` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `sponsorType` VARCHAR(191) NULL,
    `visaType` VARCHAR(191) NULL,
    `startDate` DATE NOT NULL,
    `endDate` DATE NOT NULL,
    `status` ENUM('DRAFT', 'ACTIVE', 'EXPIRED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `VisaPeriod_companyId_employeeId_idx`(`companyId`, `employeeId`),
    INDEX `VisaPeriod_employeeId_status_idx`(`employeeId`, `status`),
    INDEX `VisaPeriod_companyId_endDate_idx`(`companyId`, `endDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `VisaPeriod` ADD CONSTRAINT `VisaPeriod_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `VisaPeriod` ADD CONSTRAINT `VisaPeriod_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE `EmployeeDocumentType` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `requiresVisaPeriod` BOOLEAN NOT NULL DEFAULT false,
    `requiresExpiry` BOOLEAN NOT NULL DEFAULT true,
    `defaultAlertDaysBeforeExpiry` INTEGER NOT NULL DEFAULT 30,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `EmployeeDocumentType_companyId_slug_key`(`companyId`, `slug`),
    INDEX `EmployeeDocumentType_companyId_isActive_idx`(`companyId`, `isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `EmployeeDocumentType` ADD CONSTRAINT `EmployeeDocumentType_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE `EmployeeDocument` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `visaPeriodId` VARCHAR(191) NULL,
    `documentTypeId` VARCHAR(191) NOT NULL,
    `documentNumber` VARCHAR(191) NULL,
    `issueDate` DATE NULL,
    `expiryDate` DATE NULL,
    `issuingAuthority` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `customFields` JSON NULL,
    `mediaDriveId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `EmployeeDocument_companyId_employeeId_idx`(`companyId`, `employeeId`),
    INDEX `EmployeeDocument_companyId_expiryDate_idx`(`companyId`, `expiryDate`),
    INDEX `EmployeeDocument_documentTypeId_idx`(`documentTypeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `EmployeeDocument` ADD CONSTRAINT `EmployeeDocument_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `EmployeeDocument` ADD CONSTRAINT `EmployeeDocument_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `EmployeeDocument` ADD CONSTRAINT `EmployeeDocument_visaPeriodId_fkey` FOREIGN KEY (`visaPeriodId`) REFERENCES `VisaPeriod`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `EmployeeDocument` ADD CONSTRAINT `EmployeeDocument_documentTypeId_fkey` FOREIGN KEY (`documentTypeId`) REFERENCES `EmployeeDocumentType`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE `WorkSchedule` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `workDate` DATE NOT NULL,
    `clientDisplayName` VARCHAR(191) NULL,
    `title` VARCHAR(191) NULL,
    `status` ENUM('DRAFT', 'PUBLISHED', 'LOCKED') NOT NULL DEFAULT 'DRAFT',
    `publishedAt` DATETIME(3) NULL,
    `lockedAt` DATETIME(3) NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `WorkSchedule_companyId_workDate_key`(`companyId`, `workDate`),
    INDEX `WorkSchedule_companyId_status_idx`(`companyId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `WorkSchedule` ADD CONSTRAINT `WorkSchedule_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE `WorkAssignment` (
    `id` VARCHAR(191) NOT NULL,
    `workScheduleId` VARCHAR(191) NOT NULL,
    `columnIndex` INTEGER NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `locationType` ENUM('SITE_JOB', 'FACTORY', 'OTHER') NOT NULL DEFAULT 'SITE_JOB',
    `jobId` VARCHAR(191) NULL,
    `factoryCode` VARCHAR(191) NULL,
    `factoryLabel` VARCHAR(191) NULL,
    `jobNumberSnapshot` VARCHAR(191) NULL,
    `siteNameSnapshot` VARCHAR(191) NULL,
    `clientNameSnapshot` VARCHAR(191) NULL,
    `projectDetailsSnapshot` TEXT NULL,
    `teamLeaderEmployeeId` VARCHAR(191) NULL,
    `driver1EmployeeId` VARCHAR(191) NULL,
    `driver2EmployeeId` VARCHAR(191) NULL,
    `shiftStart` VARCHAR(191) NULL,
    `shiftEnd` VARCHAR(191) NULL,
    `breakWindow` VARCHAR(191) NULL,
    `targetQty` DOUBLE NULL,
    `achievedQty` DOUBLE NULL,
    `unit` VARCHAR(191) NULL,
    `remarks` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `WorkAssignment_workScheduleId_columnIndex_key`(`workScheduleId`, `columnIndex`),
    INDEX `WorkAssignment_workScheduleId_idx`(`workScheduleId`),
    INDEX `WorkAssignment_jobId_idx`(`jobId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `WorkAssignment` ADD CONSTRAINT `WorkAssignment_workScheduleId_fkey` FOREIGN KEY (`workScheduleId`) REFERENCES `WorkSchedule`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `WorkAssignment` ADD CONSTRAINT `WorkAssignment_jobId_fkey` FOREIGN KEY (`jobId`) REFERENCES `Job`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `WorkAssignment` ADD CONSTRAINT `WorkAssignment_teamLeaderEmployeeId_fkey` FOREIGN KEY (`teamLeaderEmployeeId`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `WorkAssignment` ADD CONSTRAINT `WorkAssignment_driver1EmployeeId_fkey` FOREIGN KEY (`driver1EmployeeId`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `WorkAssignment` ADD CONSTRAINT `WorkAssignment_driver2EmployeeId_fkey` FOREIGN KEY (`driver2EmployeeId`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE `WorkAssignmentMember` (
    `id` VARCHAR(191) NOT NULL,
    `workAssignmentId` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `role` ENUM('WORKER', 'HELPER', 'TEAM_LEADER') NOT NULL DEFAULT 'WORKER',
    `slot` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `WorkAssignmentMember_workAssignmentId_employeeId_key`(`workAssignmentId`, `employeeId`),
    INDEX `WorkAssignmentMember_employeeId_idx`(`employeeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `WorkAssignmentMember` ADD CONSTRAINT `WorkAssignmentMember_workAssignmentId_fkey` FOREIGN KEY (`workAssignmentId`) REFERENCES `WorkAssignment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `WorkAssignmentMember` ADD CONSTRAINT `WorkAssignmentMember_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE `ScheduleAbsence` (
    `id` VARCHAR(191) NOT NULL,
    `workScheduleId` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `reason` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ScheduleAbsence_workScheduleId_employeeId_key`(`workScheduleId`, `employeeId`),
    INDEX `ScheduleAbsence_employeeId_idx`(`employeeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ScheduleAbsence` ADD CONSTRAINT `ScheduleAbsence_workScheduleId_fkey` FOREIGN KEY (`workScheduleId`) REFERENCES `WorkSchedule`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ScheduleAbsence` ADD CONSTRAINT `ScheduleAbsence_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE `DriverRunLog` (
    `id` VARCHAR(191) NOT NULL,
    `workScheduleId` VARCHAR(191) NOT NULL,
    `driverEmployeeId` VARCHAR(191) NOT NULL,
    `routeText` TEXT NOT NULL,
    `sequence` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `DriverRunLog_workScheduleId_idx`(`workScheduleId`),
    INDEX `DriverRunLog_driverEmployeeId_idx`(`driverEmployeeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `DriverRunLog` ADD CONSTRAINT `DriverRunLog_workScheduleId_fkey` FOREIGN KEY (`workScheduleId`) REFERENCES `WorkSchedule`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `DriverRunLog` ADD CONSTRAINT `DriverRunLog_driverEmployeeId_fkey` FOREIGN KEY (`driverEmployeeId`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE `AttendanceEntry` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `workDate` DATE NOT NULL,
    `workAssignmentId` VARCHAR(191) NULL,
    `expectedShiftStart` DATETIME(3) NULL,
    `expectedShiftEnd` DATETIME(3) NULL,
    `checkInAt` DATETIME(3) NULL,
    `checkOutAt` DATETIME(3) NULL,
    `status` ENUM('PRESENT', 'ABSENT', 'LEAVE', 'HALF_DAY', 'MISSING_PUNCH') NOT NULL DEFAULT 'PRESENT',
    `lateMinutes` INTEGER NOT NULL DEFAULT 0,
    `earlyLeaveMinutes` INTEGER NOT NULL DEFAULT 0,
    `overtimeMinutes` INTEGER NOT NULL DEFAULT 0,
    `workflowStatus` ENUM('DRAFT', 'SUBMITTED', 'APPROVED') NOT NULL DEFAULT 'DRAFT',
    `source` ENUM('SCHEDULE_BOILERPLATE', 'MANUAL', 'IMPORT') NOT NULL DEFAULT 'SCHEDULE_BOILERPLATE',
    `approvedById` VARCHAR(191) NULL,
    `approvedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `AttendanceEntry_companyId_workDate_idx`(`companyId`, `workDate`),
    INDEX `AttendanceEntry_companyId_employeeId_workDate_idx`(`companyId`, `employeeId`, `workDate`),
    INDEX `AttendanceEntry_workflowStatus_idx`(`workflowStatus`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `AttendanceEntry` ADD CONSTRAINT `AttendanceEntry_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `AttendanceEntry` ADD CONSTRAINT `AttendanceEntry_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `AttendanceEntry` ADD CONSTRAINT `AttendanceEntry_workAssignmentId_fkey` FOREIGN KEY (`workAssignmentId`) REFERENCES `WorkAssignment`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
