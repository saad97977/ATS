import { Router } from 'express';
import { applicantContactController } from '../../controllers/applicant/applicantContactController';

const router = Router();

/**
 * ApplicantContact CRUD Routes
 * Minimal routing using factory-generated controller
 */

// GET all with pagination: GET /api/applicant-contacts?page=1&limit=10
router.get('/', applicantContactController.getAll);

// POST create: POST /api/applicant-contacts
router.post('/', applicantContactController.create);

// GET by id: GET /api/applicant-contacts/:id
router.get('/:id', applicantContactController.getById);

// PATCH update: PATCH /api/applicant-contacts/:id
router.patch('/:id', applicantContactController.update);

// DELETE: DELETE /api/applicant-contacts/:id
router.delete('/:id', applicantContactController.delete);

export default router;
