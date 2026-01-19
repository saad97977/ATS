import { Router } from 'express';
import { applicantSocialProfilesController } from '../../controllers/applicant/applicantSocialProfilesController';

const router = Router();

/**
 * ApplicantSocialProfiles CRUD Routes
 * Minimal routing using factory-generated controller
 */

// GET all with pagination: GET /api/applicant-social-profiles?page=1&limit=10
router.get('/', applicantSocialProfilesController.getAll);

// POST create: POST /api/applicant-social-profiles
router.post('/', applicantSocialProfilesController.create);

// GET by id: GET /api/applicant-social-profiles/:id
router.get('/:id', applicantSocialProfilesController.getById);

// PATCH update: PATCH /api/applicant-social-profiles/:id
router.patch('/:id', applicantSocialProfilesController.update);

// DELETE: DELETE /api/applicant-social-profiles/:id
router.delete('/:id', applicantSocialProfilesController.delete);

export default router;
