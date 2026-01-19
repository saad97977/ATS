import { Router } from 'express';
import { applicantDemographicController } from '../../controllers/applicant/applicantDemographicController';

const router = Router();

/**
 * ApplicantDemographic CRUD Routes
 * Minimal routing using factory-generated controller
 */

// GET all with pagination: GET /api/applicant-demographics?page=1&limit=10
router.get('/', applicantDemographicController.getAll);

// POST create: POST /api/applicant-demographics
router.post('/', applicantDemographicController.create);

// GET by id: GET /api/applicant-demographics/:id
router.get('/:id', applicantDemographicController.getById);

// PATCH update: PATCH /api/applicant-demographics/:id
router.patch('/:id', applicantDemographicController.update);

// DELETE: DELETE /api/applicant-demographics/:id
router.delete('/:id', applicantDemographicController.delete);

export default router;
