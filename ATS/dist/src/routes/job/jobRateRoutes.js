"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const jobRateController_1 = require("../../controllers/job/jobRateController");
const router = (0, express_1.Router)();
/**
 * JobRate CRUD Routes
 * Minimal routing using factory-generated controller
 */
router.get('/job/:jobId', jobRateController_1.jobRateController.getJobRateByJob);
// GET all with pagination: GET /api/job-rates?page=1&limit=10
router.get('/', jobRateController_1.jobRateController.getAll);
// POST create: POST /api/job-rates
router.post('/', jobRateController_1.jobRateController.create);
// GET by id: GET /api/job-rates/:id
router.get('/:id', jobRateController_1.jobRateController.getById);
// PATCH update: PATCH /api/job-rates/:id
router.patch('/:id', jobRateController_1.jobRateController.update);
// DELETE: DELETE /api/job-rates/:id
router.delete('/:id', jobRateController_1.jobRateController.delete);
exports.default = router;
//# sourceMappingURL=jobRateRoutes.js.map