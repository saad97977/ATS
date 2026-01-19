import { Router } from 'express';
import { organizationDocumentTitleController } from '../../controllers/organization/organizationDocumentTitleController';

const router = Router();

router.get('/', organizationDocumentTitleController.getAll);
router.get('/:id', organizationDocumentTitleController.getById);
router.post('/', organizationDocumentTitleController.create);
router.patch('/:id', organizationDocumentTitleController.update);
router.delete('/:id', organizationDocumentTitleController.delete);

export default router;
