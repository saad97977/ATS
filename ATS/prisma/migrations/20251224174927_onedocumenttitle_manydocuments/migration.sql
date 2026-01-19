/*
  Warnings:

  - Added the required column `document_title_id` to the `organization_documents` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "organization_documents" ADD COLUMN     "document_title_id" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "organization_documents_document_title_id_idx" ON "organization_documents"("document_title_id");

-- AddForeignKey
ALTER TABLE "organization_documents" ADD CONSTRAINT "organization_documents_document_title_id_fkey" FOREIGN KEY ("document_title_id") REFERENCES "organization_document_titles"("document_title_id") ON DELETE CASCADE ON UPDATE CASCADE;
