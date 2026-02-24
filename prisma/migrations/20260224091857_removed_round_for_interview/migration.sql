/*
  Warnings:

  - You are about to drop the column `round` on the `interviews` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[application_id]` on the table `interviews` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "interviews_application_id_round_key";

-- AlterTable
ALTER TABLE "interviews" DROP COLUMN "round";

-- CreateIndex
CREATE UNIQUE INDEX "interviews_application_id_key" ON "interviews"("application_id");
