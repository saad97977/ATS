/*
  Warnings:

  - You are about to drop the column `job_id` on the `pipeline_stages` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "pipeline_stages" DROP CONSTRAINT "pipeline_stages_job_id_fkey";

-- AlterTable
ALTER TABLE "pipeline_stages" DROP COLUMN "job_id";
