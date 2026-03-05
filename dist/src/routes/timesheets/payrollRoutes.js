"use strict";
/**
 * payroll.routes.ts
 *
 * Mount in app.ts:
 *   import payrollRoutes from './routes/payroll.routes';
 *   app.use('/api/payroll', payrollRoutes);
 */
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const payrollController_1 = require("./../../controllers/timesheets/payrollController");
// import { authenticate } from '../../middleware/auth'; // uncomment to protect routes
const router = (0, express_1.Router)();
// ─────────────────────────────────────────────────────────────
// QUICKBOOKS — OAuth (must be before /:payrollId to avoid conflicts)
// ─────────────────────────────────────────────────────────────
// GET /api/payroll/quickbooks/connect
// Redirects browser to QuickBooks authorization page
router.get('/quickbooks/connect', payrollController_1.payrollController.qbConnect);
// GET /api/payroll/quickbooks/callback
// QB redirects here after user authorizes — exchanges code for tokens
// This URL must match QB_REDIRECT_URI in your .env exactly
router.get('/quickbooks/callback', payrollController_1.payrollController.qbCallback);
// GET /api/payroll/quickbooks/status
// Returns whether QB is connected, the realmId, and company name
router.get('/quickbooks/status', payrollController_1.payrollController.qbStatus);
// ─────────────────────────────────────────────────────────────
// QUICKBOOKS — Bulk push (fixed path before /:payrollId)
// ─────────────────────────────────────────────────────────────
// POST /api/payroll/qb-push/bulk
// Pushes all qb_synced=false payrolls to QB as Journal Entries
// Optional body: { payroll_ids: string[] } to limit scope
router.post('/qb-push/bulk', payrollController_1.payrollController.bulkPushPayrollsToQB);
// POST /api/payroll/qb-sync/bulk
// Manually mark multiple payrolls as QB-synced (no actual push)
// Body: { records: [{ payroll_id, qb_payroll_id }] }
router.post('/qb-sync/bulk', payrollController_1.payrollController.bulkMarkQbSynced);
// ─────────────────────────────────────────────────────────────
// STATS & AGGREGATES
// ─────────────────────────────────────────────────────────────
// GET /api/payroll/stats
// Query: assignmentId?, weekStart?, weekEnd?, payPeriod?, qbSynced?
router.get('/stats', payrollController_1.payrollController.getPayrollStats);
// GET /api/payroll/periods
// Query: assignmentId?, weekStart?, weekEnd?
router.get('/periods', payrollController_1.payrollController.getPayrollPeriods);
// GET /api/payroll/periods/:payPeriod   e.g. /periods/2025-W12
router.get('/periods/:payPeriod', payrollController_1.payrollController.getPayrollsByPeriod);
// ─────────────────────────────────────────────────────────────
// BY ASSIGNMENT
// ─────────────────────────────────────────────────────────────
// GET /api/payroll/assignment/:assignmentId
router.get('/assignment/:assignmentId', payrollController_1.payrollController.getPayrollsByAssignment);
// ─────────────────────────────────────────────────────────────
// CORE CRUD
// ─────────────────────────────────────────────────────────────
// GET  /api/payroll   — list all (paginated + filtered)
// POST /api/payroll   — manual create
router.get('/', payrollController_1.payrollController.getAllPayrolls);
router.post('/', payrollController_1.payrollController.createPayroll);
// ─────────────────────────────────────────────────────────────
// SINGLE PAYROLL ACTIONS  (/:payrollId must come last)
// ─────────────────────────────────────────────────────────────
// GET   /api/payroll/:payrollId
// PATCH /api/payroll/:payrollId
// DELETE /api/payroll/:payrollId
router.get('/:payrollId', payrollController_1.payrollController.getPayrollById);
router.patch('/:payrollId', payrollController_1.payrollController.updatePayroll);
router.delete('/:payrollId', payrollController_1.payrollController.deletePayroll);
// POST /api/payroll/:payrollId/qb-push
// Pushes this payroll to QB as a Journal Entry and marks qb_synced=true
router.post('/:payrollId/qb-push', payrollController_1.payrollController.pushPayrollToQB);
// POST /api/payroll/:payrollId/qb-sync
// Manually mark as QB-synced without pushing — Body: { qb_payroll_id }
router.post('/:payrollId/qb-sync', payrollController_1.payrollController.markQbSynced);
// POST /api/payroll/:payrollId/void-and-replace
// Corrects a QB-synced payroll by creating a replacement record
// Body: same fields as PATCH (corrected values)
router.post('/:payrollId/void-and-replace', payrollController_1.payrollController.voidAndReplacePayroll);
exports.default = router;
/*
══════════════════════════════════════════════════════════════
ENDPOINT MAP
══════════════════════════════════════════════════════════════

QUICKBOOKS — OAuth
  GET  /api/payroll/quickbooks/connect          redirect to QB authorization page
  GET  /api/payroll/quickbooks/callback         OAuth callback — saves tokens
  GET  /api/payroll/quickbooks/status           connection status + company name

QUICKBOOKS — Sync
  POST /api/payroll/qb-push/bulk                push all unsynced payrolls → QB JournalEntries
  POST /api/payroll/:id/qb-push                 push one payroll → QB JournalEntry
  POST /api/payroll/qb-sync/bulk                manually mark many as synced (no push)
  POST /api/payroll/:id/qb-sync                 manually mark one as synced (no push)

STATS & AGGREGATES
  GET  /api/payroll/stats                       KPIs (hours, gross, net, pending QB)
  GET  /api/payroll/periods                     grouped by pay period
  GET  /api/payroll/periods/:payPeriod          e.g. /periods/2025-W12

BY ASSIGNMENT
  GET  /api/payroll/assignment/:assignmentId    paginated + running totals

CORE CRUD
  GET    /api/payroll                           list (paginated + filtered)
  POST   /api/payroll                           manual create
  GET    /api/payroll/:id                       single record
  PATCH  /api/payroll/:id                       update (blocked if QB-synced)
  DELETE /api/payroll/:id                       delete (blocked if QB-synced)

CORRECTIONS
  POST /api/payroll/:id/void-and-replace        correct a QB-synced payroll
══════════════════════════════════════════════════════════════
*/ 
//# sourceMappingURL=payrollRoutes.js.map