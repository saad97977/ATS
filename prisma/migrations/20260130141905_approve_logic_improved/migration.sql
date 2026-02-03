-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED');

-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "approval_status" "ApprovalStatus" DEFAULT 'PENDING';
