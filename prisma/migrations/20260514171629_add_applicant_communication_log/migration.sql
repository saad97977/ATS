-- CreateEnum
CREATE TYPE "CommType" AS ENUM ('EMAIL', 'SMS', 'CALL', 'NOTE');

-- CreateEnum
CREATE TYPE "CommDirection" AS ENUM ('OUTBOUND', 'INBOUND');

-- CreateEnum
CREATE TYPE "CommTrigger" AS ENUM ('MANUAL', 'AUTOMATIC');

-- CreateEnum
CREATE TYPE "CommStatus" AS ENUM ('SENT', 'FAILED', 'LOGGED', 'DRAFT');

-- CreateEnum
CREATE TYPE "CallOutcome" AS ENUM ('ANSWERED', 'NO_ANSWER', 'VOICEMAIL', 'BUSY');

-- CreateTable
CREATE TABLE "applicant_communications" (
    "communication_id" TEXT NOT NULL,
    "applicant_id" TEXT NOT NULL,
    "communication_type" "CommType" NOT NULL,
    "direction" "CommDirection",
    "trigger" "CommTrigger" NOT NULL,
    "subject" TEXT,
    "body" TEXT,
    "from_address" TEXT,
    "to_address" TEXT,
    "email_message_id" TEXT,
    "call_duration_minutes" INTEGER,
    "call_outcome" "CallOutcome",
    "status" "CommStatus" NOT NULL DEFAULT 'LOGGED',
    "notes" TEXT,
    "sent_by_user_id" TEXT,
    "application_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "applicant_communications_pkey" PRIMARY KEY ("communication_id")
);

-- CreateIndex
CREATE INDEX "applicant_communications_applicant_id_idx" ON "applicant_communications"("applicant_id");

-- CreateIndex
CREATE INDEX "applicant_communications_applicant_id_communication_type_idx" ON "applicant_communications"("applicant_id", "communication_type");

-- CreateIndex
CREATE INDEX "applicant_communications_applicant_id_created_at_idx" ON "applicant_communications"("applicant_id", "created_at");

-- CreateIndex
CREATE INDEX "applicant_communications_sent_by_user_id_idx" ON "applicant_communications"("sent_by_user_id");

-- AddForeignKey
ALTER TABLE "applicant_communications" ADD CONSTRAINT "applicant_communications_applicant_id_fkey" FOREIGN KEY ("applicant_id") REFERENCES "applicants"("applicant_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applicant_communications" ADD CONSTRAINT "applicant_communications_sent_by_user_id_fkey" FOREIGN KEY ("sent_by_user_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applicant_communications" ADD CONSTRAINT "applicant_communications_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("application_id") ON DELETE SET NULL ON UPDATE CASCADE;
