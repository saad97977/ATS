"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const pipelineController_1 = require("../../controllers/application/pipelineController");
const authMiddleware_1 = require("../../middleware/authMiddleware");
const router = express_1.default.Router();
// Apply authentication middleware to all routes
router.use(authMiddleware_1.authenticateToken);
/**
 * PIPELINE ROUTES
 *
 * GET    /api/pipeline                              - Get all pipeline stages (with filtering)
 * GET    /api/pipeline/search                       - Search pipelined applicants
 * GET    /api/pipeline/stats                        - Get pipeline statistics
 * GET    /api/pipeline/job/:jobId                   - Get pipeline stages by job
 * GET    /api/pipeline/:pipelineStageId/overview    - Get complete pipeline overview
 * GET    /api/pipeline/interview/application/:applicationId - Get interview details by application
 * POST   /api/pipeline                              - Create new pipeline stage
 * POST   /api/pipeline/:pipelineStageId/interview   - Schedule interview for pipeline
 * POST   /api/pipeline/auto-update-completed        - Auto-update completed interviews (cron job)
 * PATCH  /api/pipeline/interview/:interviewId/reject - Reject interview
 * PATCH  /api/pipeline/interview/:interviewId/accept - Accept interview
 * PATCH  /api/pipeline/:pipelineStageId/onboard     - Onboard candidate
 * PATCH  /api/pipeline/:id                          - Update pipeline stage
 * DELETE /api/pipeline/:id                          - Delete pipeline stage
 */
// Statistics and overview routes
router.get('/search', pipelineController_1.pipelineController.searchPipelinedApplicants);
router.get('/filter-by-interview-status', pipelineController_1.pipelineController.getPipelineByInterviewStatus);
router.get('/stats', pipelineController_1.pipelineController.getPipelineStats);
router.get('/job/:jobId', pipelineController_1.pipelineController.getPipelineByJob);
router.get('/:pipelineStageId/overview', pipelineController_1.pipelineController.getPipelineOverview);
// Interview management routes
router.get('/interview/application/:applicationId', pipelineController_1.pipelineController.getInterviewByApplication);
router.post('/:pipelineStageId/interview', pipelineController_1.pipelineController.createInterviewForPipeline);
router.patch('/interview/:interviewId/update-date', pipelineController_1.pipelineController.updateInterviewDate);
router.post('/auto-update-completed', pipelineController_1.pipelineController.autoUpdateCompletedInterviews);
router.patch('/interview/:interviewId/reject', pipelineController_1.pipelineController.rejectInterview);
router.patch('/interview/:interviewId/accept', pipelineController_1.pipelineController.acceptInterview);
// Onboarding route
router.patch('/:pipelineStageId/onboard', pipelineController_1.pipelineController.onboardCandidate);
// CRUD routes
router.get('/', pipelineController_1.pipelineController.getAll);
router.post('/', pipelineController_1.pipelineController.create);
router.get('/:id', pipelineController_1.pipelineController.getById);
router.patch('/:id', pipelineController_1.pipelineController.update);
router.delete('/:id', pipelineController_1.pipelineController.delete);
exports.default = router;
//# sourceMappingURL=pipelineRoutes.js.map