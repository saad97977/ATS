-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "company_office_id" TEXT,
ADD COLUMN     "max_positions" INTEGER,
ADD COLUMN     "open_positions" INTEGER;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_company_office_id_fkey" FOREIGN KEY ("company_office_id") REFERENCES "company_offices"("company_office_id") ON DELETE SET NULL ON UPDATE CASCADE;
