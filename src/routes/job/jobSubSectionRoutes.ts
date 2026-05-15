import { Router } from 'express';
import {
  getJobApplications,
  getJobApplicationsCounts,
  getJobPipelinedApplicants,
  getJobPipelineCounts,
  getJobAssignments,
  getJobAssignmentCounts,
  getJobTimesheets,
  getJobTimesheetCounts,
  getTimesheetEntries,
  getJobOverview,
  getJobInterviews,
} from '../../controllers/job/JobSubSectionController';

const router = Router();

/**
 * Job Sub-Section Routes
 * Base path: /api/jobs/:id
 * 
 * These routes provide detailed views for job sub-sections:
 * - Applications: applicants who applied to the job
 * - Pipeline: applicants in recruiting pipeline stages
 * - Assignments: workers placed/hired for the job
 * - Timesheets: time tracking for assigned workers
 * - Interviews: interview records for applicants
 */

// ============================================================
// OVERVIEW
// GET /api/jobs/:id/overview
// ============================================================
router.get('/:id/overview', getJobOverview);

// ============================================================
// APPLICATIONS SUB-SECTION
// GET /api/jobs/:id/applications
// GET /api/jobs/:id/applications/counts
// ============================================================
router.get('/:id/applications/counts', getJobApplicationsCounts);
router.get('/:id/applications', getJobApplications);

// ============================================================
// PIPELINE SUB-SECTION
// GET /api/jobs/:id/pipelined
// GET /api/jobs/:id/pipelined/counts
// ============================================================
router.get('/:id/pipelined/counts', getJobPipelineCounts);
router.get('/:id/pipelined', getJobPipelinedApplicants);

// ============================================================
// ASSIGNMENTS SUB-SECTION
// GET /api/jobs/:id/assignments
// GET /api/jobs/:id/assignments/counts
// ============================================================
router.get('/:id/assignments/counts', getJobAssignmentCounts);
router.get('/:id/assignments', getJobAssignments);

// ============================================================
// TIMESHEETS SUB-SECTION
// GET /api/jobs/:id/timesheets
// GET /api/jobs/:id/timesheets/counts
// GET /api/jobs/:id/timesheets/:timesheetId/entries
// ============================================================
router.get('/:id/timesheets/counts', getJobTimesheetCounts);
router.get('/:id/timesheets/:timesheetId/entries', getTimesheetEntries);
router.get('/:id/timesheets', getJobTimesheets);

// ============================================================
// INTERVIEWS SUB-SECTION
// GET /api/jobs/:id/interviews
// ============================================================
router.get('/:id/interviews', getJobInterviews);

export default router;
