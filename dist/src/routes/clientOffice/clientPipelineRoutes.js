"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// routes/clientOffice.pipeline.routes.ts
const express_1 = require("express");
const pipelineClientController_1 = require("../../controllers/clientOffice/pipelineClientController");
const router = (0, express_1.Router)();
router.get('/pipeline', pipelineClientController_1.clientOfficePipelineController.getAllPipelineStages);
router.get('/pipeline/stats', pipelineClientController_1.clientOfficePipelineController.getPipelineStats);
router.get('/pipeline/search', pipelineClientController_1.clientOfficePipelineController.searchPipelinedApplicants);
router.get('/pipeline/filter-by-interview-status', pipelineClientController_1.clientOfficePipelineController.getPipelineByInterviewStatus);
router.get('/pipeline/jobs', pipelineClientController_1.clientOfficePipelineController.getJobs);
router.get('/pipeline/applicants', pipelineClientController_1.clientOfficePipelineController.getApplicants);
router.get('/pipeline/assignments', pipelineClientController_1.clientOfficePipelineController.getAssignments);
router.get('/pipeline/my-organizations', pipelineClientController_1.clientOfficePipelineController.getMyOrganizations);
router.get('/pipeline/interview/application/:applicationId', pipelineClientController_1.clientOfficePipelineController.getInterviewByApplication);
router.get('/pipeline/job/:jobId', pipelineClientController_1.clientOfficePipelineController.getPipelineByJob);
router.get('/pipeline/:pipelineStageId/overview', pipelineClientController_1.clientOfficePipelineController.getPipelineOverview);
exports.default = router;
//# sourceMappingURL=clientPipelineRoutes.js.map