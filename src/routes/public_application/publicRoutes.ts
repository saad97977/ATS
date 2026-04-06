import { Router } from 'express';
import multer from 'multer';

// Import Job Board Controllers
import {
  getPublicJobs,
  getPublicJobById,
  getPublicJobStats,
  searchPublicJobs,
  getFeaturedJobs,
  getJobsByOrganization,
} from '../../controllers/public_applications/publicJobBoardController';

// Import Application Controllers
import {
  submitApplication,
  uploadApplicationResume,
  checkExistingApplication,
  getApplicationStatus,
  downloadApplicationResume,
  withdrawApplication,
  getApplicantApplications,
  viewApplicationResume,
  viewApplicationCoverLetter
} from '../../controllers/public_applications/publicApplicationsController';

const router = Router();

/**
 * Configure Multer for resume uploads
 * Using memory storage to upload directly to Azure Blob Storage
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB file size limit
  },
  fileFilter: (req, file, cb) => {
    // Allow common resume file types
    const allowedMimeTypes = [
      'application/pdf',
      'application/msword', // .doc
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
      'text/plain', // .txt
      'application/rtf', // .rtf
    ];

    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} not allowed. Please upload PDF, Word, or text documents only.`));
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
        message: 'Resume file too large. Maximum size is 10MB',
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
 * ========================================
 * PUBLIC JOB BOARD ROUTES
 * ========================================
 * All routes for browsing and searching jobs
 */

// Get job statistics (should be before /:id to avoid route conflicts)
// GET /api/public/jobs/stats
router.get('/jobs/stats', getPublicJobStats);

// Get featured jobs (should be before /:id)
// GET /api/public/jobs/featured
router.get('/jobs/featured', getFeaturedJobs);

// Search jobs with advanced filters
// POST /api/public/jobs/search
router.post('/jobs/search', searchPublicJobs);

// Get all public job listings with filters
// GET /api/public/jobs?search=developer&location=NY&job_type=PERMANENT&page=1&limit=10
router.get('/jobs', getPublicJobs);

// Get single job details by ID
// GET /api/public/jobs/:id
router.get('/jobs/:id', getPublicJobById);

// Get jobs by organization
// GET /api/public/organizations/:organizationId/jobs
router.get('/organizations/:organizationId/jobs', getJobsByOrganization);

/**
 * ========================================
 * PUBLIC APPLICATION ROUTES
 * ========================================
 * All routes for job applications
 */

// Check if applicant already applied to a job
// GET /api/public/jobs/:jobId/check-application?email=john@example.com
router.get('/jobs/:jobId/check-application', checkExistingApplication);

// Submit job application with resume upload
// POST /api/public/jobs/:jobId/apply
router.post(
  '/jobs/:jobId/apply',
  upload.single('resume'),
  handleMulterError,
  submitApplication
);

// Upsert applicant profile only (no job/application created)
// POST /api/public/applicants/profile
router.post(
  '/applicants/profile',
  upload.single('resume'),
  handleMulterError,
  submitApplication
);


// Upload resume for an existing application
// POST /api/public/applications/:applicationId/upload-resume
// Content-Type: multipart/form-data
// Body: { email: "john@example.com", resume: File }
router.post(
  '/applications/:applicationId/upload-resume',
  upload.single('resume'),
  handleMulterError,
  uploadApplicationResume
);

// View resume for an application
// GET /api/public/applications/:applicationId/resume/view
router.get('/applications/:applicationId/resume/view', viewApplicationResume);


// View cover letter for an application
// GET /api/public/applications/:applicationId/cover-letter/view
router.get('/applications/:applicationId/cover-letter/view', viewApplicationCoverLetter);



// Get application status
// GET /api/public/applications/:applicationId
router.get('/applications/:applicationId', getApplicationStatus);

// Download resume for an application
// GET /api/public/applications/:applicationId/resume
router.get('/applications/:applicationId/resume', downloadApplicationResume);

// Withdraw application
// DELETE /api/public/applications/:applicationId/withdraw
// Body: { email: "john@example.com" }
router.delete('/applications/:applicationId/withdraw', withdrawApplication);

// Get all applications for an applicant by email
// GET /api/public/applicants/applications?email=john@example.com
router.get('/applicants/applications', getApplicantApplications);

/**
 * ========================================
 * ROUTE SUMMARY
 * ========================================
 * 
 * JOB BROWSING:
 * - GET    /api/public/jobs/stats
 * - GET    /api/public/jobs/featured
 * - POST   /api/public/jobs/search
 * - GET    /api/public/jobs
 * - GET    /api/public/jobs/:id
 * - GET    /api/public/organizations/:organizationId/jobs
 * 
 * JOB APPLICATIONS:
 * - GET    /api/public/jobs/:jobId/check-application
 * - POST   /api/public/jobs/:jobId/apply
 * - POST   /api/public/applications/:applicationId/upload-resume
 * - GET    /api/public/applications/:applicationId
 * - GET    /api/public/applications/:applicationId/resume
 * - GET    /api/public/applications/:applicationId/resume/view
 * - GET    /api/public/applications/:applicationId/cover-letter/view
 * - GET    /api/public/applicants/applications
 * - DELETE /api/public/applications/:applicationId/withdraw
 */

export default router;