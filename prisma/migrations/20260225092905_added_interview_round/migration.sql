/*
  Warnings:

  - A unique constraint covering the columns `[application_id,round]` on the table `interviews` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "interviews_application_id_key";

-- AlterTable
ALTER TABLE "interviews" ADD COLUMN     "round" INTEGER DEFAULT 1,
ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- CreateIndex
CREATE UNIQUE INDEX "interviews_application_id_round_key" ON "interviews"("application_id", "round");
