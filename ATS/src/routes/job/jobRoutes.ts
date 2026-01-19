import { Router } from 'express';
import { jobController } from '../../controllers/job/jobController';

const router = Router();

/**
 * Job Routes
 * Base path: /api/jobs
 */

// Statistics endpoint (must be before :id routes)
router.get('/stats', jobController.getJobStats);

// Special query endpoints (must be before :id routes)
router.get('/approved', jobController.getApprovedJobs);
router.get('/active', jobController.getActiveJobs);

// Filtered list endpoints
router.get('/organization/:organizationId', jobController.getJobsByOrganization);
router.get('/status/:status', jobController.getJobsByStatus);
router.get('/type/:type', jobController.getJobsByType);
router.get('/manager/:managerId', jobController.getJobsByManager);
router.get('/user/:userId', jobController.getJobsByUser);
router.get('/user/:userId/organizations', jobController.getUserOrganizations);


// Standard CRUD operations
router.get('/', jobController.getAll);
router.get('/:id', jobController.getById);
router.post('/', jobController.create);
router.patch('/:id', jobController.update);
router.delete('/:id', jobController.delete);

export default router;