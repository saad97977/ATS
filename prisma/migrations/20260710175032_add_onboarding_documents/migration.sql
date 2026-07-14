-- CreateEnum
CREATE TYPE "DocumentRecipientType" AS ENUM ('ALL', 'MANAGER', 'DRIVERS', 'NON_DRIVERS');

-- CreateEnum
CREATE TYPE "OnboardingDocumentCategory" AS ENUM ('HANDBOOK', 'POLICY', 'AGREEMENT', 'TAX_FORM', 'PROFILE_TASK', 'OTHER');

-- AlterTable
ALTER TABLE "applicant_documents" ADD COLUMN     "template_id" TEXT;

-- CreateTable
CREATE TABLE "onboarding_document_templates" (
    "template_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "OnboardingDocumentCategory" NOT NULL DEFAULT 'OTHER',
    "company_code" TEXT,
    "recipient_type" "DocumentRecipientType" NOT NULL DEFAULT 'ALL',
    "requires_signature" BOOLEAN NOT NULL DEFAULT false,
    "work_state" TEXT,
    "locality" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "master_file_url" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "onboarding_document_templates_pkey" PRIMARY KEY ("template_id")
);

-- CreateTable
CREATE TABLE "organization_onboarding_documents" (
    "org_onboarding_doc_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "is_required" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_onboarding_documents_pkey" PRIMARY KEY ("org_onboarding_doc_id")
);

-- CreateIndex
CREATE INDEX "onboarding_document_templates_work_state_idx" ON "onboarding_document_templates"("work_state");

-- CreateIndex
CREATE INDEX "onboarding_document_templates_category_idx" ON "onboarding_document_templates"("category");

-- CreateIndex
CREATE INDEX "onboarding_document_templates_company_code_idx" ON "onboarding_document_templates"("company_code");

-- CreateIndex
CREATE INDEX "organization_onboarding_documents_organization_id_idx" ON "organization_onboarding_documents"("organization_id");

-- CreateIndex
CREATE INDEX "organization_onboarding_documents_template_id_idx" ON "organization_onboarding_documents"("template_id");

-- CreateIndex
CREATE UNIQUE INDEX "organization_onboarding_documents_organization_id_template__key" ON "organization_onboarding_documents"("organization_id", "template_id");

-- CreateIndex
CREATE INDEX "applicant_documents_template_id_idx" ON "applicant_documents"("template_id");

-- AddForeignKey
ALTER TABLE "organization_onboarding_documents" ADD CONSTRAINT "organization_onboarding_documents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_onboarding_documents" ADD CONSTRAINT "organization_onboarding_documents_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "onboarding_document_templates"("template_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applicant_documents" ADD CONSTRAINT "applicant_documents_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "onboarding_document_templates"("template_id") ON DELETE SET NULL ON UPDATE CASCADE;
