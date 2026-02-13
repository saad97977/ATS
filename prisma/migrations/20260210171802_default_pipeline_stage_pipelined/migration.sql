/*
  Warnings:

  - The `stage_name` column on the `pipeline_stages` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "PipelineStageName" AS ENUM ('PIPELINED', 'INTERVIEWED', 'ONBOARDED');

-- AlterTable
ALTER TABLE "pipeline_stages" DROP COLUMN "stage_name",
ADD COLUMN     "stage_name" "PipelineStageName" NOT NULL DEFAULT 'PIPELINED';
