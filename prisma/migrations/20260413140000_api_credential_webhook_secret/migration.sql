-- Optional HMAC signing secret for integration webhooks (shown once at create).
ALTER TABLE `ApiCredential` ADD COLUMN `webhookSecret` VARCHAR(200) NULL;
