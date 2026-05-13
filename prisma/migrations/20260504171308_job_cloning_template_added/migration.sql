-- CreateTable
CREATE TABLE "job_templates" (
    "template_id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "organization_id" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_templates_pkey" PRIMARY KEY ("template_id")
);

-- CreateIndex
CREATE INDEX "job_templates_job_id_idx" ON "job_templates"("job_id");

-- CreateIndex
CREATE INDEX "job_templates_organization_id_idx" ON "job_templates"("organization_id");

-- CreateIndex
CREATE INDEX "job_templates_created_by_user_id_idx" ON "job_templates"("created_by_user_id");

-- AddForeignKey
ALTER TABLE "job_templates" ADD CONSTRAINT "job_templates_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("job_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_templates" ADD CONSTRAINT "job_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("organization_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_templates" ADD CONSTRAINT "job_templates_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
