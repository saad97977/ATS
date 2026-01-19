import { Router } from 'express';
import { jobOwnerController } from '../../controllers/job/jobOwnerController';

const router = Router();

/**
 * JobOwner CRUD Routes
 * Minimal routing using factory-generated controller
 * /api/job-owners
 */

router.get('/job/:jobId', jobOwnerController.getJobOwnersByJob);

router.get('/', jobOwnerController.getAll);

router.post('/', jobOwnerController.create);

router.get('/:id', jobOwnerController.getById);

router.patch('/:id', jobOwnerController.update);

router.delete('/:id', jobOwnerController.delete);

export default router;
