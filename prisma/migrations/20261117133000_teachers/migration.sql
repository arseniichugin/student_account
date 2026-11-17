-- CreateEnum
CREATE TYPE "AnnouncementAudience" AS ENUM ('FACULTY', 'COURSE', 'GROUP', 'ALL_TEACHERS', 'TEACHER', 'MY_GROUPS');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'TEACHER';

-- AlterTable
ALTER TABLE "Announcement" ADD COLUMN     "audience" "AnnouncementAudience" NOT NULL DEFAULT 'FACULTY',
ADD COLUMN     "teacherId" TEXT;

-- AlterTable
ALTER TABLE "Mark" ADD COLUMN     "teacherId" TEXT;

-- AlterTable
ALTER TABLE "Teacher" ADD COLUMN     "userId" TEXT;

-- CreateIndex
CREATE INDEX "Mark_teacherId_createdAt_idx" ON "Mark"("teacherId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Teacher_userId_key" ON "Teacher"("userId");

-- AddForeignKey
ALTER TABLE "Teacher" ADD CONSTRAINT "Teacher_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mark" ADD CONSTRAINT "Mark_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Аудитория уже созданных событий — по заполненным полям
UPDATE "Announcement" SET "audience" = 'GROUP' WHERE "groupId" IS NOT NULL;
UPDATE "Announcement" SET "audience" = 'COURSE' WHERE "groupId" IS NULL AND "course" IS NOT NULL;
