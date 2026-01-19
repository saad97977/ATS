import { Router } from 'express';
import { organizationController } from '../../controllers/organization/organizationController';
import { authenticateToken, authorizeRole } from '../../middleware/authMiddleware';


const router = Router();

router.get('/', authenticateToken, authorizeRole('HCM_USER'), organizationController.getAll);
router.get('/:id', organizationController.getById);
router.post('/', organizationController.create);
router.patch('/:id', organizationController.update);
router.delete('/:id', organizationController.delete);

export default router;
