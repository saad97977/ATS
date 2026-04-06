"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
// Import Job Board Controllers
const publicJobBoardController_1 = require("../../controllers/public_applications/publicJobBoardController");
// Import Application Controllers
const publicApplicationsController_1 = require("../../controllers/public_applications/publicApplicationsController");
const router = (0, express_1.Router)();
/**
 * Configure Multer for resume uploads
 * Using memory storage to upload directly to Azure Blob Storage
 */
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
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
        }
        else {
            cb(new Error(`File type ${file.mimetype} not allowed. Please upload PDF, Word, or text documents only.`));
        }
    },
});
/**
 * Error handler for multer
 */
const handleMulterError = (err, req, res, next) => {
    if (err instanceof multer_1.default.MulterError) {
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
    }
    else if (err) {
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
router.get('/jobs/stats', publicJobBoardController_1.getPublicJobStats);
// Get featured jobs (should be before /:id)
// GET /api/public/jobs/featured
router.get('/jobs/featured', publicJobBoardController_1.getFeaturedJobs);
// Search jobs with advanced filters
// POST /api/public/jobs/search
router.post('/jobs/search', publicJobBoardController_1.searchPublicJobs);
// Get all public job listings with filters
// GET /api/public/jobs?search=developer&location=NY&job_type=PERMANENT&page=1&limit=10
router.get('/jobs', publicJobBoardController_1.getPublicJobs);
// Get single job details by ID
// GET /api/public/jobs/:id
router.get('/jobs/:id', publicJobBoardController_1.getPublicJobById);
// Get jobs by organization
// GET /api/public/organizations/:organizationId/jobs
router.get('/organizations/:organizationId/jobs', publicJobBoardController_1.getJobsByOrganization);
/**
 * ========================================
 * PUBLIC APPLICATION ROUTES
 * ========================================
 * All routes for job applications
 */
// Check if applicant already applied to a job
// GET /api/public/jobs/:jobId/check-application?email=john@example.com
router.get('/jobs/:jobId/check-application', publicApplicationsController_1.checkExistingApplication);
// Submit job application with resume upload
// POST /api/public/jobs/:jobId/apply
router.post('/jobs/:jobId/apply', upload.single('resume'), handleMulterError, publicApplicationsController_1.submitApplication);
// Upsert applicant profile only (no job/application created)
// POST /api/public/applicants/profile
router.post('/applicants/profile', upload.single('resume'), handleMulterError, publicApplicationsController_1.submitApplication);
// Upload resume for an existing application
// POST /api/public/applications/:applicationId/upload-resume
// Content-Type: multipart/form-data
// Body: { email: "john@example.com", resume: File }
router.post('/applications/:applicationId/upload-resume', upload.single('resume'), handleMulterError, publicApplicationsController_1.uploadApplicationResume);
// View resume for an application
// GET /api/public/applications/:applicationId/resume/view
router.get('/applications/:applicationId/resume/view', publicApplicationsController_1.viewApplicationResume);
// View cover letter for an application
// GET /api/public/applications/:applicationId/cover-letter/view
router.get('/applications/:applicationId/cover-letter/view', publicApplicationsController_1.viewApplicationCoverLetter);
// Get application status
// GET /api/public/applications/:applicationId
router.get('/applications/:applicationId', publicApplicationsController_1.getApplicationStatus);
// Download resume for an application
// GET /api/public/applications/:applicationId/resume
router.get('/applications/:applicationId/resume', publicApplicationsController_1.downloadApplicationResume);
// Withdraw application
// DELETE /api/public/applications/:applicationId/withdraw
// Body: { email: "john@example.com" }
router.delete('/applications/:applicationId/withdraw', publicApplicationsController_1.withdrawApplication);
// Get all applications for an applicant by email
// GET /api/public/applicants/applications?email=john@example.com
router.get('/applicants/applications', publicApplicationsController_1.getApplicantApplications);
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
exports.default = router;
//# sourceMappingURL=publicRoutes.js.map