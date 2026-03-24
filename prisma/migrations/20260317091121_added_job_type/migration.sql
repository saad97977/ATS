-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "JobType" ADD VALUE 'CONSULTANT';
ALTER TYPE "JobType" ADD VALUE 'CONTRACT';
ALTER TYPE "JobType" ADD VALUE 'HOURLY_FULL_TIME';
ALTER TYPE "JobType" ADD VALUE 'INTERN';
ALTER TYPE "JobType" ADD VALUE 'PART_TIME';
ALTER TYPE "JobType" ADD VALUE 'REGULAR_FULL_TIME';
ALTER TYPE "JobType" ADD VALUE 'SALARY';
ALTER TYPE "JobType" ADD VALUE 'TEMP_TO_HIRE';
ALTER TYPE "JobType" ADD VALUE 'TEMP_TO_PERM';
ALTER TYPE "JobType" ADD VALUE 'EOR';
ALTER TYPE "JobType" ADD VALUE 'DIRECT_HIRE';
