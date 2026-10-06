-- AlterTable: add optional teacher photo URL (editable by admins).
ALTER TABLE `Teacher` ADD COLUMN `photoUrl` VARCHAR(500) NULL;
