/*
  Warnings:

  - You are about to drop the column `last_action_1` on the `user_activities` table. All the data in the column will be lost.
  - You are about to drop the column `last_action_2` on the `user_activities` table. All the data in the column will be lost.
  - You are about to drop the column `last_action_3` on the `user_activities` table. All the data in the column will be lost.
  - Added the required column `created_by_user_id` to the `jobs` table without a default value. This is not possible if the table is not empty.
  - Added the required column `created_by_user_id` to the `organizations` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `user_activities` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "created_by_user_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "created_by_user_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "user_activities" DROP COLUMN "last_action_1",
DROP COLUMN "last_action_2",
DROP COLUMN "last_action_3",
ADD COLUMN     "last_actions" JSONB,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL;

-- CreateIndex
CREATE INDEX "jobs_created_by_user_id_idx" ON "jobs"("created_by_user_id");

-- CreateIndex
CREATE INDEX "organizations_created_by_user_id_idx" ON "organizations"("created_by_user_id");

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
