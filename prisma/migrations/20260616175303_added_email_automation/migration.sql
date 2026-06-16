-- CreateEnum
CREATE TYPE "EmailTriggerEvent" AS ENUM ('INTERVIEW_SCHEDULED', 'INTERVIEW_RESCHEDULED', 'INTERVIEW_REJECTED', 'OFFER_LETTER_SENT', 'ONBOARDING_WELCOME', 'ASSIGNMENT_NOTIFICATION');

-- CreateTable
CREATE TABLE "email_automation_rules" (
    "rule_id" TEXT NOT NULL,
    "trigger_event" "EmailTriggerEvent" NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "email_subject_override" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_automation_rules_pkey" PRIMARY KEY ("rule_id")
);

-- CreateTable
CREATE TABLE "applicant_email_preferences" (
    "preference_id" TEXT NOT NULL,
    "applicant_id" TEXT NOT NULL,
    "trigger_event" "EmailTriggerEvent" NOT NULL,
    "is_suppressed" BOOLEAN NOT NULL DEFAULT false,
    "suppressed_at" TIMESTAMP(3),
    "suppressed_reason" TEXT,

    CONSTRAINT "applicant_email_preferences_pkey" PRIMARY KEY ("preference_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "applicant_email_preferences_applicant_id_trigger_event_key" ON "applicant_email_preferences"("applicant_id", "trigger_event");

-- AddForeignKey
ALTER TABLE "applicant_email_preferences" ADD CONSTRAINT "applicant_email_preferences_applicant_id_fkey" FOREIGN KEY ("applicant_id") REFERENCES "applicants"("applicant_id") ON DELETE CASCADE ON UPDATE CASCADE;
