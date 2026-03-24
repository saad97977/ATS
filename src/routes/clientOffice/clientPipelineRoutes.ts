// routes/clientOffice.pipeline.routes.ts
import { Router } from 'express';
import { clientOfficePipelineController as c } from '../../controllers/clientOffice/pipelineClientController';


const router = Router();


router.get('/pipeline',                                    c.getAllPipelineStages);
router.get('/pipeline/stats',                              c.getPipelineStats);
router.get('/pipeline/search',                             c.searchPipelinedApplicants);
router.get('/pipeline/filter-by-interview-status',         c.getPipelineByInterviewStatus);
router.get('/pipeline/jobs',                               c.getJobs);
router.get('/pipeline/applicants',                         c.getApplicants);
router.get('/pipeline/assignments',                        c.getAssignments);
router.get('/pipeline/my-organizations',                   c.getMyOrganizations);
router.get('/pipeline/interview/application/:applicationId', c.getInterviewByApplication);
router.get('/pipeline/job/:jobId',                         c.getPipelineByJob);
router.get('/pipeline/:pipelineStageId/overview',         c.getPipelineOverview);

export default router;