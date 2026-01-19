import { Router } from 'express';
import { jobNoteController } from '../../controllers/job/jobNoteController';

const router = Router();


router.get('/job/:jobId', jobNoteController.getJobNotesByJob);

/**
 * JobNote CRUD 
 * Minimal routing using factory-generated controller
 */


// GET all with pagination: GET /api/job-notes?page=1&limit=10
router.get('/', jobNoteController.getAll);

// POST create: POST /api/job-notes
router.post('/', jobNoteController.create);

// GET by id: GET /api/job-notes/:id
router.get('/:id', jobNoteController.getById);

// PATCH update: PATCH /api/job-notes/:id
router.patch('/:id', jobNoteController.update);

// DELETE: DELETE /api/job-notes/:id
router.delete('/:id', jobNoteController.delete);

export default router;
