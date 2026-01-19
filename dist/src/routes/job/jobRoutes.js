"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const jobController_1 = require("../../controllers/job/jobController");
const router = (0, express_1.Router)();
/**
 * Job Routes
 * Base path: /api/jobs
 */
// Statistics endpoint (must be before :id routes)
router.get('/stats', jobController_1.jobController.getJobStats);
// Special query endpoints (must be before :id routes)
router.get('/approved', jobController_1.jobController.getApprovedJobs);
router.get('/active', jobController_1.jobController.getActiveJobs);
// Filtered list endpoints
router.get('/organization/:organizationId', jobController_1.jobController.getJobsByOrganization);
router.get('/status/:status', jobController_1.jobController.getJobsByStatus);
router.get('/type/:type', jobController_1.jobController.getJobsByType);
router.get('/manager/:managerId', jobController_1.jobController.getJobsByManager);
router.get('/user/:userId', jobController_1.jobController.getJobsByUser);
router.get('/user/:userId/organizations', jobController_1.jobController.getUserOrganizations);
// Standard CRUD operations
router.get('/', jobController_1.jobController.getAll);
router.get('/:id', jobController_1.jobController.getById);
router.post('/', jobController_1.jobController.create);
router.patch('/:id', jobController_1.jobController.update);
router.delete('/:id', jobController_1.jobController.delete);
exports.default = router;
//# sourceMappingURL=jobRoutes.js.map