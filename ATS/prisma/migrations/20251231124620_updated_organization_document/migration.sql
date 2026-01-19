/*
  Warnings:

  - A unique constraint covering the columns `[document_title]` on the table `organization_document_titles` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[document_name]` on the table `organization_documents` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "organization_document_titles_document_title_key" ON "organization_document_titles"("document_title");

-- CreateIndex
CREATE UNIQUE INDEX "organization_documents_document_name_key" ON "organization_documents"("document_name");
