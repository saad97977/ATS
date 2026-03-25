/*
  Warnings:

  - You are about to drop the column `contact_id` on the `contact_jobs` table. All the data in the column will be lost.
  - You are about to drop the column `contact_id` on the `contact_previews` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[organization_user_id,job_id]` on the table `contact_jobs` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "contact_jobs" DROP CONSTRAINT "contact_jobs_contact_id_fkey";

-- DropForeignKey
ALTER TABLE "contact_previews" DROP CONSTRAINT "contact_previews_contact_id_fkey";

-- DropIndex
DROP INDEX "contact_jobs_contact_id_idx";

-- DropIndex
DROP INDEX "contact_jobs_contact_id_job_id_key";

-- DropIndex
DROP INDEX "contact_previews_contact_id_idx";

-- AlterTable
ALTER TABLE "contact_jobs" DROP COLUMN "contact_id",
ADD COLUMN     "organization_user_id" TEXT;

-- AlterTable
ALTER TABLE "contact_previews" DROP COLUMN "contact_id",
ADD COLUMN     "organization_user_id" TEXT;

-- CreateIndex
CREATE INDEX "contact_jobs_organization_user_id_idx" ON "contact_jobs"("organization_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "contact_jobs_organization_user_id_job_id_key" ON "contact_jobs"("organization_user_id", "job_id");

-- CreateIndex
CREATE INDEX "contact_previews_organization_user_id_idx" ON "contact_previews"("organization_user_id");

-- AddForeignKey
ALTER TABLE "contact_previews" ADD CONSTRAINT "contact_previews_organization_user_id_fkey" FOREIGN KEY ("organization_user_id") REFERENCES "organization_users"("organization_user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_jobs" ADD CONSTRAINT "contact_jobs_organization_user_id_fkey" FOREIGN KEY ("organization_user_id") REFERENCES "organization_users"("organization_user_id") ON DELETE CASCADE ON UPDATE CASCADE;
