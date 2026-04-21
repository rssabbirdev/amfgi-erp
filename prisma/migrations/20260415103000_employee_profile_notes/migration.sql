-- Extra lifetime fields on Employee (HR notes + flexible JSON)
ALTER TABLE `Employee` ADD COLUMN `adminNotes` TEXT NULL;
ALTER TABLE `Employee` ADD COLUMN `profileExtension` JSON NULL;
