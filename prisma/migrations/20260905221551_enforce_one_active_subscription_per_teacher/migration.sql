-- Fix Task 5: Enforce "One Active Subscription Per Teacher" at the database level.
--
-- MySQL does not support partial/conditional unique indexes (unlike Postgres),
-- so a plain unique index on (studentId, teacherId) would be wrong: it would
-- permanently block a student from ever re-subscribing to the same teacher
-- after their prior subscription is expired or cancelled.
--
-- Instead we add a VIRTUAL generated (virtual/computed) column
-- `activeSubscriptionKey` that evaluates to `teacherId` when `status =
-- 'ACTIVE'` and to NULL otherwise, and put a unique index on
-- (studentId, activeSubscriptionKey).
--
-- Because MySQL unique indexes treat NULL values as distinct, historical
-- CANCELLED/EXPIRED rows are allowed to coexist (their key is NULL), while at
-- most one ACTIVE row can exist for the same (studentId, teacherId) pair.
--
-- NOTES:
--  * VIRTUAL (not STORED) is required: on MySQL 8.4 / InnoDB, adding a STORED
--    generated column whose expression references a column involved in a
--    foreign key fails with ER_CANNOT_ADD_FOREIGN (1215). VIRTUAL columns are
--    still indexable in MySQL 8 and InnoDB enforces the unique index on them.
--  * MySQL requires the column to exist before it can be used in an index, so
--    the ADD COLUMN and CREATE UNIQUE INDEX are kept as separate statements.
ALTER TABLE `Subscription`
  ADD COLUMN `activeSubscriptionKey` INTEGER AS (
    CASE WHEN `status` = 'ACTIVE' THEN `teacherId` ELSE NULL END
  ) VIRTUAL;

-- Uniquely identify the one ACTIVE subscription per (student, teacher) pair.
CREATE UNIQUE INDEX `Subscription_studentId_activeSubscriptionKey_key`
  ON `Subscription`(`studentId`, `activeSubscriptionKey`);