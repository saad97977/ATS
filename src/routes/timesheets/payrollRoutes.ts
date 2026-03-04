import { Router } from 'express';
import { payrollController } from './../../controllers/timesheets/payrollController';
// import { authenticate } from '../../middleware/auth'; // uncomment to protect routes

const router = Router();

// ─────────────────────────────────────────────────────────────
// STATS & AGGREGATES
// ─────────────────────────────────────────────────────────────

// GET /api/payroll/stats
// Query: assignmentId?, weekStart?, weekEnd?, payPeriod?, qbSynced?
router.get('/stats', payrollController.getPayrollStats);

// GET /api/payroll/periods
// Query: assignmentId?, weekStart?, weekEnd?
// Returns one row per pay period with totals
router.get('/periods', payrollController.getPayrollPeriods);

// GET /api/payroll/periods/:payPeriod   e.g. /periods/2025-W12
// Returns all payrolls + totals for a specific week
router.get('/periods/:payPeriod', payrollController.getPayrollsByPeriod);

// ─────────────────────────────────────────────────────────────
// BY ASSIGNMENT
// ─────────────────────────────────────────────────────────────

// GET /api/payroll/assignment/:assignmentId
// Returns paginated payrolls + running totals for one assignment
router.get('/assignment/:assignmentId', payrollController.getPayrollsByAssignment);

// ─────────────────────────────────────────────────────────────
// BULK QB SYNC
// ─────────────────────────────────────────────────────────────

// POST /api/payroll/qb-sync/bulk
// Body: { records: [{ payroll_id, qb_payroll_id }] }
router.post('/qb-sync/bulk', payrollController.bulkMarkQbSynced);

// ─────────────────────────────────────────────────────────────
// CORE CRUD
// ─────────────────────────────────────────────────────────────

// GET  /api/payroll          — list all (paginated + filtered)
// POST /api/payroll          — manual create
router.get('/',  payrollController.getAllPayrolls);
router.post('/', payrollController.createPayroll);

// GET   /api/payroll/:payrollId
// PATCH /api/payroll/:payrollId
// DELETE /api/payroll/:payrollId
router.get('/:payrollId',    payrollController.getPayrollById);
router.patch('/:payrollId',  payrollController.updatePayroll);
router.delete('/:payrollId', payrollController.deletePayroll);

// ─────────────────────────────────────────────────────────────
// ACTIONS
// ─────────────────────────────────────────────────────────────

// POST /api/payroll/:payrollId/qb-sync
// Body: { qb_payroll_id: string }
router.post('/:payrollId/qb-sync', payrollController.markQbSynced);

// POST /api/payroll/:payrollId/void-and-replace
// Body: same fields as PATCH (corrected values)
router.post('/:payrollId/void-and-replace', payrollController.voidAndReplacePayroll);

export default router;