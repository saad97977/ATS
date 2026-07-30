"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const payrollUpdateController_1 = require("./../../controllers/updated-payroll/payrollUpdateController");
const authMiddleware_1 = require("../../middleware/authMiddleware");
const router = (0, express_1.Router)();
// All routes require an authenticated user since every controller
// function reads (req as any).user?.user_id for audit trails.
router.use(authMiddleware_1.authenticateToken);
// ════════════════════════════════════════════════════════════════
// BANK ACCOUNTS — front office / employee self-entry
// ════════════════════════════════════════════════════════════════
router.post('/applicants/:applicantId/bank-accounts', payrollUpdateController_1.payrollController.createEmployeeBankAccount);
router.get('/applicants/:applicantId/bank-accounts', payrollUpdateController_1.payrollController.listEmployeeBankAccounts);
router.patch('/bank-accounts/:bankAccountId', payrollUpdateController_1.payrollController.updateEmployeeBankAccount);
// ════════════════════════════════════════════════════════════════
// COMPANY BANK ACCOUNTS — the "Bank" dropdown used by Payroll Batch + ACH
// ════════════════════════════════════════════════════════════════
router.post('/banks', payrollUpdateController_1.payrollController.createCompanyBankAccount);
router.get('/banks', payrollUpdateController_1.payrollController.listCompanyBankAccounts);
// ════════════════════════════════════════════════════════════════
// STEP 2 — PAYROLL BATCH
// ════════════════════════════════════════════════════════════════
router.get('/payroll/run-types', payrollUpdateController_1.payrollController.getRunTypes);
router.post('/payroll-batches', payrollUpdateController_1.payrollController.createPayrollBatch);
router.get('/payroll-batches', payrollUpdateController_1.payrollController.getAllPayrollBatches);
router.get('/payroll-batches/:batchId', payrollUpdateController_1.payrollController.getPayrollBatchById);
// "Select Transaction" screen
router.get('/payroll-batches/:batchId/available-transactions', payrollUpdateController_1.payrollController.getAvailableTransactions);
router.post('/payroll-batches/:batchId/select-transactions', payrollUpdateController_1.payrollController.selectTransactionsForBatch);
router.post('/payroll-batches/:batchId/remove-transaction', payrollUpdateController_1.payrollController.removeTransactionFromBatch); // delete w/ reason
router.post('/payroll-batches/:batchId/save-and-close', payrollUpdateController_1.payrollController.saveAndCloseBatchSelection);
// Process → print checks → post
router.post('/payroll-batches/:batchId/process', payrollUpdateController_1.payrollController.processPayrollBatch);
router.post('/payroll-batches/:batchId/print-checks', payrollUpdateController_1.payrollController.printChecks);
router.post('/payroll-batches/:batchId/post', payrollUpdateController_1.payrollController.postPayrollBatch);
router.post('/payroll-batches/:batchId/void', payrollUpdateController_1.payrollController.voidPayrollBatch);
// ════════════════════════════════════════════════════════════════
// PAYROLL CHECK — pay stub + verify/correction
// ════════════════════════════════════════════════════════════════
router.get('/payroll-checks/:checkId', payrollUpdateController_1.payrollController.getPayrollCheckStub);
router.post('/payroll-checks/:checkId/verify', payrollUpdateController_1.payrollController.verifyPayrollCheck); // "was everything alright with check?"
router.post('/payroll-checks/:checkId/resolve-correction', payrollUpdateController_1.payrollController.resolveCheckCorrection);
// ════════════════════════════════════════════════════════════════
// STEP 4 — WEEKLY PROCESS: ACH
// ════════════════════════════════════════════════════════════════
router.post('/payroll-batches/:batchId/ach', payrollUpdateController_1.payrollController.generateAchFile);
router.get('/ach-files/:achFileId/download', payrollUpdateController_1.payrollController.downloadAchFile);
// ════════════════════════════════════════════════════════════════
// STEP 3 — BILLING BATCH
// ════════════════════════════════════════════════════════════════
router.post('/billing-batches', payrollUpdateController_1.payrollController.createBillingBatch);
router.post('/billing-batches/:batchId/process', payrollUpdateController_1.payrollController.processBillingBatch);
router.get('/billing-batches/:batchId/preview', payrollUpdateController_1.payrollController.getBillingBatchPreview);
router.post('/billing-batches/:batchId/post', payrollUpdateController_1.payrollController.postBillingBatch);
router.post('/billing-batches/:batchId/discard', payrollUpdateController_1.payrollController.discardBillingBatch);
router.get('/billing-batches', payrollUpdateController_1.payrollController.getAllBillingBatches);
router.get('/billing-batches/:batchId', payrollUpdateController_1.payrollController.getBillingBatchById);
router.get('/client-invoices/:invoiceId/download', payrollUpdateController_1.payrollController.downloadClientInvoicePdf);
// ════════════════════════════════════════════════════════════════
// WC CODES — admin lookup table (Module 3 support)
// ════════════════════════════════════════════════════════════════
router.post('/wc-codes', payrollUpdateController_1.payrollController.createWcCode);
router.get('/wc-codes', payrollUpdateController_1.payrollController.listWcCodes);
// Reopen / employer cost reporting
router.post('/payroll-batches/:batchId/reopen', payrollUpdateController_1.payrollController.reopenPayrollBatch);
router.get('/payroll-batches/:batchId/employer-cost-summary', payrollUpdateController_1.payrollController.getEmployerCostSummary);
// Agencies
router.post('/agencies', payrollUpdateController_1.payrollController.createAgency);
router.get('/agencies', payrollUpdateController_1.payrollController.listAgencies);
router.patch('/agencies/:agencyId', payrollUpdateController_1.payrollController.updateAgency);
// Tax configuration (admin)
router.post('/tax-brackets', payrollUpdateController_1.payrollController.createTaxBracket);
router.get('/tax-brackets', payrollUpdateController_1.payrollController.listTaxBrackets);
router.post('/state-tax-rates', payrollUpdateController_1.payrollController.createStateTaxRate);
router.get('/state-tax-rates', payrollUpdateController_1.payrollController.listStateTaxRates);
exports.default = router;
//# sourceMappingURL=payrollUpdateRoutes.js.map