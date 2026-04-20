import { Request, Response } from "express";
export declare function getDashboardPreference(req: Request, res: Response): Promise<void>;
export declare function saveDashboardPreference(req: Request, res: Response): Promise<void>;
/**
 * GET /api/dashboard/widget/backOffice/userStats/:userId
 * Query: dateRange (e.g. "30d"), statuses (comma-sep)
 */
export declare function widgetUserStats(req: Request, res: Response): Promise<void>;
/**
 * GET /api/dashboard/widget/backOffice/orgStats/:userId
 * Query: dateRange, statuses
 */
export declare function widgetOrgStats(req: Request, res: Response): Promise<void>;
/**
 * GET /api/dashboard/widget/backOffice/timesheets/:userId
 * Query: dateRange, statuses, limit
 */
export declare function widgetTimesheets(req: Request, res: Response): Promise<void>;
/**
 * GET /api/dashboard/widget/backOffice/invoiceStats/:userId
 * Query: dateRange, statuses, limit
 */
export declare function widgetInvoiceStats(req: Request, res: Response): Promise<void>;
/**
 * GET /api/dashboard/widget/backOffice/contracts/:userId
 * Query: dateRange, statuses, limit
 */
export declare function widgetContracts(req: Request, res: Response): Promise<void>;
/**
 * GET /api/dashboard/widget/backOffice/myTasks/:userId
 * Query: statuses, dateRange, limit
 */
export declare function widgetMyTasksGrouped(req: Request, res: Response): Promise<void>;
/**
 * GET /api/dashboard/widget/frontOffice/jobStats/:userId
 * Query: dateRange, statuses, limit
 */
export declare function widgetJobStats(req: Request, res: Response): Promise<void>;
/**
 * GET /api/dashboard/widget/frontOffice/applications/:userId
 * Query: dateRange, statuses, limit
 */
export declare function widgetApplications(req: Request, res: Response): Promise<void>;
/**
 * GET /api/dashboard/widget/frontOffice/pipeline/:userId
 * Returns stage-grouped pipeline data for Kanban view
 * Query: jobId (optional), dateRange, limit
 */
export declare function widgetPipeline(req: Request, res: Response): Promise<void>;
/**
 * GET /api/dashboard/widget/frontOffice/candidates/:userId
 * Query: dateRange, statuses, limit
 */
export declare function widgetCandidates(req: Request, res: Response): Promise<void>;
/**
 * GET /api/dashboard/widget/frontOffice/interviews/:userId
 * Query: dateRange, statuses, limit
 */
export declare function widgetInterviews(req: Request, res: Response): Promise<void>;
/**
 * GET /api/dashboard/widget/frontOffice/myTasks/:userId
 * Query: statuses, limit
 */
export declare function widgetMyTasks(req: Request, res: Response): Promise<void>;
/**
 * GET /api/dashboard/widget/clientOffice/myOrgs/:userId
 */
export declare function widgetMyOrgs(req: Request, res: Response): Promise<void>;
/**
 * GET /api/dashboard/widget/clientOffice/jobStats/:userId
 * Query: dateRange, statuses, limit
 */
export declare function widgetClientJobStats(req: Request, res: Response): Promise<void>;
/**
 * GET /api/dashboard/widget/clientOffice/applicationFunnel/:userId
 * Query: dateRange, jobId
 */
export declare function widgetApplicationFunnel(req: Request, res: Response): Promise<void>;
/**
 * GET /api/dashboard/widget/clientOffice/invoices/:userId
 * Query: dateRange, statuses, limit
 */
export declare function widgetClientInvoices(req: Request, res: Response): Promise<void>;
/**
 * GET /api/dashboard/widget/clientOffice/timesheets/:userId
 * Query: dateRange, statuses, limit
 */
export declare function widgetClientTimesheets(req: Request, res: Response): Promise<void>;
/**
 * GET /api/dashboard/widget/clientOffice/placements/:userId
 * Query: dateRange, limit
 */
export declare function widgetClientPlacements(req: Request, res: Response): Promise<void>;
/**
 * GET /api/dashboard/widget/clientOffice/myTasks/:userId
 * Query: statuses, limit
 */
export declare function widgetClientMyTasks(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=dashboardController.d.ts.map