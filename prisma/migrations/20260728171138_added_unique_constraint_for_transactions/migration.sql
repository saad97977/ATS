/*
  Warnings:

  - A unique constraint covering the columns `[assignment_id,week_worked]` on the table `payroll_transactions` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "payroll_transactions_assignment_id_week_worked_key" ON "payroll_transactions"("assignment_id", "week_worked");
