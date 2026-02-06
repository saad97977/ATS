/*
  Warnings:

  - A unique constraint covering the columns `[applicant_id,profile_title]` on the table `applicant_social_profiles` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "applicant_documents" ADD COLUMN     "application_id" TEXT,
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "applicant_work_history" ADD COLUMN     "application_id" TEXT,
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "applicant_documents_application_id_idx" ON "applicant_documents"("application_id");

-- CreateIndex
CREATE INDEX "applicant_documents_applicant_id_document_type_idx" ON "applicant_documents"("applicant_id", "document_type");

-- CreateIndex
CREATE UNIQUE INDEX "applicant_social_profiles_applicant_id_profile_title_key" ON "applicant_social_profiles"("applicant_id", "profile_title");

-- CreateIndex
CREATE INDEX "applicant_work_history_application_id_idx" ON "applicant_work_history"("application_id");

-- AddForeignKey
ALTER TABLE "applicant_documents" ADD CONSTRAINT "applicant_documents_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("application_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applicant_work_history" ADD CONSTRAINT "applicant_work_history_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("application_id") ON DELETE SET NULL ON UPDATE CASCADE;
