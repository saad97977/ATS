"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// dashboard.routes.ts
const express_1 = require("express");
const authMiddleware_1 = require("../../middleware/authMiddleware");
const dashboardController_1 = require("../../controllers/dashboard/dashboardController");
const router = (0, express_1.Router)();
// ─────────────────────────────────────────────────────────────────────────────
// All dashboard routes require authentication
// ─────────────────────────────────────────────────────────────────────────────
router.use(authMiddleware_1.authenticateToken);
// ─────────────────────────────────────────────────────────────────────────────
// PREFERENCES
// ─────────────────────────────────────────────────────────────────────────────
router.get("/preferences/:userId", dashboardController_1.getDashboardPreference);
router.post("/preferences/:userId", dashboardController_1.saveDashboardPreference);
// ─────────────────────────────────────────────────────────────────────────────
// BACK OFFICE WIDGETS
// Base: /api/dashboard/widget/backOffice
//
// All support query params:
//   ?dateRange=7d|30d|90d|365d|all
//   ?statuses=ACTIVE,INACTIVE         (comma-separated)
//   ?limit=10
// ─────────────────────────────────────────────────────────────────────────────
router.get("/widget/backOffice/userStats/:userId", dashboardController_1.widgetUserStats);
router.get("/widget/backOffice/orgStats/:userId", dashboardController_1.widgetOrgStats);
router.get("/widget/backOffice/timesheets/:userId", dashboardController_1.widgetTimesheets);
router.get("/widget/backOffice/invoiceStats/:userId", dashboardController_1.widgetInvoiceStats);
router.get("/widget/backOffice/contracts/:userId", dashboardController_1.widgetContracts);
router.get("/widget/backOffice/myTasks/:userId", dashboardController_1.widgetMyTasksGrouped);
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
router.get("/widget/frontOffice/jobStats/:userId", dashboardController_1.widgetJobStats);
router.get("/widget/frontOffice/applications/:userId", dashboardController_1.widgetApplications);
router.get("/widget/frontOffice/pipeline/:userId", dashboardController_1.widgetPipeline);
router.get("/widget/frontOffice/candidates/:userId", dashboardController_1.widgetCandidates);
router.get("/widget/frontOffice/interviews/:userId", dashboardController_1.widgetInterviews);
router.get("/widget/frontOffice/myTasks/:userId", dashboardController_1.widgetMyTasks);
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
router.get("/widget/clientOffice/myOrgs/:userId", dashboardController_1.widgetMyOrgs);
router.get("/widget/clientOffice/jobStats/:userId", dashboardController_1.widgetClientJobStats);
router.get("/widget/clientOffice/applicationFunnel/:userId", dashboardController_1.widgetApplicationFunnel);
router.get("/widget/clientOffice/invoices/:userId", dashboardController_1.widgetClientInvoices);
router.get("/widget/clientOffice/timesheets/:userId", dashboardController_1.widgetClientTimesheets);
router.get("/widget/clientOffice/placements/:userId", dashboardController_1.widgetClientPlacements);
router.get("/widget/clientOffice/myTasks/:userId", dashboardController_1.widgetClientMyTasks);
exports.default = router;
//# sourceMappingURL=dashboardRoutes.js.map