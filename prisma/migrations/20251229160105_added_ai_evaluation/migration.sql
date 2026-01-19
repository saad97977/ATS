/*
  Warnings:

  - Added the required column `job_id` to the `pipeline_stages` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "pipeline_stages" ADD COLUMN     "job_id" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "pipeline_stages" ADD CONSTRAINT "pipeline_stages_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("job_id") ON DELETE CASCADE ON UPDATE CASCADE;
