ALTER TABLE `Material`
  ADD COLUMN `allowNegativeConsumption` BOOLEAN NOT NULL DEFAULT false AFTER `stockType`;
