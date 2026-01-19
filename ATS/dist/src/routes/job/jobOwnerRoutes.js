"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const jobOwnerController_1 = require("../../controllers/job/jobOwnerController");
const router = (0, express_1.Router)();
/**
 * JobOwner CRUD Routes
 * Minimal routing using factory-generated controller
 * /api/job-owners
 */
router.get('/job/:jobId', jobOwnerController_1.jobOwnerController.getJobOwnersByJob);
router.get('/', jobOwnerController_1.jobOwnerController.getAll);
router.post('/', jobOwnerController_1.jobOwnerController.create);
router.get('/:id', jobOwnerController_1.jobOwnerController.getById);
router.patch('/:id', jobOwnerController_1.jobOwnerController.update);
router.delete('/:id', jobOwnerController_1.jobOwnerController.delete);
exports.default = router;
//# sourceMappingURL=jobOwnerRoutes.js.map