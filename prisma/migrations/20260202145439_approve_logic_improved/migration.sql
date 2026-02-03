/*
  Warnings:

  - The values [SHORTLISTEDF] on the enum `ApplicantStatus` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `approval_status` on the `jobs` table. All the data in the column will be lost.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "ApplicantStatus_new" AS ENUM ('APPLIED', 'PLACED', 'REJECTED', 'SHORTLISTED', 'INTERVIEWING');
ALTER TABLE "applicants" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "applicants" ALTER COLUMN "status" TYPE "ApplicantStatus_new" USING ("status"::text::"ApplicantStatus_new");
ALTER TYPE "ApplicantStatus" RENAME TO "ApplicantStatus_old";
ALTER TYPE "ApplicantStatus_new" RENAME TO "ApplicantStatus";
DROP TYPE "ApplicantStatus_old";
ALTER TABLE "applicants" ALTER COLUMN "status" SET DEFAULT 'APPLIED';
COMMIT;

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "JobStatus" ADD VALUE 'PENDING';
ALTER TYPE "JobStatus" ADD VALUE 'DECLINED';

-- AlterTable
ALTER TABLE "jobs" DROP COLUMN "approval_status";

-- DropEnum
DROP TYPE "ApprovalStatus";
