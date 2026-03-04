"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const payrollController_1 = require("./../../controllers/timesheets/payrollController");
// import { authenticate } from '../../middleware/auth'; // uncomment to protect routes
const router = (0, express_1.Router)();
// ─────────────────────────────────────────────────────────────
// STATS & AGGREGATES
// ─────────────────────────────────────────────────────────────
// GET /api/payroll/stats
// Query: assignmentId?, weekStart?, weekEnd?, payPeriod?, qbSynced?
router.get('/stats', payrollController_1.payrollController.getPayrollStats);
// GET /api/payroll/periods
// Query: assignmentId?, weekStart?, weekEnd?
// Returns one row per pay period with totals
router.get('/periods', payrollController_1.payrollController.getPayrollPeriods);
// GET /api/payroll/periods/:payPeriod   e.g. /periods/2025-W12
// Returns all payrolls + totals for a specific week
router.get('/periods/:payPeriod', payrollController_1.payrollController.getPayrollsByPeriod);
// ─────────────────────────────────────────────────────────────
// BY ASSIGNMENT
// ─────────────────────────────────────────────────────────────
// GET /api/payroll/assignment/:assignmentId
// Returns paginated payrolls + running totals for one assignment
router.get('/assignment/:assignmentId', payrollController_1.payrollController.getPayrollsByAssignment);
// ─────────────────────────────────────────────────────────────
// BULK QB SYNC
// ─────────────────────────────────────────────────────────────
// POST /api/payroll/qb-sync/bulk
// Body: { records: [{ payroll_id, qb_payroll_id }] }
router.post('/qb-sync/bulk', payrollController_1.payrollController.bulkMarkQbSynced);
// ─────────────────────────────────────────────────────────────
// CORE CRUD
// ─────────────────────────────────────────────────────────────
// GET  /api/payroll          — list all (paginated + filtered)
// POST /api/payroll          — manual create
router.get('/', payrollController_1.payrollController.getAllPayrolls);
router.post('/', payrollController_1.payrollController.createPayroll);
// GET   /api/payroll/:payrollId
// PATCH /api/payroll/:payrollId
// DELETE /api/payroll/:payrollId
router.get('/:payrollId', payrollController_1.payrollController.getPayrollById);
router.patch('/:payrollId', payrollController_1.payrollController.updatePayroll);
router.delete('/:payrollId', payrollController_1.payrollController.deletePayroll);
// ─────────────────────────────────────────────────────────────
// ACTIONS
// ─────────────────────────────────────────────────────────────
// POST /api/payroll/:payrollId/qb-sync
// Body: { qb_payroll_id: string }
router.post('/:payrollId/qb-sync', payrollController_1.payrollController.markQbSynced);
// POST /api/payroll/:payrollId/void-and-replace
// Body: same fields as PATCH (corrected values)
router.post('/:payrollId/void-and-replace', payrollController_1.payrollController.voidAndReplacePayroll);
exports.default = router;
//# sourceMappingURL=payrollRoutes.js.map