import { Router } from 'express';
import { 
  createOrganizationLicenseWithFile,
  updateOrganizationLicenseWithFile,
  downloadOrganizationLicense,
  getAllOrganizationLicenses,
  getOrganizationLicenseById,
  deleteOrganizationLicense
} from '../../controllers/organization/organizationLicenseController';
import { uploadLicense } from '../../middleware/fileUploadMiddleware';

const router = Router();

/**
 * Standard CRUD Routes
 * Note: GET routes exclude file_document field to keep response size small
 */

// Get all licenses with pagination (excludes file content)
// GET /organization-licenses?page=1&limit=10
router.get('/', getAllOrganizationLicenses);

// Get license by ID (excludes file content)
// GET /organization-licenses/:id
router.get('/:id', getOrganizationLicenseById);

// Delete license
// DELETE /organization-licenses/:id
router.delete('/:id', deleteOrganizationLicense);

/**
 * File Upload Routes
 */

// Create license with file upload
// POST /organization-licenses/upload
// Body: form-data with fields: organization_id, license_name, license_document (file), expiration_date (optional)
router.post('/upload', uploadLicense.single('license_document'), createOrganizationLicenseWithFile);

// Update license with optional file upload
// PATCH /organization-licenses/:id/upload
// Body: form-data with fields: license_name (optional), license_document (file, optional), expiration_date (optional)
router.patch('/:id/upload', uploadLicense.single('license_document'), updateOrganizationLicenseWithFile);

// Download license document
// GET /organization-licenses/:id/download
router.get('/:id/download', downloadOrganizationLicense);

export default router;
