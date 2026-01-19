/*
  Warnings:

  - Made the column `external_posting_id` on table `job_postings` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `hours` to the `job_rates` table without a default value. This is not possible if the table is not empty.
  - Added the required column `creator_id` to the `jobs` table without a default value. This is not possible if the table is not empty.
  - Added the required column `location` to the `jobs` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "job_postings" ALTER COLUMN "external_posting_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "job_rates" ADD COLUMN     "hours" INTEGER NOT NULL,
ALTER COLUMN "pay_rate" DROP NOT NULL,
ALTER COLUMN "markup_percentage" DROP NOT NULL;

-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "creator_id" TEXT NOT NULL,
ADD COLUMN     "location" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "jobs_creator_id_idx" ON "jobs"("creator_id");

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
