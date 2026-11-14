-- AlterTable
ALTER TABLE "schedule_entries" ADD COLUMN     "classId" TEXT;

-- AddForeignKey
ALTER TABLE "schedule_entries" ADD CONSTRAINT "schedule_entries_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"(id) ON DELETE SET NULL ON UPDATE CASCADE;
