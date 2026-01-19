"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const interviewController_1 = require("../../controllers/application/interviewController");
const router = express_1.default.Router();
/**
 * Interview Routes
 * Base path: /api/interviews
 */
/**
 * GET /api/interviews/stats
 * Get interview statistics (grouped by status + upcoming count)
 * Must be before other routes to avoid conflicts
 */
router.get('/stats', interviewController_1.interviewController.getInterviewStats);
/**
 * GET /api/interviews/upcoming
 * Get upcoming interviews (scheduled for future dates)
 * Query params: ?page=1&limit=10&days=7
 */
router.get('/upcoming', interviewController_1.interviewController.getUpcomingInterviews);
/**
 * GET /api/interviews/date-range
 * Get interviews within a specific date range
 * Query params: ?start_date=2024-01-01&end_date=2024-12-31&page=1&limit=10
 */
router.get('/date-range', interviewController_1.interviewController.getInterviewsByDateRange);
/**
 * GET /api/interviews/application/:applicationId
 * Get all interviews for a specific application
 * Query params: ?page=1&limit=10
 */
router.get('/application/:applicationId', interviewController_1.interviewController.getInterviewsByApplication);
/**
 * GET /api/interviews/status/:status
 * Get all interviews by status (SCHEDULED, COMPLETED, CANCELLED, NO_SHOW)
 * Query params: ?page=1&limit=10
 */
router.get('/status/:status', interviewController_1.interviewController.getInterviewsByStatus);
/**
 * GET /api/interviews
 * Get all interviews with pagination
 * Query params: ?page=1&limit=10&status=SCHEDULED
 */
router.get('/', interviewController_1.interviewController.getAll);
/**
 * GET /api/interviews/:id
 * Get single interview by ID with full details
 * (application, job, organization, applicant, work history)
 */
router.get('/:id', interviewController_1.interviewController.getById);
/**
 * POST /api/interviews
 * Create new interview
 * Body: {
 *   application_id: string (UUID),
 *   interview_date: string (ISO 8601 datetime),
 *   status: string (e.g., SCHEDULED, COMPLETED, CANCELLED, NO_SHOW)
 * }
 */
router.post('/', interviewController_1.interviewController.create);
/**
 * PATCH /api/interviews/:id
 * Update existing interview
 * Body: Partial interview fields
 */
router.patch('/:id', interviewController_1.interviewController.update);
/**
 * DELETE /api/interviews/:id
 * Delete interview by ID
 */
router.delete('/:id', interviewController_1.interviewController.delete);
exports.default = router;
//# sourceMappingURL=interviewRoutes.js.map