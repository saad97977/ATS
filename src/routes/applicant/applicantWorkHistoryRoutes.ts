import { Router } from 'express';
import { applicantWorkHistoryController } from '../../controllers/applicant/applicantWorkHistoryController';

const router = Router();

/**
 * ApplicantWorkHistory CRUD Routes
 * Minimal routing using factory-generated controller
 */

// GET all with pagination: GET /api/applicant-work-history?page=1&limit=10
router.get('/', applicantWorkHistoryController.getAll);

// POST create: POST /api/applicant-work-history
router.post('/', applicantWorkHistoryController.create);

// GET by id: GET /api/applicant-work-history/:id
router.get('/:id', applicantWorkHistoryController.getById);

// PATCH update: PATCH /api/applicant-work-history/:id
router.patch('/:id', applicantWorkHistoryController.update);

// DELETE: DELETE /api/applicant-work-history/:id
router.delete('/:id', applicantWorkHistoryController.delete);

export default router;
