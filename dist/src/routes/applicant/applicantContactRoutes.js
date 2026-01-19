"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const applicantContactController_1 = require("../../controllers/applicant/applicantContactController");
const router = (0, express_1.Router)();
/**
 * ApplicantContact CRUD Routes
 * Minimal routing using factory-generated controller
 */
// GET all with pagination: GET /api/applicant-contacts?page=1&limit=10
router.get('/', applicantContactController_1.applicantContactController.getAll);
// POST create: POST /api/applicant-contacts
router.post('/', applicantContactController_1.applicantContactController.create);
// GET by id: GET /api/applicant-contacts/:id
router.get('/:id', applicantContactController_1.applicantContactController.getById);
// PATCH update: PATCH /api/applicant-contacts/:id
router.patch('/:id', applicantContactController_1.applicantContactController.update);
// DELETE: DELETE /api/applicant-contacts/:id
router.delete('/:id', applicantContactController_1.applicantContactController.delete);
exports.default = router;
//# sourceMappingURL=applicantContactRoutes.js.map