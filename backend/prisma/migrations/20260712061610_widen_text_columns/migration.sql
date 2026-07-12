-- AlterTable
ALTER TABLE `Asset` MODIFY `location` VARCHAR(255) NULL,
    MODIFY `qrCode` TEXT NULL;

-- AlterTable
ALTER TABLE `AssetAllocation` MODIFY `returnNotes` TEXT NULL;

-- AlterTable
ALTER TABLE `AssetCategory` MODIFY `description` TEXT NULL;

-- AlterTable
ALTER TABLE `AssetTransfer` MODIFY `reason` TEXT NULL;

-- AlterTable
ALTER TABLE `Attachment` MODIFY `fileName` VARCHAR(255) NOT NULL,
    MODIFY `fileUrl` TEXT NOT NULL;

-- AlterTable
ALTER TABLE `AuditCycle` MODIFY `title` VARCHAR(255) NOT NULL,
    MODIFY `description` TEXT NULL,
    MODIFY `location` VARCHAR(255) NULL;

-- AlterTable
ALTER TABLE `AuditItem` MODIFY `remarks` TEXT NULL;

-- AlterTable
ALTER TABLE `Department` MODIFY `description` TEXT NULL;

-- AlterTable
ALTER TABLE `MaintenanceRequest` MODIFY `issue` TEXT NOT NULL,
    MODIFY `resolutionNotes` TEXT NULL;

-- AlterTable
ALTER TABLE `Notification` MODIFY `message` TEXT NOT NULL;

-- AlterTable
ALTER TABLE `ResourceBooking` MODIFY `remarks` TEXT NULL;
