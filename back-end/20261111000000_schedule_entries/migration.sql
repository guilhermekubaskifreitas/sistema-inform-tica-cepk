-- AlterTable
ALTER TABLE "reservations" ALTER COLUMN "labId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "schedule_entries" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "periodId" TEXT NOT NULL,
    "professor" VARCHAR(120) NOT NULL,
    "subject" VARCHAR(160) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedule_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "schedule_entries_labId_weekday_periodId_key" ON "schedule_entries"("labId", "weekday", "periodId");

-- CreateIndex
CREATE INDEX "schedule_entries_weekday_periodId_idx" ON "schedule_entries"("weekday", "periodId");

-- AddForeignKey
ALTER TABLE "schedule_entries" ADD CONSTRAINT "schedule_entries_labId_fkey" FOREIGN KEY ("labId") REFERENCES "labs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_entries" ADD CONSTRAINT "schedule_entries_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;
