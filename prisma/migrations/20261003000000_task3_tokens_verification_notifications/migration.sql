ALTER TABLE `Student` ADD COLUMN `emailVerified` BOOLEAN NOT NULL DEFAULT FALSE, ADD COLUMN `verifiedAt` DATETIME(3) NULL;
ALTER TABLE `Teacher` ADD COLUMN `emailVerified` BOOLEAN NOT NULL DEFAULT FALSE, ADD COLUMN `verifiedAt` DATETIME(3) NULL;
ALTER TABLE `Admin` ADD COLUMN `emailVerified` BOOLEAN NOT NULL DEFAULT FALSE, ADD COLUMN `verifiedAt` DATETIME(3) NULL;
ALTER TABLE `Subscription` ADD COLUMN `expiryNotifiedAt` DATETIME(3) NULL, ADD COLUMN `cancelNotifiedAt` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `PasswordResetToken` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tokenHash` VARCHAR(128) NOT NULL,
    `ownerType` ENUM('STUDENT', 'TEACHER', 'ADMIN') NOT NULL,
    `studentId` INTEGER NULL,
    `teacherId` INTEGER NULL,
    `adminId` INTEGER NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `usedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `PasswordResetToken_tokenHash_key`(`tokenHash`),
    INDEX `PasswordResetToken_ownerType_studentId_idx`(`ownerType`, `studentId`),
    INDEX `PasswordResetToken_ownerType_teacherId_idx`(`ownerType`, `teacherId`),
    INDEX `PasswordResetToken_ownerType_adminId_idx`(`ownerType`, `adminId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EmailVerificationToken` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tokenHash` VARCHAR(128) NOT NULL,
    `ownerType` ENUM('STUDENT', 'TEACHER', 'ADMIN') NOT NULL,
    `studentId` INTEGER NULL,
    `teacherId` INTEGER NULL,
    `adminId` INTEGER NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `usedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `EmailVerificationToken_tokenHash_key`(`tokenHash`),
    INDEX `EmailVerificationToken_ownerType_studentId_idx`(`ownerType`, `studentId`),
    INDEX `EmailVerificationToken_ownerType_teacherId_idx`(`ownerType`, `teacherId`),
    INDEX `EmailVerificationToken_ownerType_adminId_idx`(`ownerType`, `adminId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `PasswordResetToken` ADD CONSTRAINT `PasswordResetToken_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PasswordResetToken` ADD CONSTRAINT `PasswordResetToken_teacherId_fkey` FOREIGN KEY (`teacherId`) REFERENCES `Teacher`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PasswordResetToken` ADD CONSTRAINT `PasswordResetToken_adminId_fkey` FOREIGN KEY (`adminId`) REFERENCES `Admin`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmailVerificationToken` ADD CONSTRAINT `EmailVerificationToken_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmailVerificationToken` ADD CONSTRAINT `EmailVerificationToken_teacherId_fkey` FOREIGN KEY (`teacherId`) REFERENCES `Teacher`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmailVerificationToken` ADD CONSTRAINT `EmailVerificationToken_adminId_fkey` FOREIGN KEY (`adminId`) REFERENCES `Admin`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
