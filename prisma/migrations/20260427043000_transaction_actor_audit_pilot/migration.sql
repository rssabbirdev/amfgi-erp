ALTER TABLE `Transaction`
  ADD COLUMN `performedByUserId` VARCHAR(191) NULL,
  ADD COLUMN `performedByName` VARCHAR(191) NULL;

UPDATE `Transaction` t
LEFT JOIN `User` u ON u.`id` = t.`performedBy`
SET
  t.`performedByUserId` = CASE
    WHEN u.`id` IS NOT NULL THEN u.`id`
    ELSE NULL
  END,
  t.`performedByName` = CASE
    WHEN u.`id` IS NOT NULL THEN COALESCE(NULLIF(TRIM(u.`name`), ''), NULLIF(TRIM(u.`email`), ''), u.`id`)
    ELSE t.`performedBy`
  END
WHERE t.`performedByUserId` IS NULL OR t.`performedByName` IS NULL;

CREATE INDEX `Transaction_performedByUserId_idx` ON `Transaction`(`performedByUserId`);

ALTER TABLE `Transaction`
  ADD CONSTRAINT `Transaction_performedByUserId_fkey`
  FOREIGN KEY (`performedByUserId`) REFERENCES `User`(`id`)
  ON DELETE SET NULL
  ON UPDATE CASCADE;
