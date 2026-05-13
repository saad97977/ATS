/*
  Warnings:

  - Added the required column `sections_included` to the `job_templates` table without a default value. This is not possible if the table is not empty.
  - Added the required column `snapshot` to the `job_templates` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "job_templates" ADD COLUMN     "sections_included" JSONB NOT NULL,
ADD COLUMN     "snapshot" JSONB NOT NULL;
