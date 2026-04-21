ALTER TABLE `AttendanceEntry`
  ADD COLUMN `breakStartAt` DATETIME(3) NULL AFTER `checkOutAt`,
  ADD COLUMN `breakEndAt` DATETIME(3) NULL AFTER `breakStartAt`;
