/*
  Warnings:

  - A unique constraint covering the columns `[custom_company_id]` on the table `organizations` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "OrgBranchDivision" AS ENUM ('SMS_HOSPITALITY', 'SMS_MCL_JASCO_GOC', 'SMS_ADMIN', 'SMS_STAFFING_SOLUTIONS', 'SPECIAL_MULTI_ADMIN', 'SPECIAL_MULTI_INC');

-- CreateEnum
CREATE TYPE "OrgActivityType" AS ENUM ('CALL_COMPLETED', 'CALL_SCHEDULED');

-- CreateEnum
CREATE TYPE "ContactPreviewType" AS ENUM ('CALL_COMPLETED', 'CALL_SCHEDULED', 'CALL_RESCHEDULED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "OrganizationStatus" ADD VALUE 'CREDIT_HOLD';
ALTER TYPE "OrganizationStatus" ADD VALUE 'DELETE';
ALTER TYPE "OrganizationStatus" ADD VALUE 'DO_NOT_SERVICE';
ALTER TYPE "OrganizationStatus" ADD VALUE 'FORMER_CLIENT';
ALTER TYPE "OrganizationStatus" ADD VALUE 'ON_HOLD';
ALTER TYPE "OrganizationStatus" ADD VALUE 'PROSPECT';

-- AlterTable
ALTER TABLE "organization_contacts" ADD COLUMN     "address" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "contact_title" TEXT,
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "department" TEXT,
ADD COLUMN     "division" TEXT,
ADD COLUMN     "fax" TEXT,
ADD COLUMN     "first_name" TEXT,
ADD COLUMN     "last_contacted_at" TIMESTAMP(3),
ADD COLUMN     "last_name" TEXT,
ADD COLUMN     "last_updated_at" TIMESTAMP(3),
ADD COLUMN     "mobile_phone" TEXT,
ADD COLUMN     "representative_id" TEXT,
ADD COLUMN     "state" TEXT,
ADD COLUMN     "title" TEXT,
ADD COLUMN     "zip" TEXT;

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "branch_name" TEXT,
ADD COLUMN     "branch_region" TEXT,
ADD COLUMN     "contract_markup" DECIMAL(5,2),
ADD COLUMN     "custom_company_id" TEXT,
ADD COLUMN     "default_ot_rule" TEXT,
ADD COLUMN     "employee_count" INTEGER,
ADD COLUMN     "fax" TEXT,
ADD COLUMN     "industry" TEXT,
ADD COLUMN     "last_contacted_at" TIMESTAMP(3),
ADD COLUMN     "org_branch_division" "OrgBranchDivision",
ADD COLUMN     "overview" TEXT,
ADD COLUMN     "permanent_markup" DECIMAL(5,2),
ADD COLUMN     "representative_id" TEXT,
ADD COLUMN     "revenue" TEXT,
ADD COLUMN     "zip" TEXT;

-- CreateTable
CREATE TABLE "contact_previews" (
    "preview_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "ContactPreviewType" NOT NULL,
    "notes" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "job_id" TEXT,

    CONSTRAINT "contact_previews_pkey" PRIMARY KEY ("preview_id")
);

-- CreateTable
CREATE TABLE "organization_activities" (
    "activity_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "logged_by_user_id" TEXT NOT NULL,
    "activity_type" "OrgActivityType" NOT NULL,
    "details" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_activities_pkey" PRIMARY KEY ("activity_id")
);

-- CreateTable
CREATE TABLE "contact_jobs" (
    "contact_job_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,

    CONSTRAINT "contact_jobs_pkey" PRIMARY KEY ("contact_job_id")
);

-- CreateIndex
CREATE INDEX "contact_previews_contact_id_idx" ON "contact_previews"("contact_id");

-- CreateIndex
CREATE INDEX "contact_previews_job_id_idx" ON "contact_previews"("job_id");

-- CreateIndex
CREATE INDEX "organization_activities_organization_id_idx" ON "organization_activities"("organization_id");

-- CreateIndex
CREATE INDEX "organization_activities_logged_by_user_id_idx" ON "organization_activities"("logged_by_user_id");

-- CreateIndex
CREATE INDEX "contact_jobs_contact_id_idx" ON "contact_jobs"("contact_id");

-- CreateIndex
CREATE INDEX "contact_jobs_job_id_idx" ON "contact_jobs"("job_id");

-- CreateIndex
CREATE UNIQUE INDEX "contact_jobs_contact_id_job_id_key" ON "contact_jobs"("contact_id", "job_id");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_custom_company_id_key" ON "organizations"("custom_company_id");

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_representative_id_fkey" FOREIGN KEY ("representative_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_contacts" ADD CONSTRAINT "organization_contacts_representative_id_fkey" FOREIGN KEY ("representative_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_previews" ADD CONSTRAINT "contact_previews_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "organization_contacts"("organization_contact_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_previews" ADD CONSTRAINT "contact_previews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_previews" ADD CONSTRAINT "contact_previews_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("job_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_activities" ADD CONSTRAINT "organization_activities_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_activities" ADD CONSTRAINT "organization_activities_logged_by_user_id_fkey" FOREIGN KEY ("logged_by_user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_jobs" ADD CONSTRAINT "contact_jobs_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "organization_contacts"("organization_contact_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_jobs" ADD CONSTRAINT "contact_jobs_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("job_id") ON DELETE CASCADE ON UPDATE CASCADE;
