"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const organizationDocumentController_1 = require("../../controllers/organization/organizationDocumentController");
const fileUploadMiddleware_1 = require("../../middleware/fileUploadMiddleware");
const router = (0, express_1.Router)();
/**
 * Standard CRUD Routes
 * Note: GET routes exclude file field to keep response size small
 */
// Get all documents with pagination (excludes file content)
// GET /organization-documents?page=1&limit=10
router.get('/', organizationDocumentController_1.getAllOrganizationDocuments);
// Get document by ID (excludes file content)
// GET /organization-documents/:id
router.get('/:id', organizationDocumentController_1.getOrganizationDocumentById);
// Delete document
// DELETE /organization-documents/:id
router.delete('/:id', organizationDocumentController_1.deleteOrganizationDocument);
/**
 * File Upload Routes
 */
// Create document with file upload
// POST /organization-documents/upload
// Body: form-data with fields: organization_id, document_title_id, document_type, document_name, user_id, file (file), privacy, expiration_date (optional)
router.post('/upload', fileUploadMiddleware_1.uploadLicense.single('file'), organizationDocumentController_1.createOrganizationDocumentWithFile);
// Update document with optional file upload
// PATCH /organization-documents/:id/upload
// Body: form-data with fields: document_title_id (optional), document_type (optional), document_name (optional), privacy (optional), file (file, optional), expiration_date (optional)
router.patch('/:id/upload', fileUploadMiddleware_1.uploadLicense.single('file'), organizationDocumentController_1.updateOrganizationDocumentWithFile);
// Download document
// GET /organization-documents/:id/download
router.get('/:id/download', organizationDocumentController_1.downloadOrganizationDocument);
exports.default = router;
//# sourceMappingURL=organizationDocumentRoutes.js.map