import { Router } from "express";
import {
  // Catalog
  getReportCatalog,

  // Tax Documents (Module 11)
  listW2Employees,
  generateW2PDF,
  printW2Batch,
  list1099Contractors,
  generate1099PDF,
  notifyTaxDocumentAvailable,
  recordTaxDocumentConsent,

  // Payroll Reports (Module 12)
  payrollRegister,
  payrollSummary,
  earningsReport,
  deductionReport,
  taxLiabilityReport,
  achRegister,

  // Billing Reports
  invoiceRegister,
  revenueByCustomer,
  revenueByEmployee,
  revenueByBranch,
  outstandingInvoices,
  customerBillingSummary,

  // Compliance Reports
  acaEligibilityReport,
  workersCompensationReport,
  paidSickLeaveReport,
  employeeHoursReport,
  w2EmployeesReport,
  contractors1099Report,

  // Legacy / Avionté Reports
  newHireReport,
  oshaReport,
  federalEEOReport,
  accruedHoursReport,
  activeAssignmentReport,
  deductionSubmittalReport,
  employeeDeductionContributionReport,
} from "../../controllers/reporting/reportingController";

const router = Router();

/* ===========================================================
   Report Catalog
=========================================================== */

router.get("/catalog", getReportCatalog);

/* ===========================================================
   Module 11 - Tax Documents
=========================================================== */

router.get("/w2/employees", listW2Employees);
router.get("/w2/:applicantId/:taxYear/pdf", generateW2PDF);
router.get("/w2/print-batch", printW2Batch);

router.get("/1099/contractors", list1099Contractors);
router.get("/1099/:applicantId/:taxYear/pdf", generate1099PDF);

router.post("/tax-documents/:applicantId/notify", notifyTaxDocumentAvailable);
router.post("/tax-documents/:applicantId/consent", recordTaxDocumentConsent);

/* ===========================================================
   Module 12 - Payroll Reports
=========================================================== */

router.get("/payroll/register", payrollRegister);
router.get("/payroll/summary", payrollSummary);
router.get("/payroll/earnings", earningsReport);
router.get("/payroll/deductions", deductionReport);
router.get("/payroll/tax-liability", taxLiabilityReport);
router.get("/payroll/ach-register", achRegister);

/* ===========================================================
   Module 12 - Billing Reports
=========================================================== */

router.get("/billing/invoice-register", invoiceRegister);
router.get("/billing/revenue-by-customer", revenueByCustomer);
router.get("/billing/revenue-by-employee", revenueByEmployee);
router.get("/billing/revenue-by-branch", revenueByBranch);
router.get("/billing/outstanding-invoices", outstandingInvoices);
router.get("/billing/customer-summary", customerBillingSummary);

/* ===========================================================
   Module 12 - Compliance Reports
=========================================================== */

router.get("/compliance/aca-eligibility", acaEligibilityReport);
router.get("/compliance/workers-comp", workersCompensationReport);
router.get("/compliance/paid-sick-leave", paidSickLeaveReport);
router.get("/compliance/employee-hours", employeeHoursReport);
router.get("/compliance/w2-employees", w2EmployeesReport);
router.get("/compliance/1099-contractors", contractors1099Report);

/* ===========================================================
   Legacy / Avionté Parity Reports
=========================================================== */

router.get("/legacy/new-hire", newHireReport);
router.get("/legacy/osha", oshaReport);
router.get("/legacy/federal-eeo", federalEEOReport);
router.get("/legacy/accrued-hours", accruedHoursReport);
router.get("/legacy/active-assignment", activeAssignmentReport);
router.get("/legacy/deduction-submittal", deductionSubmittalReport);
router.get(
  "/legacy/employee-deduction-contribution",
  employeeDeductionContributionReport
);

export default router;