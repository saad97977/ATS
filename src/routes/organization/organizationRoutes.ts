import { Router } from 'express';
import { organizationController, setOrganizationOnboardingDocuments } from '../../controllers/organization/organizationController';
import { authenticateToken, authorizeRole } from '../../middleware/authMiddleware';

const router = Router();


router.get('/',  organizationController.getAll);
router.get('/:id', organizationController.getById);
router.post('/', organizationController.create);
router.patch('/:id', organizationController.update);
router.delete('/:id', organizationController.delete);
router.get('/:organizationId/onboarding-documents', organizationController.getOrganizationOnboardingDocuments);
router.put('/:organizationId/onboarding-documents', organizationController.setOrganizationOnboardingDocuments);
router.get('/:organizationId/work-state', organizationController.getOrganizationWorkState);
router.get('/:templateId/view', organizationController.getOnboardingDocumentViewUrl);



export default router;
