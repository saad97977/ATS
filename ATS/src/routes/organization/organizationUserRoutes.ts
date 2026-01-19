import { Router } from 'express';
import { organizationUserController } from '../../controllers/organization/organizationUserController';

const router = Router();

/**
 * Organization User Routes
 * Base path: /api/organization-users
 */

// Statistics endpoint (place before :id to avoid conflicts)
router.get('/stats', organizationUserController.getOrganizationUserStats);

// Get upcoming/filtered results (place before :id)
router.get('/organization/:organizationId', organizationUserController.getUsersByOrganization);
router.get('/user/:userId', organizationUserController.getOrganizationsByUser);
router.get('/department/:department', organizationUserController.getUsersByDepartment);
router.get('/division/:division', organizationUserController.getUsersByDivision);

// Standard CRUD operations
router.get('/', organizationUserController.getAll);
router.get('/:id', organizationUserController.getById);
router.post('/', organizationUserController.create);
router.patch('/:id', organizationUserController.update);
router.delete('/:id', organizationUserController.delete);

export default router;