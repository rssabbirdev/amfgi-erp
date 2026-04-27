ALTER TABLE `Job`
  MODIFY `lpoValue` DECIMAL(18, 2) NULL,
  MODIFY `jobWorkValue` DECIMAL(18, 2) NULL;

ALTER TABLE `JobLpoValueHistory`
  MODIFY `previousValue` DECIMAL(18, 2) NULL,
  MODIFY `newValue` DECIMAL(18, 2) NULL;
