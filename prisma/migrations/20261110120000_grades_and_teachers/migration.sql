-- Успеваемость: роль TEACHER, учётная запись преподавателя, назначения «преподаватель × дисциплина × группа»,
-- перестроенная модель оценок (срезы 1–3 в баллах 0–100, экзамен, зачёт), уведомление GRADE.
-- Прежние оценки — демо-контент старого формата: их пересоздаёт npm run db:seed.
DELETE FROM "Grade";
-- CreateEnum
CREATE TYPE "FinalKind" AS ENUM ('EXAM', 'CREDIT');

-- AlterEnum
BEGIN;
CREATE TYPE "GradeKind_new" AS ENUM ('CHECKPOINT', 'EXAM', 'CREDIT');
ALTER TABLE "Grade" ALTER COLUMN "kind" TYPE "GradeKind_new" USING ("kind"::text::"GradeKind_new");
ALTER TYPE "GradeKind" RENAME TO "GradeKind_old";
ALTER TYPE "GradeKind_new" RENAME TO "GradeKind";
DROP TYPE "public"."GradeKind_old";
COMMIT;

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'GRADE';

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'TEACHER';

-- DropIndex
DROP INDEX "Grade_studentId_semester_idx";

-- AlterTable
ALTER TABLE "Grade" DROP COLUMN "date",
DROP COLUMN "value",
ADD COLUMN     "checkpoint" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "gradedByTeacherId" TEXT,
ADD COLUMN     "passed" BOOLEAN,
ADD COLUMN     "points" INTEGER,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "Teacher" ADD COLUMN     "userId" TEXT;

-- CreateTable
CREATE TABLE "TeachingAssignment" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "disciplineId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "finalKind" "FinalKind",
    "finalDate" DATE,

    CONSTRAINT "TeachingAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TeachingAssignment_groupId_disciplineId_idx" ON "TeachingAssignment"("groupId", "disciplineId");

-- CreateIndex
CREATE UNIQUE INDEX "TeachingAssignment_teacherId_disciplineId_groupId_key" ON "TeachingAssignment"("teacherId", "disciplineId", "groupId");

-- CreateIndex
CREATE INDEX "Grade_disciplineId_semester_idx" ON "Grade"("disciplineId", "semester");

-- CreateIndex
CREATE UNIQUE INDEX "Grade_studentId_disciplineId_semester_kind_checkpoint_key" ON "Grade"("studentId", "disciplineId", "semester", "kind", "checkpoint");

-- CreateIndex
CREATE UNIQUE INDEX "Teacher_userId_key" ON "Teacher"("userId");

-- AddForeignKey
ALTER TABLE "Teacher" ADD CONSTRAINT "Teacher_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeachingAssignment" ADD CONSTRAINT "TeachingAssignment_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeachingAssignment" ADD CONSTRAINT "TeachingAssignment_disciplineId_fkey" FOREIGN KEY ("disciplineId") REFERENCES "Discipline"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeachingAssignment" ADD CONSTRAINT "TeachingAssignment_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Grade" ADD CONSTRAINT "Grade_gradedByTeacherId_fkey" FOREIGN KEY ("gradedByTeacherId") REFERENCES "Teacher"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Дополнительная защита на уровне базы (Prisma такие ограничения не описывает, но и не удаляет):
-- баллы 0–100; срез — номер 1–3 и баллы; экзамен — баллы; зачёт — «зачтено / не зачтено».
ALTER TABLE "Grade" ADD CONSTRAINT "Grade_points_range" CHECK ("points" IS NULL OR ("points" >= 0 AND "points" <= 100));
ALTER TABLE "Grade" ADD CONSTRAINT "Grade_kind_shape" CHECK (
  ("kind" = 'CHECKPOINT' AND "checkpoint" BETWEEN 1 AND 3 AND "points" IS NOT NULL AND "passed" IS NULL)
  OR ("kind" = 'EXAM' AND "checkpoint" = 0 AND "points" IS NOT NULL AND "passed" IS NULL)
  OR ("kind" = 'CREDIT' AND "checkpoint" = 0 AND "points" IS NULL AND "passed" IS NOT NULL)
);
