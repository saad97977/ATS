"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const applicantWorkHistoryController_1 = require("../../controllers/applicant/applicantWorkHistoryController");
const router = (0, express_1.Router)();
/**
 * ApplicantWorkHistory CRUD Routes
 * Minimal routing using factory-generated controller
 */
// GET all with pagination: GET /api/applicant-work-history?page=1&limit=10
router.get('/', applicantWorkHistoryController_1.applicantWorkHistoryController.getAll);
// POST create: POST /api/applicant-work-history
router.post('/', applicantWorkHistoryController_1.applicantWorkHistoryController.create);
// GET by id: GET /api/applicant-work-history/:id
router.get('/:id', applicantWorkHistoryController_1.applicantWorkHistoryController.getById);
// PATCH update: PATCH /api/applicant-work-history/:id
router.patch('/:id', applicantWorkHistoryController_1.applicantWorkHistoryController.update);
// DELETE: DELETE /api/applicant-work-history/:id
router.delete('/:id', applicantWorkHistoryController_1.applicantWorkHistoryController.delete);
exports.default = router;
//# sourceMappingURL=applicantWorkHistoryRoutes.js.map