import { Router } from 'express';
import { 
  createApplicantDocumentWithFile, 
  updateApplicantDocumentWithFile, 
  downloadApplicantDocument, 
  getAllApplicantDocuments, 
  getApplicantDocumentById, 
  deleteApplicantDocument,
  getDocumentsByApplicantId
} from '../../controllers/applicant/applicantDocumentsController';
import { uploadLicense } from '../../middleware/fileUploadMiddleware';


const router = Router();

/**
 * ApplicantDocument CRUD Routes with File Upload/Download
 * Handles document management for applicants including file uploads
 */

// Additional route to get documents by applicant ID: GET /api/applicant/:applicant_id/documents
router.get('/applicant/:applicant_id', getDocumentsByApplicantId);

// GET all with pagination: GET /api/applicant-documents?page=1&limit=10
router.get('/', getAllApplicantDocuments);

// POST create with file upload: POST /api/applicant-documents
router.post('/', uploadLicense.single('document'), createApplicantDocumentWithFile);

// GET by id (without file data): GET /api/applicant-documents/:id
router.get('/:id', getApplicantDocumentById);

// PATCH update with optional file: PATCH /api/applicant-documents/:id
router.patch('/:id', uploadLicense.single('document'), updateApplicantDocumentWithFile);

// GET download file: GET /api/applicant-documents/:id/download
router.get('/:id/download', downloadApplicantDocument);

// DELETE: DELETE /api/applicant-documents/:id
router.delete('/:id', deleteApplicantDocument);



export default router;
