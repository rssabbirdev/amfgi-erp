-- CreateTable
CREATE TABLE `GeofenceZone` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `polygonPoints` JSON NOT NULL,
    `gateLat` DOUBLE NOT NULL,
    `gateLng` DOUBLE NOT NULL,
    `gateRadiusMeters` DOUBLE NOT NULL DEFAULT 30,
    `centerLat` DOUBLE NULL,
    `centerLng` DOUBLE NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `GeofenceZone_companyId_isActive_idx`(`companyId`, `isActive`),
    UNIQUE INDEX `GeofenceZone_companyId_name_key`(`companyId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GeofenceAttendanceEvent` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `zoneId` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NULL,
    `workDate` DATE NULL,
    `eventType` ENUM('CHECK_IN', 'CHECK_OUT', 'LOCATION_PING', 'MANUAL_OVERRIDE') NOT NULL,
    `validationStatus` ENUM('VALID', 'OUTSIDE_POLYGON', 'OUTSIDE_GATE_RADIUS') NOT NULL,
    `latitude` DOUBLE NOT NULL,
    `longitude` DOUBLE NOT NULL,
    `accuracyMeters` DOUBLE NULL,
    `distanceToGateMeters` DOUBLE NULL,
    `insidePolygon` BOOLEAN NOT NULL DEFAULT false,
    `withinGateRadius` BOOLEAN NOT NULL DEFAULT false,
    `devicePlatform` VARCHAR(191) NULL,
    `deviceIdentifier` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `metadata` JSON NULL,
    `occurredAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `GeofenceAttendanceEvent_companyId_occurredAt_idx`(`companyId`, `occurredAt`),
    INDEX `GeofenceAttendanceEvent_zoneId_occurredAt_idx`(`zoneId`, `occurredAt`),
    INDEX `GeofenceAttendanceEvent_employeeId_occurredAt_idx`(`employeeId`, `occurredAt`),
    INDEX `GeofenceAttendanceEvent_companyId_workDate_idx`(`companyId`, `workDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `GeofenceZone` ADD CONSTRAINT `GeofenceZone_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GeofenceAttendanceEvent` ADD CONSTRAINT `GeofenceAttendanceEvent_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GeofenceAttendanceEvent` ADD CONSTRAINT `GeofenceAttendanceEvent_zoneId_fkey` FOREIGN KEY (`zoneId`) REFERENCES `GeofenceZone`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GeofenceAttendanceEvent` ADD CONSTRAINT `GeofenceAttendanceEvent_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
