/*
  Warnings:

  - A unique constraint covering the columns `[license_name]` on the table `organization_licenses` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "organization_licenses_license_name_key" ON "organization_licenses"("license_name");
