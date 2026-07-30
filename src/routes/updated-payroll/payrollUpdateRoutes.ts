import { Router } from 'express';
import {  payrollController } from './../../controllers/updated-payroll/payrollUpdateController';
import { authenticateToken } from '../../middleware/authMiddleware';



const router = Router();

// All routes require an authenticated user since every controller
// function reads (req as any).user?.user_id for audit trails.
router.use(authenticateToken);

// ════════════════════════════════════════════════════════════════
// BANK ACCOUNTS — front office / employee self-entry
// ════════════════════════════════════════════════════════════════
router.post('/applicants/:applicantId/bank-accounts', payrollController.createEmployeeBankAccount);
router.get('/applicants/:applicantId/bank-accounts', payrollController.listEmployeeBankAccounts);
router.patch('/bank-accounts/:bankAccountId', payrollController.updateEmployeeBankAccount);

// ════════════════════════════════════════════════════════════════
// COMPANY BANK ACCOUNTS — the "Bank" dropdown used by Payroll Batch + ACH
// ════════════════════════════════════════════════════════════════
router.post('/banks', payrollController.createCompanyBankAccount);
router.get('/banks', payrollController.listCompanyBankAccounts);

// ════════════════════════════════════════════════════════════════
// STEP 2 — PAYROLL BATCH
// ════════════════════════════════════════════════════════════════
router.get('/payroll/run-types', payrollController.getRunTypes);

router.post('/payroll-batches', payrollController.createPayrollBatch);
router.get('/payroll-batches', payrollController.getAllPayrollBatches);
router.get('/payroll-batches/:batchId', payrollController.getPayrollBatchById);

// "Select Transaction" screen
router.get('/payroll-batches/:batchId/available-transactions', payrollController.getAvailableTransactions);
router.post('/payroll-batches/:batchId/select-transactions', payrollController.selectTransactionsForBatch);
router.post('/payroll-batches/:batchId/remove-transaction', payrollController.removeTransactionFromBatch); // delete w/ reason
router.post('/payroll-batches/:batchId/save-and-close', payrollController.saveAndCloseBatchSelection);

// Process → print checks → post
router.post('/payroll-batches/:batchId/process', payrollController.processPayrollBatch);
router.post('/payroll-batches/:batchId/print-checks', payrollController.printChecks);
router.post('/payroll-batches/:batchId/post', payrollController.postPayrollBatch);
router.post('/payroll-batches/:batchId/void', payrollController.voidPayrollBatch);

// ════════════════════════════════════════════════════════════════
// PAYROLL CHECK — pay stub + verify/correction
// ════════════════════════════════════════════════════════════════
router.get('/payroll-checks/:checkId', payrollController.getPayrollCheckStub);
router.post('/payroll-checks/:checkId/verify', payrollController.verifyPayrollCheck); // "was everything alright with check?"
router.post('/payroll-checks/:checkId/resolve-correction', payrollController.resolveCheckCorrection);

// ════════════════════════════════════════════════════════════════
// STEP 4 — WEEKLY PROCESS: ACH
// ════════════════════════════════════════════════════════════════
router.post('/payroll-batches/:batchId/ach', payrollController.generateAchFile);
router.get('/ach-files/:achFileId/download', payrollController.downloadAchFile);

// ════════════════════════════════════════════════════════════════
// STEP 3 — BILLING BATCH
// ════════════════════════════════════════════════════════════════
router.post('/billing-batches', payrollController.createBillingBatch);
router.post('/billing-batches/:batchId/process', payrollController.processBillingBatch);
router.get('/billing-batches/:batchId/preview', payrollController.getBillingBatchPreview);
router.post('/billing-batches/:batchId/post', payrollController.postBillingBatch);
router.post('/billing-batches/:batchId/discard', payrollController.discardBillingBatch);
router.get('/billing-batches', payrollController.getAllBillingBatches);
router.get('/billing-batches/:batchId', payrollController.getBillingBatchById);
router.get('/client-invoices/:invoiceId/download', payrollController.downloadClientInvoicePdf);

// ════════════════════════════════════════════════════════════════
// WC CODES — admin lookup table (Module 3 support)
// ════════════════════════════════════════════════════════════════
router.post('/wc-codes', payrollController.createWcCode);
router.get('/wc-codes', payrollController.listWcCodes);


// Reopen / employer cost reporting
router.post('/payroll-batches/:batchId/reopen', payrollController.reopenPayrollBatch);
router.get('/payroll-batches/:batchId/employer-cost-summary', payrollController.getEmployerCostSummary);

// Agencies
router.post('/agencies', payrollController.createAgency);
router.get('/agencies', payrollController.listAgencies);
router.patch('/agencies/:agencyId', payrollController.updateAgency);

// Tax configuration (admin)
router.post('/tax-brackets', payrollController.createTaxBracket);
router.get('/tax-brackets', payrollController.listTaxBrackets);
router.post('/state-tax-rates', payrollController.createStateTaxRate);
router.get('/state-tax-rates', payrollController.listStateTaxRates);

export default router;