import { Router } from 'express';
import { transactionBatchController as ctrl } from './../../controllers/updated-payroll/batchTimeEntryController';
import { authenticateToken } from '../../middleware/authMiddleware';
import multer from 'multer';
const upload = multer({ storage: multer.memoryStorage() });



const router = Router();


router.use(authenticateToken);


// ── Employee picker / autofill lookups ─────────────────────────
router.get('/applicants/search', ctrl.searchApplicantsForPayroll);
router.get('/applicants/:applicantId/assignments', ctrl.getApplicantAssignments);
router.get('/assignments/:assignmentId/context', ctrl.getAssignmentContextForTransaction);
router.get('/assignments/:assignmentId/job-rates', ctrl.getJobRatesForAssignment);
router.get('/earning-types', ctrl.getEarningTypes);

// ── Shortcut / navigation buttons ──────────────────────────────
router.get('/shortcuts/applicants/:applicantId', ctrl.getApplicantShortcut);
router.get('/shortcuts/organizations/:organizationId', ctrl.getOrganizationShortcut);
router.get('/shortcuts/jobs/:jobId', ctrl.getJobShortcut);
router.get('/shortcuts/assignments/:assignmentId', ctrl.getAssignmentShortcut);

// ── Batches ─────────────────────────────────────────────────────
router.post('/batches', ctrl.createBatch);
router.get('/batches', ctrl.getAllBatches);
router.get('/batches/:batchId', ctrl.getBatchById);
router.patch('/batches/:batchId', ctrl.updateBatch);
router.delete('/batches/:batchId', ctrl.deleteBatch);
router.post('/batches/:batchId/verify', ctrl.verifyBatch);
router.post('/batches/:batchId/close', ctrl.closeBatch);
router.get('/batches/:batchId/report', ctrl.getBatchReport);

// ── Transactions ────────────────────────────────────────────────
router.get('/assignments/:assignmentId/timesheets', ctrl.getAssignmentTimesheets);
router.post('/batches/:batchId/transactions/import-timesheet', ctrl.importTransactionFromTimesheet);

router.post('/batches/:batchId/transactions', ctrl.createTransaction);
router.get('/transactions/:transactionId', ctrl.getTransactionById);
router.patch('/transactions/:transactionId', ctrl.updateTransaction);
router.delete('/transactions/:transactionId', ctrl.deleteTransaction);

// ── Transaction lines ────────────────────────────────────────────
router.post('/transactions/:transactionId/lines', ctrl.addTransactionLine);
router.patch('/lines/:lineId', ctrl.updateTransactionLine);
router.delete('/lines/:lineId', ctrl.deleteTransactionLine);




router.post('/transactions/:transactionId/override-error', ctrl.overrideTransactionError);
router.post('/transactions/:transactionId/clear-override', ctrl.clearTransactionErrorOverride);
router.get('/batches/:batchId/transactions/import-template', ctrl.downloadTransactionImportTemplate);
router.post('/batches/:batchId/transactions/import', upload.single('file'), ctrl.importTransactionsFromExcel);



export default router;