/*
  Warnings:

  - You are about to drop the `organization_accounting` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "organization_accounting" DROP CONSTRAINT "organization_accounting_organization_id_fkey";

-- DropTable
DROP TABLE "organization_accounting";
