/*
  Warnings:

  - A unique constraint covering the columns `[employee_number]` on the table `applicant_demographics` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "FLSAStatus" AS ENUM ('EXEMPT', 'NON_EXEMPT');

-- CreateEnum
CREATE TYPE "BankAccountType" AS ENUM ('CHECKING', 'SAVINGS');

-- CreateEnum
CREATE TYPE "DepositAmountType" AS ENUM ('FIXED', 'REMAINING');

-- AlterTable
ALTER TABLE "applicant_demographics" ADD COLUMN     "employee_number" TEXT,
ADD COLUMN     "flsa_status" "FLSAStatus",
ADD COLUMN     "local_tax_info" JSONB;

-- CreateTable
CREATE TABLE "bank_accounts" (
    "bank_account_id" TEXT NOT NULL,
    "applicant_id" TEXT NOT NULL,
    "bank_name" TEXT NOT NULL,
    "account_type" "BankAccountType" NOT NULL DEFAULT 'CHECKING',
    "routing_number" TEXT NOT NULL,
    "account_number" TEXT NOT NULL,
    "amount" DECIMAL(10,2),
    "amount_type" "DepositAmountType" NOT NULL DEFAULT 'REMAINING',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("bank_account_id")
);

-- CreateTable
CREATE TABLE "benefit_deductions" (
    "benefit_deduction_id" TEXT NOT NULL,
    "applicant_id" TEXT NOT NULL,
    "deduction_type" TEXT NOT NULL,
    "amount" DECIMAL(10,2),
    "percentage" DECIMAL(5,2),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "effective_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "benefit_deductions_pkey" PRIMARY KEY ("benefit_deduction_id")
);

-- CreateTable
CREATE TABLE "garnishments" (
    "garnishment_id" TEXT NOT NULL,
    "applicant_id" TEXT NOT NULL,
    "garnishment_type" TEXT NOT NULL,
    "case_number" TEXT,
    "priority_order" INTEGER NOT NULL DEFAULT 1,
    "amount" DECIMAL(10,2),
    "percentage" DECIMAL(5,2),
    "max_amount" DECIMAL(10,2),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "garnishments_pkey" PRIMARY KEY ("garnishment_id")
);

-- CreateIndex
CREATE INDEX "bank_accounts_applicant_id_idx" ON "bank_accounts"("applicant_id");

-- CreateIndex
CREATE INDEX "benefit_deductions_applicant_id_idx" ON "benefit_deductions"("applicant_id");

-- CreateIndex
CREATE INDEX "garnishments_applicant_id_idx" ON "garnishments"("applicant_id");

-- CreateIndex
CREATE UNIQUE INDEX "applicant_demographics_employee_number_key" ON "applicant_demographics"("employee_number");

-- AddForeignKey
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_applicant_id_fkey" FOREIGN KEY ("applicant_id") REFERENCES "applicants"("applicant_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "benefit_deductions" ADD CONSTRAINT "benefit_deductions_applicant_id_fkey" FOREIGN KEY ("applicant_id") REFERENCES "applicants"("applicant_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garnishments" ADD CONSTRAINT "garnishments_applicant_id_fkey" FOREIGN KEY ("applicant_id") REFERENCES "applicants"("applicant_id") ON DELETE CASCADE ON UPDATE CASCADE;
