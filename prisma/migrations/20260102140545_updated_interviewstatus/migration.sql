/*
  Warnings:

  - Made the column `address` on table `company_offices` required. This step will fail if there are existing NULL values in that column.
  - Changed the type of `status` on the `interviews` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "InterviewStatus" AS ENUM ('PENDING', 'COMPLETED_RESULT_PENDING', 'REJECTED', 'ACCEPTED');

-- AlterTable
ALTER TABLE "company_offices" ALTER COLUMN "address" SET NOT NULL;

-- AlterTable
ALTER TABLE "interviews" DROP COLUMN "status",
ADD COLUMN     "status" "InterviewStatus" NOT NULL;
