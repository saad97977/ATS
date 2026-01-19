/*
  Warnings:

  - A unique constraint covering the columns `[application_id]` on the table `application_evaluations` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "application_evaluations_application_id_key" ON "application_evaluations"("application_id");
