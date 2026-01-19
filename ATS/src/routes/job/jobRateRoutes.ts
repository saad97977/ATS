import { Router } from 'express';
import { jobRateController } from '../../controllers/job/jobRateController';

const router = Router();

/**
 * JobRate CRUD Routes
 * Minimal routing using factory-generated controller
 */

router.get('/job/:jobId', jobRateController.getJobRateByJob);


// GET all with pagination: GET /api/job-rates?page=1&limit=10
router.get('/', jobRateController.getAll);

// POST create: POST /api/job-rates
router.post('/', jobRateController.create);

// GET by id: GET /api/job-rates/:id
router.get('/:id', jobRateController.getById);

// PATCH update: PATCH /api/job-rates/:id
router.patch('/:id', jobRateController.update);

// DELETE: DELETE /api/job-rates/:id
router.delete('/:id', jobRateController.delete);

export default router;
