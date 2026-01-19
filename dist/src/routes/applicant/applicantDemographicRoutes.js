"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const applicantDemographicController_1 = require("../../controllers/applicant/applicantDemographicController");
const router = (0, express_1.Router)();
/**
 * ApplicantDemographic CRUD Routes
 * Minimal routing using factory-generated controller
 */
// GET all with pagination: GET /api/applicant-demographics?page=1&limit=10
router.get('/', applicantDemographicController_1.applicantDemographicController.getAll);
// POST create: POST /api/applicant-demographics
router.post('/', applicantDemographicController_1.applicantDemographicController.create);
// GET by id: GET /api/applicant-demographics/:id
router.get('/:id', applicantDemographicController_1.applicantDemographicController.getById);
// PATCH update: PATCH /api/applicant-demographics/:id
router.patch('/:id', applicantDemographicController_1.applicantDemographicController.update);
// DELETE: DELETE /api/applicant-demographics/:id
router.delete('/:id', applicantDemographicController_1.applicantDemographicController.delete);
exports.default = router;
//# sourceMappingURL=applicantDemographicRoutes.js.map