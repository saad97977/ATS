"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const jobNoteController_1 = require("../../controllers/job/jobNoteController");
const router = (0, express_1.Router)();
router.get('/job/:jobId', jobNoteController_1.jobNoteController.getJobNotesByJob);
/**
 * JobNote CRUD
 * Minimal routing using factory-generated controller
 */
// GET all with pagination: GET /api/job-notes?page=1&limit=10
router.get('/', jobNoteController_1.jobNoteController.getAll);
// POST create: POST /api/job-notes
router.post('/', jobNoteController_1.jobNoteController.create);
// GET by id: GET /api/job-notes/:id
router.get('/:id', jobNoteController_1.jobNoteController.getById);
// PATCH update: PATCH /api/job-notes/:id
router.patch('/:id', jobNoteController_1.jobNoteController.update);
// DELETE: DELETE /api/job-notes/:id
router.delete('/:id', jobNoteController_1.jobNoteController.delete);
exports.default = router;
//# sourceMappingURL=jobNoteRoutes.js.map