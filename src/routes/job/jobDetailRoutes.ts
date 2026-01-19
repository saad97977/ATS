import { Router } from 'express';
import { jobDetailController } from '../../controllers/job/jobDetailController';

const router = Router();

/**
 * JobDetail CRUD Routes
 * Minimal routing using factory-generated controller
 */

// get job detail for a specific job
router.get('/job/:jobId', jobDetailController.getJobDetailByJob);

// GET all with pagination: GET /api/job-details?page=1&limit=10
router.get('/', jobDetailController.getAll);

// POST create: POST /api/job-details
router.post('/', jobDetailController.create);

// GET by id: GET /api/job-details/:id
router.get('/:id', jobDetailController.getById);

// PATCH update: PATCH /api/job-details/:id
router.patch('/:id', jobDetailController.update);

// DELETE: DELETE /api/job-details/:id
router.delete('/:id', jobDetailController.delete);

export default router;
