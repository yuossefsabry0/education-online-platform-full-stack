ALTER TABLE `RefreshToken` ADD COLUMN `familyId` VARCHAR(191) NULL;
CREATE INDEX `RefreshToken_familyId_idx` ON `RefreshToken`(`familyId`);
