-- CreateEnum
CREATE TYPE "EmploymentTypePref" AS ENUM ('W2', '1099', 'C2C');

-- CreateEnum
CREATE TYPE "ImpressionGrade" AS ENUM ('A', 'B', 'C', 'D', 'F');

-- CreateEnum
CREATE TYPE "TalentStatus" AS ENUM ('ACTIVE_HOURLY', 'ACTIVE_SALARY', 'APPLICANT', 'CONSULTANT', 'CONTRACT', 'DO_NOT_ASSIGN', 'INACTIVE', 'INCOMPLETE_APPLICANT', 'ONBOARDING_COMPLETE_HOSPITALITY', 'ONLINE_APPLICANT', 'PART_TIME', 'REJECTED', 'RESUME_PARSED');

-- AlterTable
ALTER TABLE "applicant_contacts" ADD COLUMN     "country" TEXT,
ADD COLUMN     "email2" TEXT,
ADD COLUMN     "home_phone" TEXT,
ADD COLUMN     "state" TEXT,
ADD COLUMN     "work_phone" TEXT,
ADD COLUMN     "zip" TEXT;

-- AlterTable
ALTER TABLE "applicant_work_history" ADD COLUMN     "company" TEXT,
ADD COLUMN     "from_date" TIMESTAMP(3),
ADD COLUMN     "to_date" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "applicants" ADD COLUMN     "add_to_hotlist" BOOLEAN DEFAULT false,
ADD COLUMN     "employment_type_pref" "EmploymentTypePref",
ADD COLUMN     "first_impression" "ImpressionGrade",
ADD COLUMN     "first_name" TEXT,
ADD COLUMN     "geo_code" TEXT,
ADD COLUMN     "headline" TEXT,
ADD COLUMN     "home_office" TEXT,
ADD COLUMN     "is_us_citizen" BOOLEAN,
ADD COLUMN     "last_name" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "school_district" TEXT,
ADD COLUMN     "source" TEXT;

-- CreateTable
CREATE TABLE "applicant_education" (
    "education_id" TEXT NOT NULL,
    "applicant_id" TEXT NOT NULL,
    "school" TEXT NOT NULL,
    "degree" TEXT,
    "field" TEXT,
    "from_date" TIMESTAMP(3),
    "to_date" TIMESTAMP(3),

    CONSTRAINT "applicant_education_pkey" PRIMARY KEY ("education_id")
);

-- CreateTable
CREATE TABLE "applicant_classifications" (
    "classification_id" TEXT NOT NULL,
    "applicant_id" TEXT NOT NULL,
    "talent_status" "TalentStatus",
    "position_categories" TEXT[],
    "skill_sets" TEXT[],
    "applicant_tags" TEXT[],
    "tag_details" TEXT[],
    "industry_experience" TEXT[],
    "identifications" TEXT[],
    "certifications" TEXT[],

    CONSTRAINT "applicant_classifications_pkey" PRIMARY KEY ("classification_id")
);

-- CreateTable
CREATE TABLE "applicant_tags" (
    "tag_id" TEXT NOT NULL,
    "applicant_id" TEXT NOT NULL,
    "tag_title" TEXT NOT NULL,
    "stars" INTEGER NOT NULL,

    CONSTRAINT "applicant_tags_pkey" PRIMARY KEY ("tag_id")
);

-- CreateIndex
CREATE INDEX "applicant_education_applicant_id_idx" ON "applicant_education"("applicant_id");

-- CreateIndex
CREATE UNIQUE INDEX "applicant_classifications_applicant_id_key" ON "applicant_classifications"("applicant_id");

-- CreateIndex
CREATE INDEX "applicant_tags_applicant_id_idx" ON "applicant_tags"("applicant_id");

-- CreateIndex
CREATE UNIQUE INDEX "applicant_tags_applicant_id_tag_title_key" ON "applicant_tags"("applicant_id", "tag_title");

-- AddForeignKey
ALTER TABLE "applicant_education" ADD CONSTRAINT "applicant_education_applicant_id_fkey" FOREIGN KEY ("applicant_id") REFERENCES "applicants"("applicant_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applicant_classifications" ADD CONSTRAINT "applicant_classifications_applicant_id_fkey" FOREIGN KEY ("applicant_id") REFERENCES "applicants"("applicant_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applicant_tags" ADD CONSTRAINT "applicant_tags_applicant_id_fkey" FOREIGN KEY ("applicant_id") REFERENCES "applicants"("applicant_id") ON DELETE CASCADE ON UPDATE CASCADE;
