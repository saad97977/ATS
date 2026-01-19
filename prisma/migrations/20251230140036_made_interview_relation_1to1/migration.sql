/*
  Warnings:

  - A unique constraint covering the columns `[application_id]` on the table `interviews` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "interviews_application_id_key" ON "interviews"("application_id");
