/*
  Warnings:

  - The `office_division` column on the `applicants` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `division` column on the `user_profiles` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "applicants" DROP COLUMN "office_division",
ADD COLUMN     "office_division" "OrgBranchDivision";

-- AlterTable
ALTER TABLE "user_profiles" DROP COLUMN "division",
ADD COLUMN     "division" "OrgBranchDivision";
