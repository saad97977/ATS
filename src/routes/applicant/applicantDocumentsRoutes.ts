import { Router } from 'express';
import multer from 'multer';
import {
  createApplicantDocumentWithFile,
  updateApplicantDocumentWithFile,
  downloadApplicantDocument,
  getAllApplicantDocuments,
  getApplicantDocumentById,
  deleteApplicantDocument,
  getDocumentsByApplicantId,
} from '../../controllers/applicant/applicantDocumentsController';

const router = Router();

/**
 * Configure Multer for file uploads
 * Using memory storage to upload directly to Azure Blob Storage
 */
const upload = multer({
  storage: multer.memoryStorage(), // Store in memory for Azure upload
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB file size limit
  },
  fileFilter: (req, file, cb) => {
    // Optional: Filter allowed file types
    const allowedMimeTypes = [
      'application/pdf',
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'application/msword', // .doc
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
      'application/vnd.ms-excel', // .xls
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
    ];

    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} not allowed. Allowed types: PDF, Images, Word, Excel`));
    }
  },
});

/**
 * Error handler for multer
 */
const handleMulterError = (err: any, req: any, res: any, next: any) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File too large. Maximum size is 10MB',
        error: err.message,
      });
    }
    return res.status(400).json({
      success: false,
      message: 'File upload error',
      error: err.message,
    });
  } else if (err) {
    return res.status(400).json({
      success: false,
      message: err.message || 'Unknown error occurred',
    });
  }
  next();
};

/**
 * Applicant Document Routes
 * Base path: /api/applicant-documents
 */

// Create new document with file upload
// POST /api/applicant-documents
router.post(
  '/',
  upload.single('file'),
  handleMulterError,
  createApplicantDocumentWithFile
);

// Update existing document (optional file upload)
// PUT /api/applicant-documents/:id
router.put(
  '/:id',
  upload.single('file'),
  handleMulterError,
  updateApplicantDocumentWithFile
);

// Download document file
// GET /api/applicant-documents/:id/download
router.get(
  '/:id/download',
  downloadApplicantDocument
);

// Get all documents for a specific applicant
// GET /api/applicant-documents/applicant/:applicant_id
router.get(
  '/applicant/:applicant_id',
  getDocumentsByApplicantId
);

// Get single document by ID (metadata only)
// GET /api/applicant-documents/:id
router.get(
  '/:id',
  getApplicantDocumentById
);

// Get all documents (paginated)
// GET /api/applicant-documents
router.get(
  '/',
  getAllApplicantDocuments
);

// Delete document (removes from both database and Azure)
// DELETE /api/applicant-documents/:id
router.delete(
  '/:id',
  deleteApplicantDocument
);

export default router;