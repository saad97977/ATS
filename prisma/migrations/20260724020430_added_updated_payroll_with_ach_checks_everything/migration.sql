-- CreateEnum
CREATE TYPE "PayrollRunType" AS ENUM ('Advance Bank Payout', 'Check Run', 'Check Reissue', 'Check Reverse', 'Check Void', 'Clear AP Items', 'Deduction Authority Pay', 'SubAgency Pay', 'Direct Deposit', 'Direct Deposit Reissue', 'Direct Deposit Reverse', 'Manual Check', 'Manual Check Void', 'Off Cycle Payroll', 'On Cycle Payroll', 'Bonus Check', 'Commission Check', 'Expense Reimbursement', 'Adjustment', 'Payroll Correction', 'Replacement Check', 'Final Pay', 'Termination Pay', 'Holiday Pay', 'Vacation Pay', 'Sick Pay', 'Retroactive Pay', 'Third Party Payment', 'Garnishment Payment', 'Tax Payment', 'ACH Payment', 'Wire Transfer', 'Cash Payment', 'Net Pay Adjustment', 'Year End Adjustment', 'Other');

-- CreateEnum
CREATE TYPE "PayrollBatchStatus" AS ENUM ('DRAFT', 'PROCESSED', 'CHECKS_PRINTED', 'POSTED', 'VOIDED');

-- CreateEnum
CREATE TYPE "PayrollCheckStatus" AS ENUM ('PENDING', 'PRINTED', 'VERIFIED_OK', 'CORRECTION_NEEDED', 'POSTED', 'VOIDED');

-- CreateEnum
CREATE TYPE "BillingBatchType" AS ENUM ('WEEKLY_BILLING', 'OFF_CYCLE_BILLING', 'ADJUSTMENT_BILLING', 'CREDIT_MEMO', 'MANUAL_INVOICE', 'CORRECTION');

-- CreateEnum
CREATE TYPE "BillingBatchStatus" AS ENUM ('DRAFT', 'PROCESSED', 'POSTED', 'DISCARDED');

-- AlterTable
ALTER TABLE "bank_accounts" ADD COLUMN     "prenote_approve_date" TIMESTAMP(3),
ADD COLUMN     "prenote_send_date" TIMESTAMP(3),
ADD COLUMN     "sequence" INTEGER DEFAULT 1;

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "do_not_invoice" BOOLEAN DEFAULT false,
ADD COLUMN     "invoice_net_terms_days" INTEGER DEFAULT 30;

-- AlterTable
ALTER TABLE "payroll_transactions" ADD COLUMN     "payroll_batch_id" TEXT,
ADD COLUMN     "removed_from_batch_reason" TEXT;

-- CreateTable
CREATE TABLE "wc_codes" (
    "wc_code_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "insurance_rate" DECIMAL(6,4) NOT NULL,
    "cost_pct" DECIMAL(6,4),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wc_codes_pkey" PRIMARY KEY ("wc_code_id")
);

-- CreateTable
CREATE TABLE "company_bank_accounts" (
    "company_bank_account_id" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "description" TEXT,
    "ach_company_id" TEXT NOT NULL,
    "ach_company_name" TEXT NOT NULL,
    "originating_bank_name" TEXT NOT NULL,
    "originating_dfi_id" TEXT NOT NULL,
    "routing_number" TEXT NOT NULL,
    "account_number" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_bank_accounts_pkey" PRIMARY KEY ("company_bank_account_id")
);

-- CreateTable
CREATE TABLE "payroll_batches" (
    "payroll_batch_id" TEXT NOT NULL,
    "batch_number" SERIAL NOT NULL,
    "accounting_period" TIMESTAMP(3) NOT NULL,
    "check_date" TIMESTAMP(3) NOT NULL,
    "run_type" "PayrollRunType" NOT NULL,
    "bank_id" TEXT NOT NULL,
    "description" TEXT,
    "message" TEXT,
    "status" "PayrollBatchStatus" NOT NULL DEFAULT 'DRAFT',
    "created_by_user_id" TEXT NOT NULL,
    "processed_at" TIMESTAMP(3),
    "checks_printed_at" TIMESTAMP(3),
    "posted_at" TIMESTAMP(3),
    "posted_by_user_id" TEXT,
    "voided_at" TIMESTAMP(3),
    "void_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_batches_pkey" PRIMARY KEY ("payroll_batch_id")
);

-- CreateTable
CREATE TABLE "payroll_checks" (
    "payroll_check_id" TEXT NOT NULL,
    "payroll_batch_id" TEXT NOT NULL,
    "applicant_id" TEXT NOT NULL,
    "check_number" TEXT,
    "status" "PayrollCheckStatus" NOT NULL DEFAULT 'PENDING',
    "gross_pay" DECIMAL(14,2) NOT NULL,
    "federal_tax" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "state_tax" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "local_tax" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "employee_ss" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "employee_medicare" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "benefit_deductions_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "garnishments_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "deduction_breakdown" JSONB,
    "net_pay" DECIMAL(14,2) NOT NULL,
    "ytd_gross_snapshot" DECIMAL(14,2),
    "ytd_tax_snapshot" JSONB,
    "is_direct_deposit" BOOLEAN NOT NULL DEFAULT false,
    "correction_reason" TEXT,
    "printed_at" TIMESTAMP(3),
    "verified_at" TIMESTAMP(3),
    "verified_by_user_id" TEXT,
    "posted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_checks_pkey" PRIMARY KEY ("payroll_check_id")
);

-- CreateTable
CREATE TABLE "payroll_check_lines" (
    "payroll_check_line_id" TEXT NOT NULL,
    "payroll_check_id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "week_worked" TIMESTAMP(3) NOT NULL,
    "customer_name" TEXT NOT NULL,
    "department" TEXT,
    "earning_type" TEXT NOT NULL,
    "hours" DECIMAL(10,2) NOT NULL,
    "pay_rate" DECIMAL(10,2) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "payroll_check_lines_pkey" PRIMARY KEY ("payroll_check_line_id")
);

-- CreateTable
CREATE TABLE "ach_files" (
    "ach_file_id" TEXT NOT NULL,
    "payroll_batch_id" TEXT NOT NULL,
    "company_bank_account_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_content" TEXT NOT NULL,
    "total_amount" DECIMAL(14,2) NOT NULL,
    "entry_count" INTEGER NOT NULL,
    "accounting_period" TIMESTAMP(3) NOT NULL,
    "effective_date" TIMESTAMP(3) NOT NULL,
    "include_balancing_line" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'GENERATED',
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "transmitted_at" TIMESTAMP(3),

    CONSTRAINT "ach_files_pkey" PRIMARY KEY ("ach_file_id")
);

-- CreateTable
CREATE TABLE "billing_batches" (
    "billing_batch_id" TEXT NOT NULL,
    "batch_number" SERIAL NOT NULL,
    "accounting_period" TIMESTAMP(3) NOT NULL,
    "invoice_date" TIMESTAMP(3) NOT NULL,
    "batch_type" "BillingBatchType" NOT NULL,
    "description" TEXT,
    "status" "BillingBatchStatus" NOT NULL DEFAULT 'DRAFT',
    "created_by_user_id" TEXT NOT NULL,
    "processed_at" TIMESTAMP(3),
    "posted_at" TIMESTAMP(3),
    "posted_by_user_id" TEXT,
    "discarded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_batches_pkey" PRIMARY KEY ("billing_batch_id")
);

-- CreateTable
CREATE TABLE "client_invoices" (
    "client_invoice_id" TEXT NOT NULL,
    "billing_batch_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "invoice_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_date" TIMESTAMP(3) NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "tax_rate" DECIMAL(6,4) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(14,2) NOT NULL,
    "paid_at" TIMESTAMP(3),
    "emailed_at" TIMESTAMP(3),
    "pdf_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_invoices_pkey" PRIMARY KEY ("client_invoice_id")
);

-- CreateTable
CREATE TABLE "client_invoice_lines" (
    "client_invoice_line_id" TEXT NOT NULL,
    "client_invoice_id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "employee_name" TEXT NOT NULL,
    "department" TEXT,
    "earning_type" TEXT NOT NULL,
    "bill_units" DECIMAL(10,2) NOT NULL,
    "bill_rate" DECIMAL(10,2) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "client_invoice_lines_pkey" PRIMARY KEY ("client_invoice_line_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "wc_codes_code_key" ON "wc_codes"("code");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_batches_batch_number_key" ON "payroll_batches"("batch_number");

-- CreateIndex
CREATE INDEX "payroll_batches_status_idx" ON "payroll_batches"("status");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_checks_check_number_key" ON "payroll_checks"("check_number");

-- CreateIndex
CREATE INDEX "payroll_checks_payroll_batch_id_idx" ON "payroll_checks"("payroll_batch_id");

-- CreateIndex
CREATE INDEX "payroll_checks_applicant_id_idx" ON "payroll_checks"("applicant_id");

-- CreateIndex
CREATE INDEX "payroll_check_lines_payroll_check_id_idx" ON "payroll_check_lines"("payroll_check_id");

-- CreateIndex
CREATE INDEX "ach_files_payroll_batch_id_idx" ON "ach_files"("payroll_batch_id");

-- CreateIndex
CREATE UNIQUE INDEX "billing_batches_batch_number_key" ON "billing_batches"("batch_number");

-- CreateIndex
CREATE UNIQUE INDEX "client_invoices_invoice_number_key" ON "client_invoices"("invoice_number");

-- CreateIndex
CREATE INDEX "client_invoices_billing_batch_id_idx" ON "client_invoices"("billing_batch_id");

-- CreateIndex
CREATE INDEX "client_invoices_organization_id_idx" ON "client_invoices"("organization_id");

-- CreateIndex
CREATE INDEX "client_invoice_lines_client_invoice_id_idx" ON "client_invoice_lines"("client_invoice_id");

-- AddForeignKey
ALTER TABLE "payroll_transactions" ADD CONSTRAINT "payroll_transactions_payroll_batch_id_fkey" FOREIGN KEY ("payroll_batch_id") REFERENCES "payroll_batches"("payroll_batch_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_batches" ADD CONSTRAINT "payroll_batches_bank_id_fkey" FOREIGN KEY ("bank_id") REFERENCES "company_bank_accounts"("company_bank_account_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_checks" ADD CONSTRAINT "payroll_checks_payroll_batch_id_fkey" FOREIGN KEY ("payroll_batch_id") REFERENCES "payroll_batches"("payroll_batch_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_checks" ADD CONSTRAINT "payroll_checks_applicant_id_fkey" FOREIGN KEY ("applicant_id") REFERENCES "applicants"("applicant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_check_lines" ADD CONSTRAINT "payroll_check_lines_payroll_check_id_fkey" FOREIGN KEY ("payroll_check_id") REFERENCES "payroll_checks"("payroll_check_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ach_files" ADD CONSTRAINT "ach_files_payroll_batch_id_fkey" FOREIGN KEY ("payroll_batch_id") REFERENCES "payroll_batches"("payroll_batch_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ach_files" ADD CONSTRAINT "ach_files_company_bank_account_id_fkey" FOREIGN KEY ("company_bank_account_id") REFERENCES "company_bank_accounts"("company_bank_account_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_invoices" ADD CONSTRAINT "client_invoices_billing_batch_id_fkey" FOREIGN KEY ("billing_batch_id") REFERENCES "billing_batches"("billing_batch_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_invoices" ADD CONSTRAINT "client_invoices_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_invoice_lines" ADD CONSTRAINT "client_invoice_lines_client_invoice_id_fkey" FOREIGN KEY ("client_invoice_id") REFERENCES "client_invoices"("client_invoice_id") ON DELETE CASCADE ON UPDATE CASCADE;
