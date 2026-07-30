-- DropForeignKey
ALTER TABLE "payroll_checks" DROP CONSTRAINT "payroll_checks_applicant_id_fkey";

-- AlterTable
ALTER TABLE "assignments" ADD COLUMN     "agency_id" TEXT;

-- AlterTable
ALTER TABLE "custom_earning_types" ADD COLUMN     "is_billable" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "is_taxable" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "multiplier" DECIMAL(5,2) NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "invoice_delivery_method" TEXT DEFAULT 'EMAIL',
ADD COLUMN     "invoice_grouping" TEXT DEFAULT 'DEPARTMENT',
ADD COLUMN     "invoice_sort_order" TEXT DEFAULT 'EMPLOYEE_NAME',
ADD COLUMN     "max_invoice_amount" DECIMAL(14,2),
ADD COLUMN     "require_timecard_attachment" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "payroll_batches" ADD COLUMN     "reopen_reason" TEXT,
ADD COLUMN     "reopened_at" TIMESTAMP(3),
ADD COLUMN     "reopened_by_user_id" TEXT;

-- AlterTable
ALTER TABLE "payroll_checks" ADD COLUMN     "agency_id" TEXT,
ADD COLUMN     "employer_futa" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "employer_medicare" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "employer_ss" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "employer_suta" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "employer_wc_cost" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "total_employer_cost" DECIMAL(14,2) NOT NULL DEFAULT 0,
ALTER COLUMN "applicant_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "payroll_transactions" ADD COLUMN     "error_override" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "error_override_reason" TEXT;

-- CreateTable
CREATE TABLE "agencies" (
    "agency_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact_name" TEXT,
    "contact_email" TEXT,
    "contact_phone" TEXT,
    "address" TEXT,
    "bank_name" TEXT,
    "routing_number" TEXT,
    "account_number" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agencies_pkey" PRIMARY KEY ("agency_id")
);

-- CreateTable
CREATE TABLE "tax_brackets" (
    "tax_bracket_id" TEXT NOT NULL,
    "tax_year" INTEGER NOT NULL,
    "filing_status" TEXT NOT NULL,
    "min_annual_income" DECIMAL(12,2) NOT NULL,
    "max_annual_income" DECIMAL(12,2),
    "rate" DECIMAL(6,4) NOT NULL,
    "base_tax" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "tax_brackets_pkey" PRIMARY KEY ("tax_bracket_id")
);

-- CreateTable
CREATE TABLE "state_tax_rates" (
    "state_tax_rate_id" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "flat_rate" DECIMAL(6,4) NOT NULL,
    "tax_year" INTEGER NOT NULL,
    "notes" TEXT,

    CONSTRAINT "state_tax_rates_pkey" PRIMARY KEY ("state_tax_rate_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agencies_name_key" ON "agencies"("name");

-- CreateIndex
CREATE INDEX "tax_brackets_tax_year_filing_status_idx" ON "tax_brackets"("tax_year", "filing_status");

-- CreateIndex
CREATE UNIQUE INDEX "state_tax_rates_state_key" ON "state_tax_rates"("state");

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("agency_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_checks" ADD CONSTRAINT "payroll_checks_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("agency_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_checks" ADD CONSTRAINT "payroll_checks_applicant_id_fkey" FOREIGN KEY ("applicant_id") REFERENCES "applicants"("applicant_id") ON DELETE SET NULL ON UPDATE CASCADE;
