-- CreateEnum
CREATE TYPE "InterviewType" AS ENUM ('ONLINE', 'OFFLINE');

-- AlterTable
ALTER TABLE "interviews" ADD COLUMN     "interview_type" "InterviewType" NOT NULL DEFAULT 'ONLINE';

-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "interview_rounds" INTEGER DEFAULT 1;
