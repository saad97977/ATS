import { Request, Response } from "express";
/**
 * GET /api/reports/w2/employees?taxYear=2025
 * Employee Portal / print-batch source list: every applicant with a posted
 * paycheck in the given tax year, with YTD wage & tax totals.
 */
export declare function listW2Employees(req: Request, res: Response): Promise<void | Response<any, Record<string, any>>>;
/**
 * GET /api/reports/w2/:applicantId/:taxYear/pdf
 * Single-employee W-2 summary PDF (Employee Portal "view/print" action).
 */
export declare function generateW2PDF(req: Request, res: Response): Promise<void>;
/**
 * GET /api/reports/w2/print-batch?taxYear=2025&applicantIds=a,b,c
 * Bulk "Print Option" — one PDF, one page per employee.
 */
export declare function printW2Batch(req: Request, res: Response): Promise<void>;
/**
 * GET /api/reports/1099/contractors?taxYear=2025
 * Contractor Portal source list: 1099 (CONTRACTOR_1099) assignments with
 * posted pay in the given tax year.
 */
export declare function list1099Contractors(req: Request, res: Response): Promise<void | Response<any, Record<string, any>>>;
/** GET /api/reports/1099/:applicantId/:taxYear/pdf */
export declare function generate1099PDF(req: Request, res: Response): Promise<void>;
/**
 * POST /api/reports/tax-documents/:applicantId/notify
 * body: { docType: "W2" | "1099", taxYear }
 * Email Notification + Contractor/Employee Portal "new document" ping.
 */
export declare function notifyTaxDocumentAvailable(req: Request, res: Response): Promise<void>;
/**
 * POST /api/reports/tax-documents/:applicantId/consent
 * body: { docType: "W2" | "1099", consentGiven: boolean }
 *
 * NOTE: the schema has no dedicated consent table/field. Rather than
 * invent one, the consent event is logged on ApplicantCommunication
 * (type NOTE) so it stays fully auditable without a migration. If a
 * first-class consent record becomes a compliance requirement, add a
 * small TaxDocumentConsent model and swap this implementation in.
 */
export declare function recordTaxDocumentConsent(req: Request, res: Response): Promise<void>;
/** GET /api/reports/payroll/register?startDate=&endDate=&branch=&batchId= */
export declare function payrollRegister(req: Request, res: Response): Promise<void | Response<any, Record<string, any>>>;
/** GET /api/reports/payroll/summary?startDate=&endDate= — totals grouped by branch */
export declare function payrollSummary(req: Request, res: Response): Promise<void | Response<any, Record<string, any>>>;
/** GET /api/reports/payroll/earnings?startDate=&endDate= — grouped by earning type */
export declare function earningsReport(req: Request, res: Response): Promise<void | Response<any, Record<string, any>>>;
/** GET /api/reports/payroll/deductions?startDate=&endDate=&branch= */
export declare function deductionReport(req: Request, res: Response): Promise<void | Response<any, Record<string, any>>>;
/** GET /api/reports/payroll/tax-liability?startDate=&endDate= */
export declare function taxLiabilityReport(req: Request, res: Response): Promise<void | Response<any, Record<string, any>>>;
/** GET /api/reports/payroll/ach-register?startDate=&endDate= */
export declare function achRegister(req: Request, res: Response): Promise<void | Response<any, Record<string, any>>>;
/** GET /api/reports/billing/invoice-register?startDate=&endDate=&statuses=&orgId= */
export declare function invoiceRegister(req: Request, res: Response): Promise<void | Response<any, Record<string, any>>>;
/** GET /api/reports/billing/revenue-by-customer?startDate=&endDate= */
export declare function revenueByCustomer(req: Request, res: Response): Promise<void | Response<any, Record<string, any>>>;
/** GET /api/reports/billing/revenue-by-employee?startDate=&endDate= */
export declare function revenueByEmployee(req: Request, res: Response): Promise<void | Response<any, Record<string, any>>>;
/** GET /api/reports/billing/revenue-by-branch?startDate=&endDate= */
export declare function revenueByBranch(req: Request, res: Response): Promise<void | Response<any, Record<string, any>>>;
/** GET /api/reports/billing/outstanding-invoices?orgId= */
export declare function outstandingInvoices(req: Request, res: Response): Promise<void | Response<any, Record<string, any>>>;
/** GET /api/reports/billing/customer-summary */
export declare function customerBillingSummary(req: Request, res: Response): Promise<void | Response<any, Record<string, any>>>;
/**
 * GET /api/reports/compliance/aca-eligibility?measurementDays=365
 * Flags assignments averaging >= 30 hrs/week over the measurement period
 * (standard ACA full-time equivalency threshold).
 */
export declare function acaEligibilityReport(req: Request, res: Response): Promise<void | Response<any, Record<string, any>>>;
/** GET /api/reports/compliance/workers-comp?startDate=&endDate= */
export declare function workersCompensationReport(req: Request, res: Response): Promise<void | Response<any, Record<string, any>>>;
/** GET /api/reports/compliance/paid-sick-leave?startDate=&endDate= */
export declare function paidSickLeaveReport(req: Request, res: Response): Promise<void | Response<any, Record<string, any>>>;
/** GET /api/reports/compliance/employee-hours?startDate=&endDate=&branch= */
export declare function employeeHoursReport(req: Request, res: Response): Promise<void | Response<any, Record<string, any>>>;
/** GET /api/reports/compliance/w2-employees?branch= */
export declare function w2EmployeesReport(req: Request, res: Response): Promise<void | Response<any, Record<string, any>>>;
/** GET /api/reports/compliance/1099-contractors?branch= */
export declare function contractors1099Report(req: Request, res: Response): Promise<void | Response<any, Record<string, any>>>;
/**
 * GET /api/reports/legacy/new-hire
 * Filters: division/branch, client (orgId), startDate, endDate, jobTitle
 * Columns match the supplied "New Hire Report" sample sheet.
 */
export declare function newHireReport(req: Request, res: Response): Promise<void | Response<any, Record<string, any>>>;
/**
 * GET /api/reports/legacy/osha
 *
 * NOTE: the schema has no OSHA/workers'-comp incident or claims table
 * (no injury date, claim type, or "reportable" flag anywhere). Rather than
 * fabricate incident data, this returns the requested shape with zero rows
 * and a clear message. Add an `OSHAIncident` model (division/branch,
 * customer, year, claim_type, reportable, incident description) to make
 * this fully functional — the filter contract below is ready for it.
 */
export declare function oshaReport(req: Request, res: Response): Promise<void | Response<any, Record<string, any>>>;
/**
 * GET /api/reports/legacy/federal-eeo
 * Filters: branch, dateType(applied loosely to assignment start_date), startDate, endDate
 *
 * NOTE: "Veteran Status" is requested in the sample but ApplicantDemographic
 * has no veteran_status field — it is returned as "Not Captured" rather than
 * guessed. Job-category → EEO-1 category mapping is approximate; see
 * EEO_JOB_CATEGORY_MAP above.
 */
export declare function federalEEOReport(req: Request, res: Response): Promise<void | Response<any, Record<string, any>>>;
/**
 * GET /api/reports/legacy/accrued-hours
 * Filters: customer(orgId), employeeName(search), assigned(Y/N), startDate, endDate, branch
 */
export declare function accruedHoursReport(req: Request, res: Response): Promise<void | Response<any, Record<string, any>>>;
/**
 * GET /api/reports/legacy/active-assignment
 * Filters: branch, startDate, endDate, orgId (customer), employeeType (W2/1099)
 */
export declare function activeAssignmentReport(req: Request, res: Response): Promise<void | Response<any, Record<string, any>>>;
/**
 * GET /api/reports/legacy/deduction-submittal
 * Filters: dateType (effectiveDate only — no separate check-date field on
 * BenefitDeduction), startDate, endDate, deductionCategory, groupBy (branch|deduction)
 */
export declare function deductionSubmittalReport(req: Request, res: Response): Promise<void | Response<any, Record<string, any>>>;
/**
 * GET /api/reports/legacy/employee-deduction-contribution
 * Column layout matches the supplied sample sheet 2, unified across
 * BenefitDeduction, Garnishment, and BankAccount (the "AdvanceBank"
 * sample row lines up with the BankAccount model).
 *
 * NOTE: the sample distinguishes "EmployeeID" from "BoldTalentID" as two
 * separate identifiers, and includes an applicant "MiddleName". The
 * current schema only has one HR identifier (`ApplicantDemographic
 * .employee_number`) and no applicant middle name — both are surfaced
 * from the closest available field with the gap called out below.
 */
export declare function employeeDeductionContributionReport(req: Request, res: Response): Promise<void | Response<any, Record<string, any>>>;
/** GET /api/reports/catalog */
export declare function getReportCatalog(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=reportingController.d.ts.map