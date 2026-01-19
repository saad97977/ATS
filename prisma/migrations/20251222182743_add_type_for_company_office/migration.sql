/*
  Warnings:

  - Added the required column `Address` to the `company_offices` table without a default value. This is not possible if the table is not empty.
  - Added the required column `type` to the `company_offices` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "OfficeType" AS ENUM ('REMOTE', 'HYBRID', 'ONSITE');

-- AlterTable
ALTER TABLE "company_offices" ADD COLUMN     "Address" TEXT NOT NULL,
ADD COLUMN     "type" "OfficeType" NOT NULL;
