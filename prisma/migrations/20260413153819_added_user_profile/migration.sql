-- CreateEnum
CREATE TYPE "EmploymentStatus" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN', 'ON_LEAVE', 'TERMINATED');

-- CreateTable
CREATE TABLE "user_profiles" (
    "profile_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "first_name" TEXT,
    "last_name" TEXT,
    "middle_name" TEXT,
    "display_name" TEXT,
    "avatar_url" TEXT,
    "avatar_blob_name" TEXT,
    "work_phone" TEXT,
    "mobile_phone" TEXT,
    "work_email" TEXT,
    "personal_email" TEXT,
    "title" TEXT,
    "department" TEXT,
    "branch" TEXT,
    "division" TEXT,
    "office_location" TEXT,
    "employee_id" TEXT,
    "hire_date" TIMESTAMP(3),
    "employment_status" "EmploymentStatus" NOT NULL DEFAULT 'FULL_TIME',
    "manager_user_id" TEXT,
    "timezone" TEXT,
    "language" TEXT DEFAULT 'en',
    "linkedin_url" TEXT,
    "bio" TEXT,
    "notify_email" BOOLEAN NOT NULL DEFAULT true,
    "notify_sms" BOOLEAN NOT NULL DEFAULT false,
    "notify_in_app" BOOLEAN NOT NULL DEFAULT true,
    "signature_image_url" TEXT,
    "signature_blob_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("profile_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_profiles_user_id_key" ON "user_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_profiles_employee_id_key" ON "user_profiles"("employee_id");

-- AddForeignKey
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
