-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "interview_Round1" BOOLEAN DEFAULT true,
ADD COLUMN     "interview_Round2" BOOLEAN DEFAULT false,
ADD COLUMN     "resume_required" BOOLEAN DEFAULT false;
