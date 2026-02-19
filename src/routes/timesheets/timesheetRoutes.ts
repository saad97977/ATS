/**
 * timesheets.routes.ts
 *
 * Mount in app.ts:
 *   import timesheetRoutes from './routes/timesheets.routes';
 *   app.use('/api/timesheets', timesheetRoutes);
 */

import { Router } from 'express';
import {
  getAllTimesheets,
  getTimesheetById,
  getTimesheetsByAssignment,
  getTimesheetStats,
  createOrGetTimesheet,
  upsertTimeEntry,
  deleteTimeEntry,
  submitTimesheet,
  approveTimesheet,
  rejectTimesheet,
  getAllInvoices,
  getInvoiceById,
  downloadInvoicePdf,
  updateInvoiceStatus,
  getAssignmentsForTimesheets,
  getTimesheetNotifications,
  bulkUpsertTimeEntries,

  // syncInvoiceToQuickBooks, // ← uncomment when QB is ready
} from '../../controllers/timesheets/timesheetController';

const router = Router();

// ─── Stats & invoices must come before /:id ──────────────────────────────────
// (otherwise Express will match them as the :id param)

router.get('/stats', getTimesheetStats);

router.get('/invoices',                     getAllInvoices);
router.get('/invoices/:invoiceId',          getInvoiceById);
router.get('/invoices/:invoiceId/download', downloadInvoicePdf);
router.patch('/invoices/:invoiceId/status', updateInvoiceStatus);

// ── QB sync route — uncomment when QB credentials are configured ──────────────
// router.post('/invoices/:invoiceId/sync-qb', syncInvoiceToQuickBooks);
// ─────────────────────────────────────────────────────────────────────────────

// Assignments dropdown (for non-technical users)
router.get('/assignments',    getAssignmentsForTimesheets);

// Weekly notification bell data
router.get('/notifications',  getTimesheetNotifications);

// Bulk save all 7 days in one call
router.post('/:id/entries/bulk', bulkUpsertTimeEntries);



// ─── Timesheet CRUD ───────────────────────────────────────────────────────────

// All timesheets (filters: ?assignmentId=  ?status=  ?weekStart=  ?page=  ?limit=)
router.get('/', getAllTimesheets);

// All timesheets for one assignment
router.get('/assignment/:assignmentId', getTimesheetsByAssignment);

// Single timesheet — full detail + entries + invoice + payroll
router.get('/:id', getTimesheetById);

// Create or retrieve the week's timesheet (idempotent)
// Body: { assignment_id, week_start_date, notes? }
router.post('/', createOrGetTimesheet);

// ─── Daily time entry CRUD ────────────────────────────────────────────────────

// Upsert a daily entry (add or overwrite the same work_date)
// Body: { work_date, regular_hours, ot_hours?, break_minutes?, work_type?, notes? }
router.post('/:id/entries', upsertTimeEntry);

// Delete a daily entry
router.delete('/:id/entries/:entryId', deleteTimeEntry);

// ─── Workflow transitions ─────────────────────────────────────────────────────

// DRAFT / REJECTED  →  SUBMITTED
router.post('/:id/submit', submitTimesheet);

// SUBMITTED / UNDER_REVIEW  →  APPROVED  (auto-creates Invoice + Payroll + PDF)
// Body: { reviewed_by_user_id, tax_rate?, net_terms_days? }
router.post('/:id/approve', approveTimesheet);

// SUBMITTED / UNDER_REVIEW  →  REJECTED  (returns to editable DRAFT)
// Body: { reviewed_by_user_id, rejection_reason }
router.post('/:id/reject', rejectTimesheet);

export default router;

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