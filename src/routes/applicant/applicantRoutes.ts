import { application, Router } from 'express';
import { applicantController } from '../../controllers/applicant/applicantController';

const router = Router();


router.get('/', applicantController.getAll);

router.post('/', applicantController.create);

router.get('/:id', applicantController.getById);

router.patch('/:id', applicantController.update);

router.delete('/:id', applicantController.delete);

export default router;
