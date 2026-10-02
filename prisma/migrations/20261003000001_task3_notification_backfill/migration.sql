UPDATE `Subscription` SET `expiryNotifiedAt` = CURRENT_TIMESTAMP(3) WHERE `status` <> 'ACTIVE' AND `expiryNotifiedAt` IS NULL;
UPDATE `Subscription` SET `cancelNotifiedAt` = CURRENT_TIMESTAMP(3) WHERE `status` <> 'ACTIVE' AND `cancelNotifiedAt` IS NULL;
