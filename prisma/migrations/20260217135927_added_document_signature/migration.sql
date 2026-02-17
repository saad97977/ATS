-- CreateTable
CREATE TABLE "DocumentSignature" (
    "signature_id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "signer_name" TEXT NOT NULL,
    "signer_email" TEXT NOT NULL,
    "signature_image_url" TEXT NOT NULL,
    "signature_type" TEXT NOT NULL,
    "signed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "verification_hash" TEXT NOT NULL,
    "position" TEXT,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',

    CONSTRAINT "DocumentSignature_pkey" PRIMARY KEY ("signature_id")
);

-- CreateTable
CREATE TABLE "SignatureRequest" (
    "request_id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "recipient_email" TEXT NOT NULL,
    "recipient_name" TEXT NOT NULL,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "request_token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "SignatureRequest_pkey" PRIMARY KEY ("request_id")
);

-- CreateIndex
CREATE INDEX "DocumentSignature_document_id_idx" ON "DocumentSignature"("document_id");

-- CreateIndex
CREATE INDEX "DocumentSignature_user_id_idx" ON "DocumentSignature"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "SignatureRequest_request_token_key" ON "SignatureRequest"("request_token");

-- CreateIndex
CREATE INDEX "SignatureRequest_document_id_idx" ON "SignatureRequest"("document_id");

-- CreateIndex
CREATE INDEX "SignatureRequest_request_token_idx" ON "SignatureRequest"("request_token");

-- AddForeignKey
ALTER TABLE "DocumentSignature" ADD CONSTRAINT "DocumentSignature_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "organization_documents"("document_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentSignature" ADD CONSTRAINT "DocumentSignature_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignatureRequest" ADD CONSTRAINT "SignatureRequest_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "organization_documents"("document_id") ON DELETE CASCADE ON UPDATE CASCADE;
