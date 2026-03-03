import { Request, Response } from 'express';
export declare const getAllTimesheets: (req: Request, res: Response) => Promise<void>;
export declare const getTimesheetStats: (req: Request, res: Response) => Promise<void>;
export declare const getTimesheetsByAssignment: (req: Request, res: Response) => Promise<void>;
export declare const getTimesheetById: (req: Request, res: Response) => Promise<void>;
/**
 * POST /api/timesheets
 * Create or retrieve the timesheet for a given assignment + week (idempotent).
 * NEW: checks timesheets_enabled on the assignment.
 * NEW: accepts optional rate override fields.
 * Body: {
 *   assignment_id, week_start_date, notes?,
 *   custom_bill_rate?, custom_ot_bill_rate?, custom_pay_rate?, custom_ot_pay_rate?,
 *   custom_markup_percentage?, custom_overtime_rule?, rate_override_reason?
 * }
 */
export declare const createOrGetTimesheet: (req: Request, res: Response) => Promise<void>;
/**
 * PATCH /api/timesheets/:id/rates
 * Update per-timesheet rate overrides on a DRAFT or REJECTED timesheet.
 */
export declare const updateTimesheetRates: (req: Request, res: Response) => Promise<void>;
export declare const upsertTimeEntry: (req: Request, res: Response) => Promise<void>;
export declare const deleteTimeEntry: (req: Request, res: Response) => Promise<void>;
export declare const submitTimesheet: (req: Request, res: Response) => Promise<void>;
/**
 * POST /api/timesheets/:id/approve
 * Now reads custom rate overrides from the timesheet row itself.
 */
export declare const approveTimesheet: (req: Request, res: Response) => Promise<void>;
export declare const rejectTimesheet: (req: Request, res: Response) => Promise<void>;
/**
 * PATCH /api/timesheets/assignments/:assignmentId/toggle
 * Enable or disable timesheet creation for this assignment.
 * Body: { timesheets_enabled: boolean }
 */
export declare const toggleAssignmentTimesheets: (req: Request, res: Response) => Promise<void>;
/**
 * GET /api/timesheets/import/template
 * Returns CSV column headers and example rows as text/csv.
 */
export declare const downloadImportTemplate: (_req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
/**
 * POST /api/timesheets/import
 * Accepts a multipart/form-data upload with field "file" (CSV or XLSX).
 * Additional fields: assignment_id, (optional) custom_bill_rate etc.
 *
 * Parsing strategy:
 *   - CSV: built-in line-by-line parse (no dep needed)
 *   - XLSX: uses the 'xlsx' npm package (install: npm i xlsx)
 *
 * One timesheet is created per unique week_start_date found in the file.
 * Rows with errors are skipped; all valid rows are upserted.
 *
 * Returns a detailed import result summary.
 */
export declare const importTimesheets: (req: Request, res: Response) => Promise<void>;
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
    updateTimesheetRates: (req: Request, res: Response) => Promise<void>;
    upsertTimeEntry: (req: Request, res: Response) => Promise<void>;
    deleteTimeEntry: (req: Request, res: Response) => Promise<void>;
    submitTimesheet: (req: Request, res: Response) => Promise<void>;
    approveTimesheet: (req: Request, res: Response) => Promise<void>;
    rejectTimesheet: (req: Request, res: Response) => Promise<void>;
    toggleAssignmentTimesheets: (req: Request, res: Response) => Promise<void>;
    downloadImportTemplate: (_req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
    importTimesheets: (req: Request, res: Response) => Promise<void>;
    getAllInvoices: (req: Request, res: Response) => Promise<void>;
    getInvoiceById: (req: Request, res: Response) => Promise<void>;
    downloadInvoicePdf: (req: Request, res: Response) => Promise<void>;
    updateInvoiceStatus: (req: Request, res: Response) => Promise<void>;
    getAssignmentsForTimesheets: (req: Request, res: Response) => Promise<void>;
    getTimesheetNotifications: (req: Request, res: Response) => Promise<void>;
    bulkUpsertTimeEntries: (req: Request, res: Response) => Promise<void>;
};
//# sourceMappingURL=timesheetController.d.ts.map