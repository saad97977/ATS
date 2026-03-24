-- CreateEnum
CREATE TYPE "TimeCaptureType" AS ENUM ('TIMESHEET', 'MANUAL', 'CLOCK_IN_OUT');

-- CreateEnum
CREATE TYPE "PayPeriodType" AS ENUM ('WEEKLY', 'BI_WEEKLY', 'SEMI_MONTHLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "WeekDurationType" AS ENUM ('MON_SUN', 'SUN_SAT', 'SAT_FRI');

-- CreateEnum
CREATE TYPE "RateType" AS ENUM ('HOURLY', 'SALARY', 'DAILY');

-- CreateEnum
CREATE TYPE "JobBranch" AS ENUM ('SMS_HOSPITALITY', 'SMS_MCL_JASCO_GOC', 'SMS_ADMIN', 'SMS_STAFFING_SOLUTIONS', 'SPECIAL_MULTI_ADMIN', 'SPECIAL_MULTI_INC');

-- CreateEnum
CREATE TYPE "JobCategory" AS ENUM ('ACCOUNTING', 'ADMIN', 'BILINGUAL_CSR', 'CLERICAL', 'CLIENT_RELATIONS', 'CONSTRUCTION', 'ENGINEERING', 'EXECUTIVE', 'FIELD_TECHNICIAN', 'FOOD_SERVICE', 'FORKLIFT', 'GENERAL_LABOR', 'HOTEL_FOOD_BEVERAGE', 'HUMAN_RESOURCES', 'INDUSTRIAL', 'INTERNSHIP', 'LANGUAGE', 'MACHINE_OPERATOR', 'MANAGEMENT', 'MARKETING', 'PRODUCTION', 'QUALITY_CONTROL', 'SALES', 'SEMICONDUCTOR', 'SOFTWARE_OS', 'SPECIFIC', 'SUPERVISORY', 'TECHNICAL', 'TRANSPORTATION', 'WAREHOUSE', 'WELDING');

-- AlterTable
ALTER TABLE "job_rates" ADD COLUMN     "burden" DECIMAL(5,2),
ADD COLUMN     "discounts" DECIMAL(5,2),
ADD COLUMN     "dt_bill_rate" DECIMAL(10,2),
ADD COLUMN     "dt_markup_percentage" DECIMAL(5,2),
ADD COLUMN     "dt_pay_rate" DECIMAL(10,2),
ADD COLUMN     "estimated_gp" DECIMAL(14,2),
ADD COLUMN     "estimated_hours" INTEGER,
ADD COLUMN     "expenses" TEXT,
ADD COLUMN     "gross_margin_hourly" DECIMAL(10,2),
ADD COLUMN     "max_bill_rate" DECIMAL(10,2),
ADD COLUMN     "max_pay_rate" DECIMAL(10,2),
ADD COLUMN     "min_bill_rate" DECIMAL(10,2),
ADD COLUMN     "min_pay_rate" DECIMAL(10,2),
ADD COLUMN     "target_bill_rate" DECIMAL(10,2),
ADD COLUMN     "target_pay_rate" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "address" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "contract_duration" INTEGER,
ADD COLUMN     "custom_job_id" TEXT,
ADD COLUMN     "invoice_with_hours" BOOLEAN DEFAULT false,
ADD COLUMN     "job_branch" "JobBranch",
ADD COLUMN     "job_category" "JobCategory",
ADD COLUMN     "manager_last_contacted" TIMESTAMP(3),
ADD COLUMN     "open_date" TIMESTAMP(3),
ADD COLUMN     "pay_period" "PayPeriodType" NOT NULL DEFAULT 'WEEKLY',
ADD COLUMN     "paycom_position" TEXT,
ADD COLUMN     "po_amount" DECIMAL(14,2),
ADD COLUMN     "po_number" TEXT,
ADD COLUMN     "rate_type" "RateType" NOT NULL DEFAULT 'HOURLY',
ADD COLUMN     "state" TEXT,
ADD COLUMN     "time_capture" "TimeCaptureType" NOT NULL DEFAULT 'TIMESHEET',
ADD COLUMN     "week_duration" "WeekDurationType" NOT NULL DEFAULT 'MON_SUN',
ADD COLUMN     "withhold_emails" BOOLEAN DEFAULT false;
