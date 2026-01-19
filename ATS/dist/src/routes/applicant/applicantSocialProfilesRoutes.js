"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const applicantSocialProfilesController_1 = require("../../controllers/applicant/applicantSocialProfilesController");
const router = (0, express_1.Router)();
/**
 * ApplicantSocialProfiles CRUD Routes
 * Minimal routing using factory-generated controller
 */
// GET all with pagination: GET /api/applicant-social-profiles?page=1&limit=10
router.get('/', applicantSocialProfilesController_1.applicantSocialProfilesController.getAll);
// POST create: POST /api/applicant-social-profiles
router.post('/', applicantSocialProfilesController_1.applicantSocialProfilesController.create);
// GET by id: GET /api/applicant-social-profiles/:id
router.get('/:id', applicantSocialProfilesController_1.applicantSocialProfilesController.getById);
// PATCH update: PATCH /api/applicant-social-profiles/:id
router.patch('/:id', applicantSocialProfilesController_1.applicantSocialProfilesController.update);
// DELETE: DELETE /api/applicant-social-profiles/:id
router.delete('/:id', applicantSocialProfilesController_1.applicantSocialProfilesController.delete);
exports.default = router;
//# sourceMappingURL=applicantSocialProfilesRoutes.js.map