/**
 * timesheets.routes.ts
 *
 * Mount in app.ts:
 *   import timesheetRoutes from './routes/timesheets.routes';
 *   app.use('/api/timesheets', timesheetRoutes);
 *
 * Install deps for import endpoint:
 *   npm install multer @types/multer xlsx
 */

import { Router } from 'express';
import multer from 'multer';
import {
  getAllTimesheets,
  getTimesheetById,
  getTimesheetsByAssignment,
  getTimesheetStats,
  createOrGetTimesheet,
  updateTimesheetRates,
  upsertTimeEntry,
  deleteTimeEntry,
  submitTimesheet,
  approveTimesheet,
  rejectTimesheet,
  toggleAssignmentTimesheets,
  downloadImportTemplate,
  importTimesheets,
  getAllInvoices,
  getInvoiceById,
  downloadInvoicePdf,
  updateInvoiceStatus,
  getAssignmentsForTimesheets,
  getTimesheetNotifications,
  bulkUpsertTimeEntries,
  syncTimesheetToQB,
  syncInvoiceToQB,
  bulkSyncInvoicesToQB,
  bulkApproveTimesheetsByJob,
  getTimesheetsByJobGrouped,
} from '../../controllers/timesheets/timesheetController';

const router = Router();

// ─── Multer (for CSV / Excel import) ─────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    if (/\.(csv|xlsx|xls)$/i.test(file.originalname)) cb(null, true);
    else cb(new Error('Only CSV (.csv) and Excel (.xlsx / .xls) files are supported'));
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// IMPORTANT: All fixed-path routes must come BEFORE /:id routes
// to prevent Express matching them as the :id param.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Stats ────────────────────────────────────────────────────────────────────
router.get('/stats', getTimesheetStats);

// ─── Invoices ─────────────────────────────────────────────────────────────────
router.get('/invoices',                          getAllInvoices);
router.get('/invoices/:invoiceId',               getInvoiceById);
router.get('/invoices/:invoiceId/download',      downloadInvoicePdf);
router.patch('/invoices/:invoiceId/status',      updateInvoiceStatus);

// QuickBooks — Invoice sync
// POST /api/timesheets/invoices/qb-sync/bulk
// Pushes all unsynced invoices to QB in one call
// Optional body: { invoice_ids: string[] } to limit scope
router.post('/invoices/qb-sync/bulk',            bulkSyncInvoicesToQB);

// POST /api/timesheets/invoices/:invoiceId/qb-sync
// Pushes a single invoice to QB and marks qb_synced=true
router.post('/invoices/:invoiceId/qb-sync',      syncInvoiceToQB);

// ─── Assignments ──────────────────────────────────────────────────────────────
// Dropdown list with current-week timesheet status
router.get('/assignments', getAssignmentsForTimesheets);

// Enable / disable timesheet creation for a specific assignment
// Body: { timesheets_enabled: boolean }
router.patch('/assignments/:assignmentId/toggle', toggleAssignmentTimesheets);

// ─── Notifications ────────────────────────────────────────────────────────────
router.get('/notifications', getTimesheetNotifications);

// ─── Import ───────────────────────────────────────────────────────────────────
// Download the CSV import template
router.get('/import/template', downloadImportTemplate);

// Upload CSV or Excel file to bulk-create timesheets
// Form field name: "file"  |  Body fields: assignment_id, custom_bill_rate?, etc.
router.post('/import', upload.single('file'), importTimesheets);

// ─── Bulk entry save ──────────────────────────────────────────────────────────
// Save all 7 days in one call (used by the wizard)
router.post('/:id/entries/bulk', bulkUpsertTimeEntries);

// ─── Timesheet CRUD ───────────────────────────────────────────────────────────

// All timesheets (filters: ?assignmentId=  ?status=  ?weekStart=  ?search=  ?page=  ?limit=)
router.get('/', getAllTimesheets);

// All timesheets for one assignment
router.get('/assignment/:assignmentId', getTimesheetsByAssignment);

// Single timesheet — full detail + entries + invoice + payroll
router.get('/:id', getTimesheetById);

// Create or retrieve the week's timesheet (idempotent)
// Body: { assignment_id, week_start_date, notes?, custom_bill_rate?, ... }
router.post('/', createOrGetTimesheet);

// Update per-timesheet rate overrides (DRAFT / REJECTED only)
router.patch('/:id/rates', updateTimesheetRates);

// ─── Daily time entry CRUD ────────────────────────────────────────────────────

// Upsert a daily entry
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


router.post('/jobs/:jobId/approve-all', bulkApproveTimesheetsByJob);

router.get('/jobs/:jobId/grouped', getTimesheetsByJobGrouped);


// SUBMITTED / UNDER_REVIEW  →  REJECTED
// Body: { reviewed_by_user_id, rejection_reason }
router.post('/:id/reject', rejectTimesheet);

// ─── QuickBooks — Timesheet sync ─────────────────────────────────────────────

// POST /api/timesheets/:id/qb-sync
// Pushes all time entries as QB TimeActivities — only works on APPROVED timesheets
router.post('/:id/qb-sync', syncTimesheetToQB);


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
  PATCH  /api/timesheets/:id/rates                update custom rate overrides
  POST   /api/timesheets/:id/entries              upsert daily entry
  POST   /api/timesheets/:id/entries/bulk         upsert all 7 days at once
  DELETE /api/timesheets/:id/entries/:entryId     delete daily entry
  POST   /api/timesheets/:id/submit               DRAFT → SUBMITTED
  POST   /api/timesheets/:id/approve              SUBMITTED → APPROVED
  POST   /api/timesheets/:id/reject               SUBMITTED → REJECTED

QUICKBOOKS — Timesheets
  POST   /api/timesheets/:id/qb-sync              push time entries → QB TimeActivities

ASSIGNMENTS
  GET    /api/timesheets/assignments              dropdown list + current-week status
  PATCH  /api/timesheets/assignments/:id/toggle   enable/disable timesheets

IMPORT
  GET    /api/timesheets/import/template          download CSV template
  POST   /api/timesheets/import                   upload CSV or Excel file

INVOICES
  GET    /api/timesheets/invoices                 list (paginated + filtered)
  GET    /api/timesheets/invoices/:id             full detail
  GET    /api/timesheets/invoices/:id/download    PDF download
  PATCH  /api/timesheets/invoices/:id/status      mark SENT/VIEWED/PAID/OVERDUE/VOID

QUICKBOOKS — Invoices
  POST   /api/timesheets/invoices/qb-sync/bulk    push all unsynced invoices → QB
  POST   /api/timesheets/invoices/:id/qb-sync     push single invoice → QB
══════════════════════════════════════════════════════════════
*/