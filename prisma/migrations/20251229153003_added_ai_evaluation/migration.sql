-- CreateTable
CREATE TABLE "application_evaluations" (
    "evaluation_id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "ai_score" DECIMAL(5,2) NOT NULL,
    "model_name" TEXT NOT NULL,
    "raw_response" JSONB,
    "evaluated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_evaluations_pkey" PRIMARY KEY ("evaluation_id")
);

-- CreateIndex
CREATE INDEX "application_evaluations_application_id_idx" ON "application_evaluations"("application_id");

-- AddForeignKey
ALTER TABLE "application_evaluations" ADD CONSTRAINT "application_evaluations_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("application_id") ON DELETE CASCADE ON UPDATE CASCADE;
