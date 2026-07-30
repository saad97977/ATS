"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const batchTimeEntryController_1 = require("./../../controllers/updated-payroll/batchTimeEntryController");
const authMiddleware_1 = require("../../middleware/authMiddleware");
const multer_1 = __importDefault(require("multer"));
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage() });
const router = (0, express_1.Router)();
router.use(authMiddleware_1.authenticateToken);
// ── Employee picker / autofill lookups ─────────────────────────
router.get('/applicants/search', batchTimeEntryController_1.transactionBatchController.searchApplicantsForPayroll);
router.get('/applicants/:applicantId/assignments', batchTimeEntryController_1.transactionBatchController.getApplicantAssignments);
router.get('/assignments/:assignmentId/context', batchTimeEntryController_1.transactionBatchController.getAssignmentContextForTransaction);
router.get('/assignments/:assignmentId/job-rates', batchTimeEntryController_1.transactionBatchController.getJobRatesForAssignment);
router.get('/earning-types', batchTimeEntryController_1.transactionBatchController.getEarningTypes);
// ── Shortcut / navigation buttons ──────────────────────────────
router.get('/shortcuts/applicants/:applicantId', batchTimeEntryController_1.transactionBatchController.getApplicantShortcut);
router.get('/shortcuts/organizations/:organizationId', batchTimeEntryController_1.transactionBatchController.getOrganizationShortcut);
router.get('/shortcuts/jobs/:jobId', batchTimeEntryController_1.transactionBatchController.getJobShortcut);
router.get('/shortcuts/assignments/:assignmentId', batchTimeEntryController_1.transactionBatchController.getAssignmentShortcut);
// ── Batches ─────────────────────────────────────────────────────
router.post('/batches', batchTimeEntryController_1.transactionBatchController.createBatch);
router.get('/batches', batchTimeEntryController_1.transactionBatchController.getAllBatches);
router.get('/batches/:batchId', batchTimeEntryController_1.transactionBatchController.getBatchById);
router.patch('/batches/:batchId', batchTimeEntryController_1.transactionBatchController.updateBatch);
router.delete('/batches/:batchId', batchTimeEntryController_1.transactionBatchController.deleteBatch);
router.post('/batches/:batchId/verify', batchTimeEntryController_1.transactionBatchController.verifyBatch);
router.post('/batches/:batchId/close', batchTimeEntryController_1.transactionBatchController.closeBatch);
router.get('/batches/:batchId/report', batchTimeEntryController_1.transactionBatchController.getBatchReport);
// ── Transactions ────────────────────────────────────────────────
router.get('/assignments/:assignmentId/timesheets', batchTimeEntryController_1.transactionBatchController.getAssignmentTimesheets);
router.post('/batches/:batchId/transactions/import-timesheet', batchTimeEntryController_1.transactionBatchController.importTransactionFromTimesheet);
router.post('/batches/:batchId/transactions', batchTimeEntryController_1.transactionBatchController.createTransaction);
router.get('/transactions/:transactionId', batchTimeEntryController_1.transactionBatchController.getTransactionById);
router.patch('/transactions/:transactionId', batchTimeEntryController_1.transactionBatchController.updateTransaction);
router.delete('/transactions/:transactionId', batchTimeEntryController_1.transactionBatchController.deleteTransaction);
// ── Transaction lines ────────────────────────────────────────────
router.post('/transactions/:transactionId/lines', batchTimeEntryController_1.transactionBatchController.addTransactionLine);
router.patch('/lines/:lineId', batchTimeEntryController_1.transactionBatchController.updateTransactionLine);
router.delete('/lines/:lineId', batchTimeEntryController_1.transactionBatchController.deleteTransactionLine);
router.post('/transactions/:transactionId/override-error', batchTimeEntryController_1.transactionBatchController.overrideTransactionError);
router.post('/transactions/:transactionId/clear-override', batchTimeEntryController_1.transactionBatchController.clearTransactionErrorOverride);
router.get('/batches/:batchId/transactions/import-template', batchTimeEntryController_1.transactionBatchController.downloadTransactionImportTemplate);
router.post('/batches/:batchId/transactions/import', upload.single('file'), batchTimeEntryController_1.transactionBatchController.importTransactionsFromExcel);
exports.default = router;
//# sourceMappingURL=batchTimeEntryRoutes.js.map