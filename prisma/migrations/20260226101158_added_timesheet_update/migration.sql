-- AlterTable
ALTER TABLE "assignments" ADD COLUMN     "timesheets_enabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "timesheets" ADD COLUMN     "custom_bill_rate" DECIMAL(10,2),
ADD COLUMN     "custom_markup_percentage" DECIMAL(5,2),
ADD COLUMN     "custom_ot_bill_rate" DECIMAL(10,2),
ADD COLUMN     "custom_ot_pay_rate" DECIMAL(10,2),
ADD COLUMN     "custom_overtime_rule" TEXT,
ADD COLUMN     "custom_pay_rate" DECIMAL(10,2),
ADD COLUMN     "import_id" TEXT,
ADD COLUMN     "rate_override_reason" TEXT;

-- CreateTable
CREATE TABLE "timesheet_imports" (
    "import_id" TEXT NOT NULL,
    "assignment_id" TEXT NOT NULL,
    "imported_by" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_type" TEXT NOT NULL,
    "row_count" INTEGER NOT NULL DEFAULT 0,
    "success_count" INTEGER NOT NULL DEFAULT 0,
    "error_count" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB,
    "status" TEXT NOT NULL DEFAULT 'PROCESSING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "timesheet_imports_pkey" PRIMARY KEY ("import_id")
);

-- CreateIndex
CREATE INDEX "timesheet_imports_assignment_id_idx" ON "timesheet_imports"("assignment_id");

-- AddForeignKey
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "timesheet_imports"("import_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheet_imports" ADD CONSTRAINT "timesheet_imports_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("assignment_id") ON DELETE CASCADE ON UPDATE CASCADE;
