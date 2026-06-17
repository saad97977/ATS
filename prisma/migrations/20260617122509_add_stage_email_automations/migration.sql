-- CreateTable
CREATE TABLE "stage_email_automations" (
    "automation_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "job_id" TEXT,
    "stage_name" "PipelineStageName" NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "email_subject" TEXT NOT NULL,
    "email_body" TEXT NOT NULL,
    "attachments" JSONB,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stage_email_automations_pkey" PRIMARY KEY ("automation_id")
);

-- CreateIndex
CREATE INDEX "stage_email_automations_organization_id_idx" ON "stage_email_automations"("organization_id");

-- CreateIndex
CREATE INDEX "stage_email_automations_job_id_idx" ON "stage_email_automations"("job_id");

-- CreateIndex
CREATE INDEX "stage_email_automations_stage_name_idx" ON "stage_email_automations"("stage_name");

-- CreateIndex
CREATE INDEX "stage_email_automations_organization_id_stage_name_idx" ON "stage_email_automations"("organization_id", "stage_name");

-- AddForeignKey
ALTER TABLE "stage_email_automations" ADD CONSTRAINT "stage_email_automations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stage_email_automations" ADD CONSTRAINT "stage_email_automations_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("job_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stage_email_automations" ADD CONSTRAINT "stage_email_automations_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
