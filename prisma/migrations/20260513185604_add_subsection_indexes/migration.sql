-- CreateIndex
CREATE INDEX "applications_job_id_status_idx" ON "applications"("job_id", "status");

-- CreateIndex
CREATE INDEX "applications_job_id_applied_at_idx" ON "applications"("job_id", "applied_at");

-- CreateIndex
CREATE INDEX "assignments_start_date_idx" ON "assignments"("start_date");

-- CreateIndex
CREATE INDEX "assignments_end_date_idx" ON "assignments"("end_date");

-- CreateIndex
CREATE INDEX "interviews_application_id_status_idx" ON "interviews"("application_id", "status");

-- CreateIndex
CREATE INDEX "interviews_application_id_interview_date_idx" ON "interviews"("application_id", "interview_date");

-- CreateIndex
CREATE INDEX "pipeline_stages_application_id_stage_name_idx" ON "pipeline_stages"("application_id", "stage_name");

-- CreateIndex
CREATE INDEX "timesheets_assignment_id_status_idx" ON "timesheets"("assignment_id", "status");

-- CreateIndex
CREATE INDEX "timesheets_status_assignment_id_idx" ON "timesheets"("status", "assignment_id");
