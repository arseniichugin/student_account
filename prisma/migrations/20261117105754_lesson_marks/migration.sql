-- CreateTable
CREATE TABLE "Mark" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "lessonId" TEXT,
    "lessonOid" TEXT NOT NULL,
    "disciplineId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "startTime" TEXT NOT NULL,
    "lessonKind" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Mark_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Mark_studentId_date_idx" ON "Mark"("studentId", "date");

-- CreateIndex
CREATE INDEX "Mark_lessonId_idx" ON "Mark"("lessonId");

-- CreateIndex
CREATE INDEX "Mark_lessonOid_idx" ON "Mark"("lessonOid");

-- CreateIndex
CREATE INDEX "Mark_createdById_createdAt_idx" ON "Mark"("createdById", "createdAt");

-- AddForeignKey
ALTER TABLE "Mark" ADD CONSTRAINT "Mark_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mark" ADD CONSTRAINT "Mark_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mark" ADD CONSTRAINT "Mark_disciplineId_fkey" FOREIGN KEY ("disciplineId") REFERENCES "Discipline"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mark" ADD CONSTRAINT "Mark_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Оценка — только 1–5 (Prisma не умеет описывать CHECK в схеме, поэтому — вручную)
ALTER TABLE "Mark" ADD CONSTRAINT "Mark_value_check" CHECK ("value" BETWEEN 1 AND 5);
