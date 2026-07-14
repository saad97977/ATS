-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('OPEN', 'VERIFIED', 'CLOSED');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('DRAFT', 'VERIFIED', 'ERROR');

-- CreateEnum
CREATE TYPE "TransactionEarningType" AS ENUM ('REGULAR', 'OVERTIME', 'DOUBLETIME', 'HOLIDAY', 'PTO', 'SICK', 'BONUS');

-- CreateTable
CREATE TABLE "transaction_batches" (
    "batch_id" TEXT NOT NULL,
    "batch_number" SERIAL NOT NULL,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accounting_period" TIMESTAMP(3) NOT NULL,
    "description" TEXT,
    "status" "BatchStatus" NOT NULL DEFAULT 'OPEN',
    "created_by_user_id" TEXT NOT NULL,
    "verified_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "verification_errors" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transaction_batches_pkey" PRIMARY KEY ("batch_id")
);

-- CreateTable
CREATE TABLE "payroll_transactions" (
    "transaction_id" TEXT NOT NULL,
    "transaction_number" SERIAL NOT NULL,
    "batch_id" TEXT NOT NULL,
    "assignment_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "job_id" TEXT,
    "department" TEXT,
    "job_position" TEXT,
    "branch" TEXT,
    "week_worked" TIMESTAMP(3) NOT NULL,
    "bill_units_equal_pay_units" BOOLEAN NOT NULL DEFAULT false,
    "status" "TransactionStatus" NOT NULL DEFAULT 'DRAFT',
    "error_messages" JSONB,
    "total_pay_units" DECIMAL(10,2),
    "total_bill_units" DECIMAL(10,2),
    "total_pay_amount" DECIMAL(14,2),
    "total_bill_amount" DECIMAL(14,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_transactions_pkey" PRIMARY KEY ("transaction_id")
);

-- CreateTable
CREATE TABLE "payroll_transaction_lines" (
    "line_id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "earning_type" "TransactionEarningType" NOT NULL DEFAULT 'REGULAR',
    "pay_units" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "bill_units" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "pay_rate" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "bill_rate" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "item_pay" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "item_bill" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_transaction_lines_pkey" PRIMARY KEY ("line_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "transaction_batches_batch_number_key" ON "transaction_batches"("batch_number");

-- CreateIndex
CREATE INDEX "transaction_batches_created_by_user_id_idx" ON "transaction_batches"("created_by_user_id");

-- CreateIndex
CREATE INDEX "transaction_batches_status_idx" ON "transaction_batches"("status");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_transactions_transaction_number_key" ON "payroll_transactions"("transaction_number");

-- CreateIndex
CREATE INDEX "payroll_transactions_batch_id_idx" ON "payroll_transactions"("batch_id");

-- CreateIndex
CREATE INDEX "payroll_transactions_assignment_id_idx" ON "payroll_transactions"("assignment_id");

-- CreateIndex
CREATE INDEX "payroll_transactions_organization_id_idx" ON "payroll_transactions"("organization_id");

-- CreateIndex
CREATE INDEX "payroll_transactions_job_id_idx" ON "payroll_transactions"("job_id");

-- CreateIndex
CREATE INDEX "payroll_transactions_batch_id_status_idx" ON "payroll_transactions"("batch_id", "status");

-- CreateIndex
CREATE INDEX "payroll_transaction_lines_transaction_id_idx" ON "payroll_transaction_lines"("transaction_id");

-- AddForeignKey
ALTER TABLE "transaction_batches" ADD CONSTRAINT "transaction_batches_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_transactions" ADD CONSTRAINT "payroll_transactions_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "transaction_batches"("batch_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_transactions" ADD CONSTRAINT "payroll_transactions_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("assignment_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_transactions" ADD CONSTRAINT "payroll_transactions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_transactions" ADD CONSTRAINT "payroll_transactions_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("job_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_transaction_lines" ADD CONSTRAINT "payroll_transaction_lines_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "payroll_transactions"("transaction_id") ON DELETE CASCADE ON UPDATE CASCADE;
