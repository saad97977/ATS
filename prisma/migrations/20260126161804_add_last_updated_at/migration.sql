/*
  Warnings:

  - The values [SHORTLISTED] on the enum `ApplicantStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "ApplicantStatus_new" AS ENUM ('APPLIED', 'PLACED', 'REJECTED', 'SHORTLISTEDF', 'INTERVIEWING');
ALTER TABLE "applicants" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "applicants" ALTER COLUMN "status" TYPE "ApplicantStatus_new" USING ("status"::text::"ApplicantStatus_new");
ALTER TYPE "ApplicantStatus" RENAME TO "ApplicantStatus_old";
ALTER TYPE "ApplicantStatus_new" RENAME TO "ApplicantStatus";
DROP TYPE "ApplicantStatus_old";
ALTER TABLE "applicants" ALTER COLUMN "status" SET DEFAULT 'APPLIED';
COMMIT;

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "last_updated_at" TIMESTAMP(3);
