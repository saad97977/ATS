"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const applicantReferencesController_1 = require("../../controllers/applicant/applicantReferencesController");
const router = (0, express_1.Router)();
/**
 * ApplicantReferences CRUD Routes
 * Minimal routing using factory-generated controller
 */
// Get references by applicant (MUST come before '/applicant-references/:id')
router.get('/applicant/:applicant_id', applicantReferencesController_1.getReferencesByApplicantId);
// Standard CRUD operations from factory
router.get('/', applicantReferencesController_1.applicantReferencesController.getAll);
router.get('/:id', applicantReferencesController_1.applicantReferencesController.getById);
// Custom create with duplicate check
router.post('/', applicantReferencesController_1.createApplicantReference);
// Custom update with duplicate check
router.patch('/:id', applicantReferencesController_1.updateApplicantReference);
// Delete
router.delete('/:id', applicantReferencesController_1.applicantReferencesController.delete);
exports.default = router;
//# sourceMappingURL=applicantReferencesRoutes.js.map