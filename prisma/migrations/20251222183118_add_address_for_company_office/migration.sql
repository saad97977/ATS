/*
  Warnings:

  - You are about to drop the column `Address` on the `company_offices` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "company_offices" DROP COLUMN "Address",
ADD COLUMN     "address" TEXT;
