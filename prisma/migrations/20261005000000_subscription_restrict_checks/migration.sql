ALTER TABLE `subscription` DROP FOREIGN KEY `Subscription_studentId_fkey`;
ALTER TABLE `subscription` DROP FOREIGN KEY `Subscription_teacherId_fkey`;
ALTER TABLE `Subscription` ADD CONSTRAINT `Subscription_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Subscription` ADD CONSTRAINT `Subscription_teacherId_fkey` FOREIGN KEY (`teacherId`) REFERENCES `Teacher`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Subscription` ADD CONSTRAINT `Subscription_price_nonneg` CHECK (price >= 0);
ALTER TABLE `Subscription` ADD CONSTRAINT `Subscription_endDate_after_startDate` CHECK (endDate > startDate);
ALTER TABLE `Teacher` ADD CONSTRAINT `Teacher_prices_nonneg` CHECK (price1Month >= 0 AND price3Months >= 0 AND price6Months >= 0 AND price1Year >= 0);
