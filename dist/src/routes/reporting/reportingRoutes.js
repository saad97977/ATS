"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const reportingController_1 = require("../../controllers/reporting/reportingController");
const router = (0, express_1.Router)();
/* ===========================================================
   Report Catalog
=========================================================== */
router.get("/catalog", reportingController_1.getReportCatalog);
/* ===========================================================
   Module 11 - Tax Documents
=========================================================== */
router.get("/w2/employees", reportingController_1.listW2Employees);
router.get("/w2/:applicantId/:taxYear/pdf", reportingController_1.generateW2PDF);
router.get("/w2/print-batch", reportingController_1.printW2Batch);
router.get("/1099/contractors", reportingController_1.list1099Contractors);
router.get("/1099/:applicantId/:taxYear/pdf", reportingController_1.generate1099PDF);
router.post("/tax-documents/:applicantId/notify", reportingController_1.notifyTaxDocumentAvailable);
router.post("/tax-documents/:applicantId/consent", reportingController_1.recordTaxDocumentConsent);
/* ===========================================================
   Module 12 - Payroll Reports
=========================================================== */
router.get("/payroll/register", reportingController_1.payrollRegister);
router.get("/payroll/summary", reportingController_1.payrollSummary);
router.get("/payroll/earnings", reportingController_1.earningsReport);
router.get("/payroll/deductions", reportingController_1.deductionReport);
router.get("/payroll/tax-liability", reportingController_1.taxLiabilityReport);
router.get("/payroll/ach-register", reportingController_1.achRegister);
/* ===========================================================
   Module 12 - Billing Reports
=========================================================== */
router.get("/billing/invoice-register", reportingController_1.invoiceRegister);
router.get("/billing/revenue-by-customer", reportingController_1.revenueByCustomer);
router.get("/billing/revenue-by-employee", reportingController_1.revenueByEmployee);
router.get("/billing/revenue-by-branch", reportingController_1.revenueByBranch);
router.get("/billing/outstanding-invoices", reportingController_1.outstandingInvoices);
router.get("/billing/customer-summary", reportingController_1.customerBillingSummary);
/* ===========================================================
   Module 12 - Compliance Reports
=========================================================== */
router.get("/compliance/aca-eligibility", reportingController_1.acaEligibilityReport);
router.get("/compliance/workers-comp", reportingController_1.workersCompensationReport);
router.get("/compliance/paid-sick-leave", reportingController_1.paidSickLeaveReport);
router.get("/compliance/employee-hours", reportingController_1.employeeHoursReport);
router.get("/compliance/w2-employees", reportingController_1.w2EmployeesReport);
router.get("/compliance/1099-contractors", reportingController_1.contractors1099Report);
/* ===========================================================
   Legacy / Avionté Parity Reports
=========================================================== */
router.get("/legacy/new-hire", reportingController_1.newHireReport);
router.get("/legacy/osha", reportingController_1.oshaReport);
router.get("/legacy/federal-eeo", reportingController_1.federalEEOReport);
router.get("/legacy/accrued-hours", reportingController_1.accruedHoursReport);
router.get("/legacy/active-assignment", reportingController_1.activeAssignmentReport);
router.get("/legacy/deduction-submittal", reportingController_1.deductionSubmittalReport);
router.get("/legacy/employee-deduction-contribution", reportingController_1.employeeDeductionContributionReport);
exports.default = router;
//# sourceMappingURL=reportingRoutes.js.map