"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const organizationLicenseController_1 = require("../../controllers/organization/organizationLicenseController");
const fileUploadMiddleware_1 = require("../../middleware/fileUploadMiddleware");
const router = (0, express_1.Router)();
/**
 * Standard CRUD Routes
 * Note: GET routes exclude file_document field to keep response size small
 */
// Get all licenses with pagination (excludes file content)
// GET /organization-licenses?page=1&limit=10
router.get('/', organizationLicenseController_1.getAllOrganizationLicenses);
// Get license by ID (excludes file content)
// GET /organization-licenses/:id
router.get('/:id', organizationLicenseController_1.getOrganizationLicenseById);
// Delete license
// DELETE /organization-licenses/:id
router.delete('/:id', organizationLicenseController_1.deleteOrganizationLicense);
/**
 * File Upload Routes
 */
// Create license with file upload
// POST /organization-licenses/upload
// Body: form-data with fields: organization_id, license_name, license_document (file), expiration_date (optional)
router.post('/upload', fileUploadMiddleware_1.uploadLicense.single('license_document'), organizationLicenseController_1.createOrganizationLicenseWithFile);
// Update license with optional file upload
// PATCH /organization-licenses/:id/upload
// Body: form-data with fields: license_name (optional), license_document (file, optional), expiration_date (optional)
router.patch('/:id/upload', fileUploadMiddleware_1.uploadLicense.single('license_document'), organizationLicenseController_1.updateOrganizationLicenseWithFile);
// Download license document
// GET /organization-licenses/:id/download
router.get('/:id/download', organizationLicenseController_1.downloadOrganizationLicense);
exports.default = router;
//# sourceMappingURL=organizationLicenseRoutes.js.map