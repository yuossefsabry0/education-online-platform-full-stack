-- CreateIndex
CREATE INDEX `EmailVerificationToken_expiresAt_idx` ON `EmailVerificationToken`(`expiresAt`);

-- CreateIndex
CREATE INDEX `LogHistory_actionType_actorType_timestamp_idx` ON `LogHistory`(`actionType`, `actorType`, `timestamp`);

-- CreateIndex
CREATE INDEX `PasswordResetToken_expiresAt_idx` ON `PasswordResetToken`(`expiresAt`);

-- CreateIndex
CREATE INDEX `RefreshToken_expiresAt_idx` ON `RefreshToken`(`expiresAt`);

-- CreateIndex
CREATE INDEX `Subscription_status_endDate_idx` ON `Subscription`(`status`, `endDate`);

-- CreateIndex
CREATE INDEX `Subscription_status_expiryNotifiedAt_idx` ON `Subscription`(`status`, `expiryNotifiedAt`);

-- CreateIndex
CREATE INDEX `Teacher_isActive_idx` ON `Teacher`(`isActive`);

-- CreateIndex
CREATE INDEX `TeacherContent_teacherId_type_isPublished_createdAt_idx` ON `TeacherContent`(`teacherId`, `type`, `isPublished`, `createdAt`);
