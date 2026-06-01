-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PipelineStageName" ADD VALUE 'Active';
ALTER TYPE "PipelineStageName" ADD VALUE 'Contacted';
ALTER TYPE "PipelineStageName" ADD VALUE 'Following up';
ALTER TYPE "PipelineStageName" ADD VALUE 'Packet 1_Complete';
ALTER TYPE "PipelineStageName" ADD VALUE 'Qualified';
ALTER TYPE "PipelineStageName" ADD VALUE 'Ready to be Screened';
ALTER TYPE "PipelineStageName" ADD VALUE 'Scheduled Phone Screen';
ALTER TYPE "PipelineStageName" ADD VALUE 'Under Review';
ALTER TYPE "PipelineStageName" ADD VALUE 'Qualified: Hospitality';
ALTER TYPE "PipelineStageName" ADD VALUE 'Orientation Scheduled';
ALTER TYPE "PipelineStageName" ADD VALUE 'Orientation Complete';
ALTER TYPE "PipelineStageName" ADD VALUE 'Lack of Response';
ALTER TYPE "PipelineStageName" ADD VALUE 'No Show for P/I';
ALTER TYPE "PipelineStageName" ADD VALUE 'Not a fit';
ALTER TYPE "PipelineStageName" ADD VALUE 'Pay/Salary';
ALTER TYPE "PipelineStageName" ADD VALUE 'Declined from Pipeline';
