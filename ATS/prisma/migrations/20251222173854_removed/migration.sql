/*
  Warnings:

  - You are about to drop the column `creator_id` on the `jobs` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "jobs" DROP CONSTRAINT "jobs_creator_id_fkey";

-- DropIndex
DROP INDEX "jobs_creator_id_idx";

-- AlterTable
ALTER TABLE "jobs" DROP COLUMN "creator_id";
