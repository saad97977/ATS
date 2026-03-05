"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const timesheetController_1 = require("../../controllers/timesheets/timesheetController");
const router = (0, express_1.Router)();
// ─── Multer (for CSV / Excel import) ─────────────────────────────────────────
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
    fileFilter: (_req, file, cb) => {
        if (/\.(csv|xlsx|xls)$/i.test(file.originalname))
            cb(null, true);
        else
            cb(new Error('Only CSV (.csv) and Excel (.xlsx / .xls) files are supported'));
    },
});
// ─────────────────────────────────────────────────────────────────────────────
// IMPORTANT: All fixed-path routes must come BEFORE /:id routes
// to prevent Express matching them as the :id param.
// ─────────────────────────────────────────────────────────────────────────────
// ─── Stats ────────────────────────────────────────────────────────────────────
router.get('/stats', timesheetController_1.getTimesheetStats);
// ─── Invoices ─────────────────────────────────────────────────────────────────
router.get('/invoices', timesheetController_1.getAllInvoices);
router.get('/invoices/:invoiceId', timesheetController_1.getInvoiceById);
router.get('/invoices/:invoiceId/download', timesheetController_1.downloadInvoicePdf);
router.patch('/invoices/:invoiceId/status', timesheetController_1.updateInvoiceStatus);
// QuickBooks — Invoice sync
// POST /api/timesheets/invoices/qb-sync/bulk
// Pushes all unsynced invoices to QB in one call
// Optional body: { invoice_ids: string[] } to limit scope
router.post('/invoices/qb-sync/bulk', timesheetController_1.bulkSyncInvoicesToQB);
// POST /api/timesheets/invoices/:invoiceId/qb-sync
// Pushes a single invoice to QB and marks qb_synced=true
router.post('/invoices/:invoiceId/qb-sync', timesheetController_1.syncInvoiceToQB);
// ─── Assignments ──────────────────────────────────────────────────────────────
// Dropdown list with current-week timesheet status
router.get('/assignments', timesheetController_1.getAssignmentsForTimesheets);
// Enable / disable timesheet creation for a specific assignment
// Body: { timesheets_enabled: boolean }
router.patch('/assignments/:assignmentId/toggle', timesheetController_1.toggleAssignmentTimesheets);
// ─── Notifications ────────────────────────────────────────────────────────────
router.get('/notifications', timesheetController_1.getTimesheetNotifications);
// ─── Import ───────────────────────────────────────────────────────────────────
// Download the CSV import template
router.get('/import/template', timesheetController_1.downloadImportTemplate);
// Upload CSV or Excel file to bulk-create timesheets
// Form field name: "file"  |  Body fields: assignment_id, custom_bill_rate?, etc.
router.post('/import', upload.single('file'), timesheetController_1.importTimesheets);
// ─── Bulk entry save ──────────────────────────────────────────────────────────
// Save all 7 days in one call (used by the wizard)
router.post('/:id/entries/bulk', timesheetController_1.bulkUpsertTimeEntries);
// ─── Timesheet CRUD ───────────────────────────────────────────────────────────
// All timesheets (filters: ?assignmentId=  ?status=  ?weekStart=  ?search=  ?page=  ?limit=)
router.get('/', timesheetController_1.getAllTimesheets);
// All timesheets for one assignment
router.get('/assignment/:assignmentId', timesheetController_1.getTimesheetsByAssignment);
// Single timesheet — full detail + entries + invoice + payroll
router.get('/:id', timesheetController_1.getTimesheetById);
// Create or retrieve the week's timesheet (idempotent)
// Body: { assignment_id, week_start_date, notes?, custom_bill_rate?, ... }
router.post('/', timesheetController_1.createOrGetTimesheet);
// Update per-timesheet rate overrides (DRAFT / REJECTED only)
router.patch('/:id/rates', timesheetController_1.updateTimesheetRates);
// ─── Daily time entry CRUD ────────────────────────────────────────────────────
// Upsert a daily entry
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
// SUBMITTED / UNDER_REVIEW  →  REJECTED
// Body: { reviewed_by_user_id, rejection_reason }
router.post('/:id/reject', timesheetController_1.rejectTimesheet);
// ─── QuickBooks — Timesheet sync ─────────────────────────────────────────────
// POST /api/timesheets/:id/qb-sync
// Pushes all time entries as QB TimeActivities — only works on APPROVED timesheets
router.post('/:id/qb-sync', timesheetController_1.syncTimesheetToQB);
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
//# sourceMappingURL=timesheetRoutes.js.map