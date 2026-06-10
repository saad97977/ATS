import express from 'express';
import { pipelineController } from '../../controllers/application/pipelineController';
import { authenticateToken, authorizeRole } from '../../middleware/authMiddleware';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticateToken);

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
router.patch('/:pipelineStageId/stage', pipelineController.updatePipelineStageManually);
router.get('/search', pipelineController.searchPipelinedApplicants);
router.get('/filter-by-interview-status', pipelineController.getPipelineByInterviewStatus);
router.get('/stats', pipelineController.getPipelineStats);
router.get('/job/:jobId', pipelineController.getPipelineByJob);
router.get('/:pipelineStageId/overview', pipelineController.getPipelineOverview);

// Interview management routes
router.get('/interview/application/:applicationId', pipelineController.getInterviewByApplication);
router.post('/:pipelineStageId/interview', pipelineController.createInterviewForPipeline);
router.patch('/interview/:interviewId/update-date', pipelineController.updateInterviewDate);
router.post('/auto-update-completed', pipelineController.autoUpdateCompletedInterviews);
router.patch('/interview/:interviewId/reject', pipelineController.rejectInterview);
router.patch('/interview/:interviewId/accept', pipelineController.acceptInterview);

// Onboarding route
// router.patch('/:pipelineStageId/onboard', pipelineController.onboardCandidate);
router.patch('/:pipelineStageId/onboard', pipelineController.uploadOnboardingDocs, pipelineController.onboardCandidate);

// CRUD routes
router.get('/', pipelineController.getAll);
router.post('/', pipelineController.create);
router.get('/:id', pipelineController.getById);
router.patch('/:id', pipelineController.update);
router.delete('/:id', pipelineController.delete);

export default router;