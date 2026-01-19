import { Router } from 'express';
import { 
  applicantReferencesController,
  createApplicantReference,
  updateApplicantReference,
  getReferencesByApplicantId
} from '../../controllers/applicant/applicantReferencesController';

const router = Router();

/**
 * ApplicantReferences CRUD Routes
 * Minimal routing using factory-generated controller
 */

// Get references by applicant (MUST come before '/applicant-references/:id')
router.get('/applicant/:applicant_id', getReferencesByApplicantId);

// Standard CRUD operations from factory
router.get('/', applicantReferencesController.getAll);
router.get('/:id', applicantReferencesController.getById);

// Custom create with duplicate check
router.post('/', createApplicantReference);

// Custom update with duplicate check
router.patch('/:id', updateApplicantReference);

// Delete
router.delete('/:id', applicantReferencesController.delete);

export default router;