-- AlterTable
ALTER TABLE "User" ADD COLUMN     "about" TEXT,
ADD COLUMN     "aboutUpdatedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AboutEdit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AboutEdit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AboutEdit_userId_createdAt_idx" ON "AboutEdit"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "AboutEdit" ADD CONSTRAINT "AboutEdit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

