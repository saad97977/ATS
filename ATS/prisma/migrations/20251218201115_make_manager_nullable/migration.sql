-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "RoleName" AS ENUM ('HCM_USER', 'MANAGER', 'CONTRACTOR', 'SUB_VENDOR');

-- CreateEnum
CREATE TYPE "OrganizationStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "AddressType" AS ENUM ('WORKSITE', 'BILLING');

-- CreateEnum
CREATE TYPE "ContactType" AS ENUM ('PRIMARY', 'EMERGENCY');

-- CreateEnum
CREATE TYPE "Privacy" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('DRAFT', 'OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('TEMPORARY', 'PERMANENT');

-- CreateEnum
CREATE TYPE "OwnerRole" AS ENUM ('SALES', 'RECRUITER');

-- CreateEnum
CREATE TYPE "ApplicantStatus" AS ENUM ('APPLIED', 'PLACED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('APPLIED', 'SCREENED', 'OFFERED', 'HIRED');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('W2', '1099');

-- CreateEnum
CREATE TYPE "TimeEntryStatus" AS ENUM ('SUBMITTED', 'APPROVED');

-- CreateTable
CREATE TABLE "users" (
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "roles" (
    "role_id" TEXT NOT NULL,
    "role_name" "RoleName" NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("role_id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "user_role_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_role_id")
);

-- CreateTable
CREATE TABLE "user_activities" (
    "activity_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "last_login_at" TIMESTAMP(3),
    "last_action_1" TEXT,
    "last_action_2" TEXT,
    "last_action_3" TEXT,

    CONSTRAINT "user_activities_pkey" PRIMARY KEY ("activity_id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "task_id" TEXT NOT NULL,
    "assigned_to_user_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "due_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("task_id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "website" TEXT,
    "status" "OrganizationStatus" NOT NULL DEFAULT 'ACTIVE',
    "phone" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("organization_id")
);

-- CreateTable
CREATE TABLE "organization_addresses" (
    "organization_address_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "address_type" "AddressType" NOT NULL,
    "address1" TEXT NOT NULL,
    "address2" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "zip" TEXT NOT NULL,
    "phone" TEXT,

    CONSTRAINT "organization_addresses_pkey" PRIMARY KEY ("organization_address_id")
);

-- CreateTable
CREATE TABLE "organization_contacts" (
    "organization_contact_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "contact_type" "ContactType" NOT NULL,

    CONSTRAINT "organization_contacts_pkey" PRIMARY KEY ("organization_contact_id")
);

-- CreateTable
CREATE TABLE "organization_licenses" (
    "organization_license_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "license_name" TEXT NOT NULL,
    "license_document" TEXT NOT NULL,
    "expiration_date" TIMESTAMP(3),

    CONSTRAINT "organization_licenses_pkey" PRIMARY KEY ("organization_license_id")
);

-- CreateTable
CREATE TABLE "organization_accounting" (
    "organization_accounting_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "account_type" TEXT NOT NULL,
    "bank_name" TEXT NOT NULL,
    "account_number" TEXT NOT NULL,
    "routing_number" TEXT NOT NULL,
    "country" TEXT NOT NULL,

    CONSTRAINT "organization_accounting_pkey" PRIMARY KEY ("organization_accounting_id")
);

-- CreateTable
CREATE TABLE "organization_users" (
    "organization_user_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "division" TEXT,
    "department" TEXT,
    "title" TEXT,
    "work_phone" TEXT,

    CONSTRAINT "organization_users_pkey" PRIMARY KEY ("organization_user_id")
);

-- CreateTable
CREATE TABLE "contracts" (
    "contract_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "contract_name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "is_organization_contractor" BOOLEAN NOT NULL,
    "sent_status" TEXT,
    "signed_status" TEXT,
    "signed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("contract_id")
);

-- CreateTable
CREATE TABLE "organization_document_titles" (
    "document_title_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "document_title" TEXT NOT NULL,

    CONSTRAINT "organization_document_titles_pkey" PRIMARY KEY ("document_title_id")
);

-- CreateTable
CREATE TABLE "organization_documents" (
    "document_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "document_type" TEXT NOT NULL,
    "document_name" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "file" TEXT NOT NULL,
    "privacy" "Privacy" NOT NULL,
    "expiration_date" TIMESTAMP(3),
    "upload_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_documents_pkey" PRIMARY KEY ("document_id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "job_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "manager_id" TEXT,
    "job_title" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'DRAFT',
    "job_type" "JobType" NOT NULL,
    "days_active" INTEGER,
    "days_inactive" INTEGER,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("job_id")
);

-- CreateTable
CREATE TABLE "job_details" (
    "job_detail_id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "skills" JSONB,

    CONSTRAINT "job_details_pkey" PRIMARY KEY ("job_detail_id")
);

-- CreateTable
CREATE TABLE "company_offices" (
    "company_office_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "office_name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "company_offices_pkey" PRIMARY KEY ("company_office_id")
);

-- CreateTable
CREATE TABLE "job_owners" (
    "job_owner_id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role_type" "OwnerRole" NOT NULL,

    CONSTRAINT "job_owners_pkey" PRIMARY KEY ("job_owner_id")
);

-- CreateTable
CREATE TABLE "job_notes" (
    "job_note_id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_notes_pkey" PRIMARY KEY ("job_note_id")
);

-- CreateTable
CREATE TABLE "job_postings" (
    "job_posting_id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "external_posting_id" TEXT,
    "status" TEXT NOT NULL,

    CONSTRAINT "job_postings_pkey" PRIMARY KEY ("job_posting_id")
);

-- CreateTable
CREATE TABLE "job_rates" (
    "job_rate_id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "pay_rate" DECIMAL(10,2) NOT NULL,
    "bill_rate" DECIMAL(10,2) NOT NULL,
    "markup_percentage" DECIMAL(5,2) NOT NULL,
    "overtime_rule" TEXT,
    "ot_pay_rate" DECIMAL(10,2),
    "ot_bill_rate" DECIMAL(10,2),

    CONSTRAINT "job_rates_pkey" PRIMARY KEY ("job_rate_id")
);

-- CreateTable
CREATE TABLE "applicants" (
    "applicant_id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "status" "ApplicantStatus" NOT NULL DEFAULT 'APPLIED',
    "last_active_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "applicants_pkey" PRIMARY KEY ("applicant_id")
);

-- CreateTable
CREATE TABLE "applicant_contacts" (
    "applicant_contact_id" TEXT NOT NULL,
    "applicant_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,

    CONSTRAINT "applicant_contacts_pkey" PRIMARY KEY ("applicant_contact_id")
);

-- CreateTable
CREATE TABLE "applicant_demographics" (
    "applicant_demo_id" TEXT NOT NULL,
    "applicant_id" TEXT NOT NULL,
    "birth_date" TIMESTAMP(3),
    "gender" TEXT,
    "race" TEXT,
    "disability" TEXT,
    "work_authorization" TEXT,
    "authorization_expiry" TIMESTAMP(3),

    CONSTRAINT "applicant_demographics_pkey" PRIMARY KEY ("applicant_demo_id")
);

-- CreateTable
CREATE TABLE "applicant_documents" (
    "applicant_document_id" TEXT NOT NULL,
    "applicant_id" TEXT NOT NULL,
    "document_type" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,

    CONSTRAINT "applicant_documents_pkey" PRIMARY KEY ("applicant_document_id")
);

-- CreateTable
CREATE TABLE "applicant_social_profiles" (
    "applicant_social_profiles_id" TEXT NOT NULL,
    "applicant_id" TEXT NOT NULL,
    "profile_title" TEXT NOT NULL,
    "profile_link" TEXT NOT NULL,

    CONSTRAINT "applicant_social_profiles_pkey" PRIMARY KEY ("applicant_social_profiles_id")
);

-- CreateTable
CREATE TABLE "applicant_references" (
    "applicant_references_id" TEXT NOT NULL,
    "applicant_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "applicant_references_pkey" PRIMARY KEY ("applicant_references_id")
);

-- CreateTable
CREATE TABLE "applicant_work_history" (
    "applicant_work_history_id" TEXT NOT NULL,
    "applicant_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "applicant_work_history_pkey" PRIMARY KEY ("applicant_work_history_id")
);

-- CreateTable
CREATE TABLE "applications" (
    "application_id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "applicant_id" TEXT NOT NULL,
    "source" TEXT,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'APPLIED',
    "applied_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("application_id")
);

-- CreateTable
CREATE TABLE "interviews" (
    "interview_id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "interview_date" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "interviews_pkey" PRIMARY KEY ("interview_id")
);

-- CreateTable
CREATE TABLE "pipeline_stages" (
    "pipeline_stage_id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "stage_name" TEXT NOT NULL,
    "pipeline_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "credit_organization_user_id" TEXT,
    "representative_organization_user_id" TEXT,

    CONSTRAINT "pipeline_stages_pkey" PRIMARY KEY ("pipeline_stage_id")
);

-- CreateTable
CREATE TABLE "assignments" (
    "assignment_id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "employment_type" "EmploymentType" NOT NULL,
    "workers_comp_code" TEXT,

    CONSTRAINT "assignments_pkey" PRIMARY KEY ("assignment_id")
);

-- CreateTable
CREATE TABLE "time_entries" (
    "time_entry_id" TEXT NOT NULL,
    "assignment_id" TEXT NOT NULL,
    "work_date" TIMESTAMP(3) NOT NULL,
    "hours" DECIMAL(5,2) NOT NULL,
    "status" "TimeEntryStatus" NOT NULL DEFAULT 'SUBMITTED',

    CONSTRAINT "time_entries_pkey" PRIMARY KEY ("time_entry_id")
);

-- CreateTable
CREATE TABLE "payrolls" (
    "payroll_id" TEXT NOT NULL,
    "assignment_id" TEXT NOT NULL,
    "pay_period" TEXT NOT NULL,
    "gross_pay" DECIMAL(10,2) NOT NULL,
    "net_pay" DECIMAL(10,2) NOT NULL,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payrolls_pkey" PRIMARY KEY ("payroll_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_user_id_key" ON "user_roles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_activities_user_id_key" ON "user_activities"("user_id");

-- CreateIndex
CREATE INDEX "tasks_assigned_to_user_id_idx" ON "tasks"("assigned_to_user_id");

-- CreateIndex
CREATE INDEX "organization_addresses_organization_id_idx" ON "organization_addresses"("organization_id");

-- CreateIndex
CREATE INDEX "organization_contacts_organization_id_idx" ON "organization_contacts"("organization_id");

-- CreateIndex
CREATE INDEX "organization_licenses_organization_id_idx" ON "organization_licenses"("organization_id");

-- CreateIndex
CREATE INDEX "organization_accounting_organization_id_idx" ON "organization_accounting"("organization_id");

-- CreateIndex
CREATE INDEX "organization_users_organization_id_idx" ON "organization_users"("organization_id");

-- CreateIndex
CREATE INDEX "organization_users_user_id_idx" ON "organization_users"("user_id");

-- CreateIndex
CREATE INDEX "contracts_organization_id_idx" ON "contracts"("organization_id");

-- CreateIndex
CREATE INDEX "contracts_user_id_idx" ON "contracts"("user_id");

-- CreateIndex
CREATE INDEX "organization_document_titles_organization_id_idx" ON "organization_document_titles"("organization_id");

-- CreateIndex
CREATE INDEX "organization_documents_organization_id_idx" ON "organization_documents"("organization_id");

-- CreateIndex
CREATE INDEX "organization_documents_user_id_idx" ON "organization_documents"("user_id");

-- CreateIndex
CREATE INDEX "jobs_organization_id_idx" ON "jobs"("organization_id");

-- CreateIndex
CREATE INDEX "jobs_manager_id_idx" ON "jobs"("manager_id");

-- CreateIndex
CREATE INDEX "jobs_status_idx" ON "jobs"("status");

-- CreateIndex
CREATE UNIQUE INDEX "job_details_job_id_key" ON "job_details"("job_id");

-- CreateIndex
CREATE INDEX "company_offices_organization_id_idx" ON "company_offices"("organization_id");

-- CreateIndex
CREATE INDEX "job_owners_job_id_idx" ON "job_owners"("job_id");

-- CreateIndex
CREATE INDEX "job_owners_user_id_idx" ON "job_owners"("user_id");

-- CreateIndex
CREATE INDEX "job_notes_job_id_idx" ON "job_notes"("job_id");

-- CreateIndex
CREATE INDEX "job_postings_job_id_idx" ON "job_postings"("job_id");

-- CreateIndex
CREATE INDEX "job_rates_job_id_idx" ON "job_rates"("job_id");

-- CreateIndex
CREATE UNIQUE INDEX "applicant_contacts_applicant_id_key" ON "applicant_contacts"("applicant_id");

-- CreateIndex
CREATE UNIQUE INDEX "applicant_demographics_applicant_id_key" ON "applicant_demographics"("applicant_id");

-- CreateIndex
CREATE INDEX "applicant_documents_applicant_id_idx" ON "applicant_documents"("applicant_id");

-- CreateIndex
CREATE INDEX "applicant_social_profiles_applicant_id_idx" ON "applicant_social_profiles"("applicant_id");

-- CreateIndex
CREATE INDEX "applicant_references_applicant_id_idx" ON "applicant_references"("applicant_id");

-- CreateIndex
CREATE INDEX "applicant_references_user_id_idx" ON "applicant_references"("user_id");

-- CreateIndex
CREATE INDEX "applicant_work_history_applicant_id_idx" ON "applicant_work_history"("applicant_id");

-- CreateIndex
CREATE INDEX "applications_job_id_idx" ON "applications"("job_id");

-- CreateIndex
CREATE INDEX "applications_applicant_id_idx" ON "applications"("applicant_id");

-- CreateIndex
CREATE INDEX "applications_status_idx" ON "applications"("status");

-- CreateIndex
CREATE INDEX "interviews_application_id_idx" ON "interviews"("application_id");

-- CreateIndex
CREATE INDEX "pipeline_stages_application_id_idx" ON "pipeline_stages"("application_id");

-- CreateIndex
CREATE INDEX "pipeline_stages_credit_organization_user_id_idx" ON "pipeline_stages"("credit_organization_user_id");

-- CreateIndex
CREATE INDEX "pipeline_stages_representative_organization_user_id_idx" ON "pipeline_stages"("representative_organization_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "assignments_application_id_key" ON "assignments"("application_id");

-- CreateIndex
CREATE INDEX "time_entries_assignment_id_idx" ON "time_entries"("assignment_id");

-- CreateIndex
CREATE INDEX "time_entries_work_date_idx" ON "time_entries"("work_date");

-- CreateIndex
CREATE INDEX "payrolls_assignment_id_idx" ON "payrolls"("assignment_id");

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("role_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_activities" ADD CONSTRAINT "user_activities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigned_to_user_id_fkey" FOREIGN KEY ("assigned_to_user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_addresses" ADD CONSTRAINT "organization_addresses_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_contacts" ADD CONSTRAINT "organization_contacts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_licenses" ADD CONSTRAINT "organization_licenses_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_accounting" ADD CONSTRAINT "organization_accounting_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_users" ADD CONSTRAINT "organization_users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_users" ADD CONSTRAINT "organization_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_document_titles" ADD CONSTRAINT "organization_document_titles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_documents" ADD CONSTRAINT "organization_documents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_documents" ADD CONSTRAINT "organization_documents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_details" ADD CONSTRAINT "job_details_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("job_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_offices" ADD CONSTRAINT "company_offices_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_owners" ADD CONSTRAINT "job_owners_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("job_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_owners" ADD CONSTRAINT "job_owners_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_notes" ADD CONSTRAINT "job_notes_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("job_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_postings" ADD CONSTRAINT "job_postings_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("job_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_rates" ADD CONSTRAINT "job_rates_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("job_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applicant_contacts" ADD CONSTRAINT "applicant_contacts_applicant_id_fkey" FOREIGN KEY ("applicant_id") REFERENCES "applicants"("applicant_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applicant_demographics" ADD CONSTRAINT "applicant_demographics_applicant_id_fkey" FOREIGN KEY ("applicant_id") REFERENCES "applicants"("applicant_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applicant_documents" ADD CONSTRAINT "applicant_documents_applicant_id_fkey" FOREIGN KEY ("applicant_id") REFERENCES "applicants"("applicant_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applicant_social_profiles" ADD CONSTRAINT "applicant_social_profiles_applicant_id_fkey" FOREIGN KEY ("applicant_id") REFERENCES "applicants"("applicant_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applicant_references" ADD CONSTRAINT "applicant_references_applicant_id_fkey" FOREIGN KEY ("applicant_id") REFERENCES "applicants"("applicant_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applicant_references" ADD CONSTRAINT "applicant_references_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applicant_work_history" ADD CONSTRAINT "applicant_work_history_applicant_id_fkey" FOREIGN KEY ("applicant_id") REFERENCES "applicants"("applicant_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("job_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_applicant_id_fkey" FOREIGN KEY ("applicant_id") REFERENCES "applicants"("applicant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("application_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_stages" ADD CONSTRAINT "pipeline_stages_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("application_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_stages" ADD CONSTRAINT "pipeline_stages_credit_organization_user_id_fkey" FOREIGN KEY ("credit_organization_user_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_stages" ADD CONSTRAINT "pipeline_stages_representative_organization_user_id_fkey" FOREIGN KEY ("representative_organization_user_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("application_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("assignment_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payrolls" ADD CONSTRAINT "payrolls_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("assignment_id") ON DELETE CASCADE ON UPDATE CASCADE;
