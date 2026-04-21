ALTER TABLE `ApiCredential` ADD COLUMN `allowedDomains` JSON NULL;
ALTER TABLE `ApiCredential` DROP COLUMN `webhookSecret`;
