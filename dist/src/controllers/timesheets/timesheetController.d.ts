import { Request, Response } from 'express';
/**
 * GET /api/timesheets
 * List timesheets with pagination and optional filters.
 * Query: assignmentId?, status?, weekStart?, search?, page?, limit?
 *
 * Improvements:
 *   - Added `search` param: filters by worker name, job title, or org name
 *   - Fixed filter conflict: AND-merges status + assignmentId + search
 *   - Returns LinearProgress-compatible `refreshing` state via 304
 */
export declare const getAllTimesheets: (req: Request, res: Response) => Promise<void>;
/**
 * GET /api/timesheets/stats
 * Aggregate statistics across timesheets.
 * Query: assignmentId?, status?, weekStart?, weekEnd?
 *
 * Field mapping (matches frontend expectations):
 *   total_billed  ← total_bill_amount sum
 *   total_payroll ← total_pay_amount sum
 */
export declare const getTimesheetStats: (req: Request, res: Response) => Promise<void>;
/**
 * GET /api/timesheets/assignment/:assignmentId
 * All timesheets for a single assignment (worker history).
 */
export declare const getTimesheetsByAssignment: (req: Request, res: Response) => Promise<void>;
/**
 * GET /api/timesheets/:id
 * Full timesheet detail including all daily entries, invoice, payroll.
 */
export declare const getTimesheetById: (req: Request, res: Response) => Promise<void>;
/**
 * POST /api/timesheets
 * Create or retrieve the timesheet for a given assignment + week (idempotent).
 * Body: { assignment_id, week_start_date, notes? }
 */
export declare const createOrGetTimesheet: (req: Request, res: Response) => Promise<void>;
/**
 * POST /api/timesheets/:id/entries
 * Add or update a single daily time entry. Timesheet must be DRAFT or REJECTED.
 */
export declare const upsertTimeEntry: (req: Request, res: Response) => Promise<void>;
/**
 * DELETE /api/timesheets/:id/entries/:entryId
 */
export declare const deleteTimeEntry: (req: Request, res: Response) => Promise<void>;
/**
 * POST /api/timesheets/:id/submit
 */
export declare const submitTimesheet: (req: Request, res: Response) => Promise<void>;
/**
 * POST /api/timesheets/:id/approve
 * Atomically snapshots billing, creates Invoice + Payroll, fires PDF async.
 * Body: { reviewed_by_user_id, tax_rate?, net_terms_days? }
 */
export declare const approveTimesheet: (req: Request, res: Response) => Promise<void>;
/**
 * POST /api/timesheets/:id/reject
 */
export declare const rejectTimesheet: (req: Request, res: Response) => Promise<void>;
export declare const getAllInvoices: (req: Request, res: Response) => Promise<void>;
export declare const getInvoiceById: (req: Request, res: Response) => Promise<void>;
export declare const downloadInvoicePdf: (req: Request, res: Response) => Promise<void>;
export declare const updateInvoiceStatus: (req: Request, res: Response) => Promise<void>;
export declare const getAssignmentsForTimesheets: (req: Request, res: Response) => Promise<void>;
export declare const getTimesheetNotifications: (req: Request, res: Response) => Promise<void>;
export declare const bulkUpsertTimeEntries: (req: Request, res: Response) => Promise<void>;
export declare const timesheetController: {
    getAllTimesheets: (req: Request, res: Response) => Promise<void>;
    getTimesheetById: (req: Request, res: Response) => Promise<void>;
    getTimesheetsByAssignment: (req: Request, res: Response) => Promise<void>;
    getTimesheetStats: (req: Request, res: Response) => Promise<void>;
    createOrGetTimesheet: (req: Request, res: Response) => Promise<void>;
    upsertTimeEntry: (req: Request, res: Response) => Promise<void>;
    deleteTimeEntry: (req: Request, res: Response) => Promise<void>;
    submitTimesheet: (req: Request, res: Response) => Promise<void>;
    approveTimesheet: (req: Request, res: Response) => Promise<void>;
    rejectTimesheet: (req: Request, res: Response) => Promise<void>;
    getAllInvoices: (req: Request, res: Response) => Promise<void>;
    getInvoiceById: (req: Request, res: Response) => Promise<void>;
    downloadInvoicePdf: (req: Request, res: Response) => Promise<void>;
    updateInvoiceStatus: (req: Request, res: Response) => Promise<void>;
    getAssignmentsForTimesheets: (req: Request, res: Response) => Promise<void>;
    getTimesheetNotifications: (req: Request, res: Response) => Promise<void>;
    bulkUpsertTimeEntries: (req: Request, res: Response) => Promise<void>;
};
//# sourceMappingURL=timesheetController.d.ts.map