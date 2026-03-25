"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const applicationController_1 = require("../../controllers/application/applicationController");
const router = express_1.default.Router();
/**
 * Application Routes
 * Base path: /api/applications
 */
/**
 * GET /api/applications
 * Get all applications with pagination
 * Query params: ?page=1&limit=10
 */
router.get('/', applicationController_1.applicationController.getAll);
/**
 * GET /api/applications/stats
 * Get overall application statistics (grouped by status)
 * Must be before /:id to avoid route conflict
 */
router.get('/stats', applicationController_1.applicationController.getOverallStats);
/**
 * GET /api/applications/search
 * Search applications by job title, applicant name, or organization name
 * Query params: ?q=searchTerm&page=1&limit=10&status=APPLIED
 * Must be before /:id to avoid route conflict
 */
router.get('/search', applicationController_1.applicationController.searchApplications);
/**
 * GET /api/applications/dropdown-data
 * Get dropdown data for filtering (all jobs and organizations with applications)
 * Returns: { jobs: [...], organizations: [...] }
 * Must be before /:id to avoid route conflict
 */
router.get('/dropdown-data', applicationController_1.applicationController.getApplicationsDropdownData);
/**
 * GET /api/applications/job/:jobId/stats
 * Get application statistics for a specific job (grouped by status)
 * Must be before /job/:jobId to avoid route conflict
 */
router.get('/job/:jobId/stats', applicationController_1.applicationController.getApplicationStatsByJob);
/**
 * GET /api/applications/job/:jobId
 * Get all applications for a specific job
 * Query params: ?page=1&limit=10&status=APPLIED
 */
router.get('/job/:jobId', applicationController_1.applicationController.getApplicationsByJob);
/**
 * GET /api/applications/applicant/:applicantId
 * Get all applications for a specific applicant
 * Query params: ?page=1&limit=10
 */
router.get('/applicant/:applicantId', applicationController_1.applicationController.getApplicationsByApplicant);
/**
 * GET /api/applications/status/:status
 * Get all applications by status (APPLIED, SCREENED, OFFERED, HIRED)
 * Query params: ?page=1&limit=10
 */
router.get('/status/:status', applicationController_1.applicationController.getApplicationsByStatus);
/**
 * GET /api/applications/:id/detail
 * Get application with job details and applicant info
 * Returns: job_title, job_details, job_notes, applicant name, applicant work_history, applicant demographic
 * Must be before /:id to avoid route conflict
 */
router.get('/:id/detail', applicationController_1.applicationController.getApplicationDetail);
/**
 * GET /api/applications/:id
 * Get single application by ID with full details
 * (job, applicant, interviews, pipeline stages, assignment, evaluations)
 */
router.get('/:id', applicationController_1.applicationController.getById);
/**
 * POST /api/applications
 * Create new application
 * Body: {
 *   job_id: string (UUID),
 *   applicant_id: string (UUID),
 *   source?: string,
 *   status?: 'APPLIED' | 'SCREENED' | 'OFFERED' | 'HIRED' (default: APPLIED)
 * }
 * Note: Prevents duplicate applications (same job + applicant)
 */
router.post('/', applicationController_1.applicationController.create);
/**
 * PATCH /api/applications/:id
 * Update existing application
 * Body: Partial application fields
 */
router.patch('/:id', applicationController_1.applicationController.update);
/**
 * DELETE /api/applications/:id
 * Delete application by ID
 */
router.delete('/:id', applicationController_1.applicationController.delete);
exports.default = router;
//# sourceMappingURL=applicationRoutes.js.map