-- User profile image Drive id + signature image for print builder
ALTER TABLE `User`
    ADD COLUMN `imageDriveId` VARCHAR(191) NULL,
    ADD COLUMN `signatureUrl` TEXT NULL,
    ADD COLUMN `signatureDriveId` VARCHAR(191) NULL;
