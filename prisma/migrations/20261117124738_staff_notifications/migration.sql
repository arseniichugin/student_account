-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'EXAM';

-- AlterTable
ALTER TABLE "Announcement" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "kind" "NotificationType" NOT NULL DEFAULT 'ANNOUNCEMENT';

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "announcementId" TEXT;

-- CreateIndex
CREATE INDEX "Announcement_facultyId_publishedAt_idx" ON "Announcement"("facultyId", "publishedAt");

-- CreateIndex
CREATE INDEX "Notification_announcementId_idx" ON "Notification"("announcementId");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
