-- AlterTable
ALTER TABLE "users" ADD COLUMN     "back_office_allow" BOOLEAN DEFAULT true,
ADD COLUMN     "client_office_allow" BOOLEAN DEFAULT true,
ADD COLUMN     "front_office_allow" BOOLEAN DEFAULT true;
