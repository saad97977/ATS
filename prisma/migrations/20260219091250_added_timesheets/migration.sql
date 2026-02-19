/*
  Warnings:

  - You are about to drop the column `hours` on the `time_entries` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `time_entries` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[timesheet_id]` on the table `payrolls` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[timesheet_id,work_date]` on the table `time_entries` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `pay_rate` to the `payrolls` table without a default value. This is not possible if the table is not empty.
  - Added the required column `regular_hours` to the `payrolls` table without a default value. This is not possible if the table is not empty.
  - Added the required column `timesheet_id` to the `time_entries` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `time_entries` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "TimesheetStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'PROCESSED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'SENT', 'VIEWED', 'PAID', 'OVERDUE', 'VOID');

-- CreateEnum
CREATE TYPE "WorkType" AS ENUM ('REGULAR', 'OVERTIME', 'HOLIDAY', 'SICK', 'PTO', 'UNPAID');

-- AlterTable
ALTER TABLE "payrolls" ADD COLUMN     "ot_hours" DECIMAL(7,2) NOT NULL DEFAULT 0,
ADD COLUMN     "ot_pay_rate" DECIMAL(10,2),
ADD COLUMN     "pay_rate" DECIMAL(10,2) NOT NULL,
ADD COLUMN     "qb_payroll_id" TEXT,
ADD COLUMN     "qb_synced" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "qb_synced_at" TIMESTAMP(3),
ADD COLUMN     "regular_hours" DECIMAL(7,2) NOT NULL,
ADD COLUMN     "timesheet_id" TEXT,
ALTER COLUMN "gross_pay" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "net_pay" SET DATA TYPE DECIMAL(14,2);

-- AlterTable
ALTER TABLE "time_entries" DROP COLUMN "hours",
DROP COLUMN "status",
ADD COLUMN     "break_minutes" INTEGER DEFAULT 0,
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "ot_hours" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "regular_hours" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "timesheet_id" TEXT NOT NULL,
ADD COLUMN     "total_hours" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "work_type" "WorkType" NOT NULL DEFAULT 'REGULAR';

-- CreateTable
CREATE TABLE "timesheets" (
    "timesheet_id" TEXT NOT NULL,
    "assignment_id" TEXT NOT NULL,
    "week_start_date" TIMESTAMP(3) NOT NULL,
    "week_end_date" TIMESTAMP(3) NOT NULL,
    "status" "TimesheetStatus" NOT NULL DEFAULT 'DRAFT',
    "total_regular_hours" DECIMAL(7,2) NOT NULL DEFAULT 0,
    "total_ot_hours" DECIMAL(7,2) NOT NULL DEFAULT 0,
    "total_hours" DECIMAL(7,2) NOT NULL DEFAULT 0,
    "bill_rate" DECIMAL(10,2),
    "ot_bill_rate" DECIMAL(10,2),
    "total_bill_amount" DECIMAL(14,2),
    "pay_rate" DECIMAL(10,2),
    "ot_pay_rate" DECIMAL(10,2),
    "total_pay_amount" DECIMAL(14,2),
    "submitted_at" TIMESTAMP(3),
    "reviewed_by_user_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "rejected_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "qb_synced" BOOLEAN NOT NULL DEFAULT false,
    "qb_synced_at" TIMESTAMP(3),
    "qb_timesheet_id" TEXT,

    CONSTRAINT "timesheets_pkey" PRIMARY KEY ("timesheet_id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "invoice_id" TEXT NOT NULL,
    "assignment_id" TEXT NOT NULL,
    "timesheet_id" TEXT NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "invoice_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_date" TIMESTAMP(3) NOT NULL,
    "paid_at" TIMESTAMP(3),
    "regular_hours" DECIMAL(7,2) NOT NULL,
    "ot_hours" DECIMAL(7,2) NOT NULL DEFAULT 0,
    "bill_rate" DECIMAL(10,2) NOT NULL,
    "ot_bill_rate" DECIMAL(10,2),
    "subtotal" DECIMAL(14,2) NOT NULL,
    "tax_rate" DECIMAL(6,4) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(14,2) NOT NULL,
    "pdf_url" TEXT,
    "pdf_generated_at" TIMESTAMP(3),
    "payment_method" TEXT,
    "payment_reference" TEXT,
    "qb_invoice_id" TEXT,
    "qb_synced" BOOLEAN NOT NULL DEFAULT false,
    "qb_synced_at" TIMESTAMP(3),
    "qb_sync_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("invoice_id")
);

-- CreateIndex
CREATE INDEX "timesheets_assignment_id_idx" ON "timesheets"("assignment_id");

-- CreateIndex
CREATE INDEX "timesheets_week_start_date_idx" ON "timesheets"("week_start_date");

-- CreateIndex
CREATE INDEX "timesheets_status_idx" ON "timesheets"("status");

-- CreateIndex
CREATE UNIQUE INDEX "timesheets_assignment_id_week_start_date_key" ON "timesheets"("assignment_id", "week_start_date");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_timesheet_id_key" ON "invoices"("timesheet_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoice_number_key" ON "invoices"("invoice_number");

-- CreateIndex
CREATE INDEX "invoices_assignment_id_idx" ON "invoices"("assignment_id");

-- CreateIndex
CREATE INDEX "invoices_status_idx" ON "invoices"("status");

-- CreateIndex
CREATE INDEX "invoices_invoice_date_idx" ON "invoices"("invoice_date");

-- CreateIndex
CREATE UNIQUE INDEX "payrolls_timesheet_id_key" ON "payrolls"("timesheet_id");

-- CreateIndex
CREATE INDEX "time_entries_timesheet_id_idx" ON "time_entries"("timesheet_id");

-- CreateIndex
CREATE UNIQUE INDEX "time_entries_timesheet_id_work_date_key" ON "time_entries"("timesheet_id", "work_date");

-- AddForeignKey
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("assignment_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_timesheet_id_fkey" FOREIGN KEY ("timesheet_id") REFERENCES "timesheets"("timesheet_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("assignment_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_timesheet_id_fkey" FOREIGN KEY ("timesheet_id") REFERENCES "timesheets"("timesheet_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payrolls" ADD CONSTRAINT "payrolls_timesheet_id_fkey" FOREIGN KEY ("timesheet_id") REFERENCES "timesheets"("timesheet_id") ON DELETE SET NULL ON UPDATE CASCADE;
