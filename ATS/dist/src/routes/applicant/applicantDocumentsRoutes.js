"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const applicantDocumentsController_1 = require("../../controllers/applicant/applicantDocumentsController");
const fileUploadMiddleware_1 = require("../../middleware/fileUploadMiddleware");
const router = (0, express_1.Router)();
/**
 * ApplicantDocument CRUD Routes with File Upload/Download
 * Handles document management for applicants including file uploads
 */
// Additional route to get documents by applicant ID: GET /api/applicant/:applicant_id/documents
router.get('/applicant/:applicant_id', applicantDocumentsController_1.getDocumentsByApplicantId);
// GET all with pagination: GET /api/applicant-documents?page=1&limit=10
router.get('/', applicantDocumentsController_1.getAllApplicantDocuments);
// POST create with file upload: POST /api/applicant-documents
router.post('/', fileUploadMiddleware_1.uploadLicense.single('document'), applicantDocumentsController_1.createApplicantDocumentWithFile);
// GET by id (without file data): GET /api/applicant-documents/:id
router.get('/:id', applicantDocumentsController_1.getApplicantDocumentById);
// PATCH update with optional file: PATCH /api/applicant-documents/:id
router.patch('/:id', fileUploadMiddleware_1.uploadLicense.single('document'), applicantDocumentsController_1.updateApplicantDocumentWithFile);
// GET download file: GET /api/applicant-documents/:id/download
router.get('/:id/download', applicantDocumentsController_1.downloadApplicantDocument);
// DELETE: DELETE /api/applicant-documents/:id
router.delete('/:id', applicantDocumentsController_1.deleteApplicantDocument);
exports.default = router;
//# sourceMappingURL=applicantDocumentsRoutes.js.map