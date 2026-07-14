-- AlterEnum
ALTER TYPE "TransactionEarningType" ADD VALUE 'OTHER';

-- AlterTable
ALTER TABLE "payroll_transaction_lines" ADD COLUMN     "custom_earning_label" TEXT;

-- CreateTable
CREATE TABLE "custom_earning_types" (
    "custom_earning_type_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custom_earning_types_pkey" PRIMARY KEY ("custom_earning_type_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "custom_earning_types_label_key" ON "custom_earning_types"("label");
