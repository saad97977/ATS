-- AlterTable
ALTER TABLE "applicants" ADD COLUMN     "communication_preference" TEXT,
ADD COLUMN     "is_optout" BOOLEAN DEFAULT false,
ADD COLUMN     "is_private" BOOLEAN DEFAULT false,
ADD COLUMN     "office_division" TEXT,
ADD COLUMN     "office_name" TEXT,
ADD COLUMN     "text_consent" TEXT;

-- AlterTable
ALTER TABLE "assignments" ADD COLUMN     "extended" BOOLEAN DEFAULT false,
ADD COLUMN     "falloff" BOOLEAN DEFAULT false,
ADD COLUMN     "hire_bill_rate" DECIMAL(10,2),
ADD COLUMN     "hire_burden" DECIMAL(5,2),
ADD COLUMN     "hire_markup" DECIMAL(5,2),
ADD COLUMN     "hire_ot_bill_rate" DECIMAL(10,2),
ADD COLUMN     "hire_ot_pay_rate" DECIMAL(10,2),
ADD COLUMN     "hire_pay_rate" DECIMAL(10,2),
ADD COLUMN     "hired_notes" TEXT;
