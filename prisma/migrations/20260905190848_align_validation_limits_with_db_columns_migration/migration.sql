-- AlterTable
ALTER TABLE `admin` MODIFY `email` VARCHAR(254) NOT NULL;

-- AlterTable
ALTER TABLE `student` MODIFY `email` VARCHAR(254) NOT NULL;

-- AlterTable
ALTER TABLE `teacher` MODIFY `email` VARCHAR(254) NOT NULL;

-- AlterTable
ALTER TABLE `teachercontent` MODIFY `title` VARCHAR(255) NOT NULL,
    MODIFY `fileUrl` VARCHAR(500) NULL;
