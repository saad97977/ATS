-- AlterTable
ALTER TABLE "DocumentSignature" ADD COLUMN     "rejected_at" TIMESTAMP(3),
ADD COLUMN     "rejected_by" TEXT,
ADD COLUMN     "rejection_reason" TEXT;
