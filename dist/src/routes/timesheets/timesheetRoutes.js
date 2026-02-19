"use strict";
/**
 * timesheets.routes.ts
 *
 * Mount in app.ts:
 *   import timesheetRoutes from './routes/timesheets.routes';
 *   app.use('/api/timesheets', timesheetRoutes);
 */
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const timesheetController_1 = require("../../controllers/timesheets/timesheetController");
const router = (0, express_1.Router)();
// ─── Stats & invoices must come before /:id ──────────────────────────────────
// (otherwise Express will match them as the :id param)
router.get('/stats', timesheetController_1.getTimesheetStats);
router.get('/invoices', timesheetController_1.getAllInvoices);
router.get('/invoices/:invoiceId', timesheetController_1.getInvoiceById);
router.get('/invoices/:invoiceId/download', timesheetController_1.downloadInvoicePdf);
router.patch('/invoices/:invoiceId/status', timesheetController_1.updateInvoiceStatus);
// ── QB sync route — uncomment when QB credentials are configured ──────────────
// router.post('/invoices/:invoiceId/sync-qb', syncInvoiceToQuickBooks);
// ─────────────────────────────────────────────────────────────────────────────
// Assignments dropdown (for non-technical users)
router.get('/assignments', timesheetController_1.getAssignmentsForTimesheets);
// Weekly notification bell data
router.get('/notifications', timesheetController_1.getTimesheetNotifications);
// Bulk save all 7 days in one call
router.post('/:id/entries/bulk', timesheetController_1.bulkUpsertTimeEntries);
// ─── Timesheet CRUD ───────────────────────────────────────────────────────────
// All timesheets (filters: ?assignmentId=  ?status=  ?weekStart=  ?page=  ?limit=)
router.get('/', timesheetController_1.getAllTimesheets);
// All timesheets for one assignment
router.get('/assignment/:assignmentId', timesheetController_1.getTimesheetsByAssignment);
// Single timesheet — full detail + entries + invoice + payroll
router.get('/:id', timesheetController_1.getTimesheetById);
// Create or retrieve the week's timesheet (idempotent)
// Body: { assignment_id, week_start_date, notes? }
router.post('/', timesheetController_1.createOrGetTimesheet);
// ─── Daily time entry CRUD ────────────────────────────────────────────────────
// Upsert a daily entry (add or overwrite the same work_date)
// Body: { work_date, regular_hours, ot_hours?, break_minutes?, work_type?, notes? }
router.post('/:id/entries', timesheetController_1.upsertTimeEntry);
// Delete a daily entry
router.delete('/:id/entries/:entryId', timesheetController_1.deleteTimeEntry);
// ─── Workflow transitions ─────────────────────────────────────────────────────
// DRAFT / REJECTED  →  SUBMITTED
router.post('/:id/submit', timesheetController_1.submitTimesheet);
// SUBMITTED / UNDER_REVIEW  →  APPROVED  (auto-creates Invoice + Payroll + PDF)
// Body: { reviewed_by_user_id, tax_rate?, net_terms_days? }
router.post('/:id/approve', timesheetController_1.approveTimesheet);
// SUBMITTED / UNDER_REVIEW  →  REJECTED  (returns to editable DRAFT)
// Body: { reviewed_by_user_id, rejection_reason }
router.post('/:id/reject', timesheetController_1.rejectTimesheet);
exports.default = router;
/*
══════════════════════════════════════════════════════════════
ENDPOINT MAP
══════════════════════════════════════════════════════════════

TIMESHEETS
  GET    /api/timesheets                          list (paginated + filtered)
  GET    /api/timesheets/stats                    aggregate KPIs
  GET    /api/timesheets/assignment/:id           worker history
  GET    /api/timesheets/:id                      full detail
  POST   /api/timesheets                          create/get week (idempotent)
  POST   /api/timesheets/:id/entries              upsert daily entry
  DELETE /api/timesheets/:id/entries/:entryId     delete daily entry
  POST   /api/timesheets/:id/submit               DRAFT → SUBMITTED
  POST   /api/timesheets/:id/approve              SUBMITTED → APPROVED
  POST   /api/timesheets/:id/reject               SUBMITTED → REJECTED

INVOICES
  GET    /api/timesheets/invoices                 list (paginated + filtered)
  GET    /api/timesheets/invoices/:id             full detail
  GET    /api/timesheets/invoices/:id/download    PDF download
  PATCH  /api/timesheets/invoices/:id/status      mark SENT/VIEWED/PAID/OVERDUE/VOID

QB (disabled — enable when credentials are ready)
  POST   /api/timesheets/invoices/:id/sync-qb     push to QuickBooks
══════════════════════════════════════════════════════════════
*/ 
//# sourceMappingURL=timesheetRoutes.js.map