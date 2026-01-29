import { Router } from 'express';
import { 
  createOrganizationDocumentWithFile,
  updateOrganizationDocumentWithFile,
  downloadOrganizationDocument,
  getAllOrganizationDocuments,
  getOrganizationDocumentById,
  deleteOrganizationDocument,
  viewOrganizationDocument
} from '../../controllers/organization/organizationDocumentController';
import { uploadLicense } from '../../middleware/fileUploadMiddleware';

const router = Router();

/**
 * Standard CRUD Routes
 * Note: GET routes exclude file field to keep response size small
 */

// Get all documents with pagination (excludes file content)
// GET api/organization-documents?page=1&limit=10
router.get('/', getAllOrganizationDocuments);

// Get document by ID (excludes file content)
// GET api/organization-documents/:id
router.get('/:id', getOrganizationDocumentById);

// Delete document
// DELETE api/organization-documents/:id
router.delete('/:id', deleteOrganizationDocument);


router.get('/:id/view', viewOrganizationDocument);


/**
 * File Upload Routes
 */

// Create document with file upload
// POST api/organization-documents/upload
// Body: form-data with fields: organization_id, document_title_id, document_type, document_name, user_id, file (file), privacy, expiration_date (optional)
router.post('/upload', uploadLicense.single('file'), createOrganizationDocumentWithFile);

// Update document with optional file upload
// PATCH api/organization-documents/:id/upload
// Body: form-data with fields: document_title_id (optional), document_type (optional), document_name (optional), privacy (optional), file (file, optional), expiration_date (optional)
router.patch('/:id/upload', uploadLicense.single('file'), updateOrganizationDocumentWithFile);

// Download document
// GET api/organization-documents/:id/download
router.get('/:id/download', downloadOrganizationDocument);

export default router;
