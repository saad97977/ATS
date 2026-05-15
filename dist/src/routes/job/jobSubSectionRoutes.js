"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const JobSubSectionController_1 = require("../../controllers/job/JobSubSectionController");
const router = (0, express_1.Router)();
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
router.get('/:id/overview', JobSubSectionController_1.getJobOverview);
// ============================================================
// APPLICATIONS SUB-SECTION
// GET /api/jobs/:id/applications
// GET /api/jobs/:id/applications/counts
// ============================================================
router.get('/:id/applications/counts', JobSubSectionController_1.getJobApplicationsCounts);
router.get('/:id/applications', JobSubSectionController_1.getJobApplications);
// ============================================================
// PIPELINE SUB-SECTION
// GET /api/jobs/:id/pipelined
// GET /api/jobs/:id/pipelined/counts
// ============================================================
router.get('/:id/pipelined/counts', JobSubSectionController_1.getJobPipelineCounts);
router.get('/:id/pipelined', JobSubSectionController_1.getJobPipelinedApplicants);
// ============================================================
// ASSIGNMENTS SUB-SECTION
// GET /api/jobs/:id/assignments
// GET /api/jobs/:id/assignments/counts
// ============================================================
router.get('/:id/assignments/counts', JobSubSectionController_1.getJobAssignmentCounts);
router.get('/:id/assignments', JobSubSectionController_1.getJobAssignments);
// ============================================================
// TIMESHEETS SUB-SECTION
// GET /api/jobs/:id/timesheets
// GET /api/jobs/:id/timesheets/counts
// GET /api/jobs/:id/timesheets/:timesheetId/entries
// ============================================================
router.get('/:id/timesheets/counts', JobSubSectionController_1.getJobTimesheetCounts);
router.get('/:id/timesheets/:timesheetId/entries', JobSubSectionController_1.getTimesheetEntries);
router.get('/:id/timesheets', JobSubSectionController_1.getJobTimesheets);
// ============================================================
// INTERVIEWS SUB-SECTION
// GET /api/jobs/:id/interviews
// ============================================================
router.get('/:id/interviews', JobSubSectionController_1.getJobInterviews);
exports.default = router;
//# sourceMappingURL=jobSubSectionRoutes.js.map