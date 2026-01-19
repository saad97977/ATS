import { Router } from 'express';
import { contractController } from '../../controllers/organization/organizationContractController';

const router = Router();

/**
 * Contract Routes
 * Base path: /api/contracts
 */

// Statistics and special queries (place before :id to avoid conflicts)
router.get('/stats', contractController.getContractStats);
router.get('/pending', contractController.getPendingContracts);
router.get('/signed', contractController.getSignedContracts);

// Filter by relationships
router.get('/organization/:organizationId', contractController.getContractsByOrganization);
router.get('/user/:userId', contractController.getContractsByUser);

// Filter by statuses
router.get('/status/:status', contractController.getContractsByStatus);
router.get('/signed-status/:signedStatus', contractController.getContractsBySignedStatus);
router.get('/sent-status/:sentStatus', contractController.getContractsBySentStatus);
router.get('/contractor-type/:isContractor', contractController.getContractsByContractorType);

// Standard CRUD operations
router.get('/', contractController.getAll);
router.get('/:id', contractController.getById);
router.post('/', contractController.create);
router.patch('/:id', contractController.update);
router.delete('/:id', contractController.delete);

export default router;