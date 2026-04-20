// dashboard.routes.ts
import { Router } from "express";
import { authenticateToken } from "../../middleware/authMiddleware";

import {
  // Preferences
  getDashboardPreference,
  saveDashboardPreference,

  // Back Office
  widgetUserStats,
  widgetOrgStats,
  widgetTimesheets,
  widgetInvoiceStats,
  widgetContracts,
  widgetMyTasksGrouped,

  // Front Office
  widgetJobStats,
  widgetApplications,
  widgetPipeline,
  widgetCandidates,
  widgetInterviews,
  widgetMyTasks,

  // Client Office
  widgetMyOrgs,
  widgetClientJobStats,
  widgetApplicationFunnel,
  widgetClientInvoices,
  widgetClientTimesheets,
  widgetClientPlacements,
  widgetClientMyTasks,
} from "../../controllers/dashboard/dashboardController";

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// All dashboard routes require authentication
// ─────────────────────────────────────────────────────────────────────────────
router.use(authenticateToken);

// ─────────────────────────────────────────────────────────────────────────────
// PREFERENCES
// ─────────────────────────────────────────────────────────────────────────────
router.get("/preferences/:userId", getDashboardPreference);
router.post("/preferences/:userId", saveDashboardPreference);

// ─────────────────────────────────────────────────────────────────────────────
// BACK OFFICE WIDGETS
// Base: /api/dashboard/widget/backOffice
//
// All support query params:
//   ?dateRange=7d|30d|90d|365d|all
//   ?statuses=ACTIVE,INACTIVE         (comma-separated)
//   ?limit=10
// ─────────────────────────────────────────────────────────────────────────────
router.get("/widget/backOffice/userStats/:userId",    widgetUserStats);
router.get("/widget/backOffice/orgStats/:userId",     widgetOrgStats);
router.get("/widget/backOffice/timesheets/:userId",   widgetTimesheets);
router.get("/widget/backOffice/invoiceStats/:userId", widgetInvoiceStats);
router.get("/widget/backOffice/contracts/:userId",    widgetContracts);
router.get("/widget/backOffice/myTasks/:userId",      widgetMyTasksGrouped);

// ─────────────────────────────────────────────────────────────────────────────
// FRONT OFFICE WIDGETS
// Base: /api/dashboard/widget/frontOffice
//
// All support query params:
//   ?dateRange=7d|30d|90d|365d|all
//   ?statuses=OPEN,ON_HOLD             (comma-separated)
//   ?limit=10
// pipeline also supports:
//   ?jobId=<job_id>                   (filter by specific job)
// ─────────────────────────────────────────────────────────────────────────────
router.get("/widget/frontOffice/jobStats/:userId",     widgetJobStats);
router.get("/widget/frontOffice/applications/:userId", widgetApplications);
router.get("/widget/frontOffice/pipeline/:userId",     widgetPipeline);
router.get("/widget/frontOffice/candidates/:userId",   widgetCandidates);
router.get("/widget/frontOffice/interviews/:userId",   widgetInterviews);
router.get("/widget/frontOffice/myTasks/:userId",      widgetMyTasks);

// ─────────────────────────────────────────────────────────────────────────────
// CLIENT OFFICE WIDGETS
// Base: /api/dashboard/widget/clientOffice
//
// All support query params:
//   ?dateRange=7d|30d|90d|365d|all
//   ?statuses=OPEN,SUBMITTED           (comma-separated)
//   ?limit=10
// applicationFunnel also supports:
//   ?jobId=<job_id>                   (filter by specific job)
// ─────────────────────────────────────────────────────────────────────────────
router.get("/widget/clientOffice/myOrgs/:userId",            widgetMyOrgs);
router.get("/widget/clientOffice/jobStats/:userId",          widgetClientJobStats);
router.get("/widget/clientOffice/applicationFunnel/:userId", widgetApplicationFunnel);
router.get("/widget/clientOffice/invoices/:userId",          widgetClientInvoices);
router.get("/widget/clientOffice/timesheets/:userId",        widgetClientTimesheets);
router.get("/widget/clientOffice/placements/:userId",        widgetClientPlacements);
router.get("/widget/clientOffice/myTasks/:userId",           widgetClientMyTasks);

export default router;