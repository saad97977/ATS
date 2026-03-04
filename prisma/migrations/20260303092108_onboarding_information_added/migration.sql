-- AlterTable
ALTER TABLE "applicant_demographics" ADD COLUMN     "ssn_encrypted" TEXT,
ADD COLUMN     "tax_info" JSONB;

-- AlterTable
ALTER TABLE "assignments" ADD COLUMN     "company_codes" JSONB,
ADD COLUMN     "workers_comp_codes" JSONB;
