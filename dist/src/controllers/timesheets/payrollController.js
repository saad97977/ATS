"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.payrollController = exports.getPayrollsByPeriod = exports.getPayrollPeriods = exports.bulkMarkQbSynced = exports.markQbSynced = exports.deletePayroll = exports.voidAndReplacePayroll = exports.updatePayroll = exports.createPayroll = exports.getPayrollsByAssignment = exports.getPayrollById = exports.getPayrollStats = exports.getAllPayrolls = void 0;
const prisma_config_1 = __importDefault(require("../../prisma.config"));
const response_1 = require("../../utils/response");
const library_1 = require("@prisma/client/runtime/library");
// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────
/** Convert a date to ISO week label, e.g. "2025-W12" */
const getWeekLabel = (date) => {
    const d = new Date(date);
    const jan1 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getUTCDay() + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
};
/** Parse a "2025-W12" label back to the Monday of that ISO week */
const weekLabelToDate = (label) => {
    const m = label.match(/^(\d{4})-W(\d{2})$/);
    if (!m)
        return null;
    const year = parseInt(m[1], 10);
    const week = parseInt(m[2], 10);
    // Jan 4 is always in ISO week 1
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const monday = new Date(jan4);
    monday.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7) + (week - 1) * 7);
    monday.setUTCHours(0, 0, 0, 0);
    return monday;
};
// Full include shape reused across several endpoints
const PAYROLL_INCLUDE = {
    assignment: {
        include: {
            application: {
                include: {
                    applicant: {
                        select: { applicant_id: true, full_name: true },
                    },
                    job: {
                        select: {
                            job_id: true,
                            job_title: true,
                            job_type: true,
                            organization: { select: { organization_id: true, name: true } },
                        },
                    },
                },
            },
        },
    },
    timesheet: {
        select: {
            timesheet_id: true,
            week_start_date: true,
            week_end_date: true,
            status: true,
            total_hours: true,
            bill_rate: true,
            total_bill_amount: true,
        },
    },
};
// ─────────────────────────────────────────────────────────────
// GET ALL PAYROLLS  — paginated, filterable
// GET /api/payroll
//
// Query params:
//   assignmentId   – filter by assignment
//   payPeriod      – exact "2025-W12" match
//   weekStart      – any date → resolves to the Monday of that week
//   weekEnd        – inclusive upper bound (week_start_date of the payroll)
//   search         – worker name, job title, or company (case-insensitive)
//   qbSynced       – "true" | "false"
//   page, limit
// ─────────────────────────────────────────────────────────────
const getAllPayrolls = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
        const skip = (page - 1) * limit;
        const { assignmentId, payPeriod, weekStart, weekEnd, search, qbSynced } = req.query;
        const andClauses = [];
        if (assignmentId)
            andClauses.push({ assignment_id: assignmentId });
        if (payPeriod) {
            andClauses.push({ pay_period: payPeriod });
        }
        else {
            // Date-range filter on the timesheet's week_start_date for user-friendliness
            if (weekStart || weekEnd) {
                const timesheetFilter = {};
                if (weekStart) {
                    const d = new Date(weekStart);
                    d.setUTCHours(0, 0, 0, 0);
                    timesheetFilter.gte = d;
                }
                if (weekEnd) {
                    const d = new Date(weekEnd);
                    d.setUTCHours(23, 59, 59, 999);
                    timesheetFilter.lte = d;
                }
                andClauses.push({ timesheet: { week_start_date: timesheetFilter } });
            }
        }
        if (qbSynced !== undefined) {
            andClauses.push({ qb_synced: qbSynced === 'true' });
        }
        if (search) {
            const term = search.trim();
            andClauses.push({
                OR: [
                    { assignment: { application: { applicant: { full_name: { contains: term, mode: 'insensitive' } } } } },
                    { assignment: { application: { job: { job_title: { contains: term, mode: 'insensitive' } } } } },
                    { assignment: { application: { job: { organization: { name: { contains: term, mode: 'insensitive' } } } } } },
                ],
            });
        }
        const where = andClauses.length > 0 ? { AND: andClauses } : {};
        const [payrolls, total] = await Promise.all([
            prisma_config_1.default.payroll.findMany({
                where,
                skip,
                take: limit,
                orderBy: { processed_at: 'desc' },
                include: PAYROLL_INCLUDE,
            }),
            prisma_config_1.default.payroll.count({ where }),
        ]);
        return (0, response_1.sendSuccess)(res, {
            data: payrolls,
            paging: { total, page, limit, totalPages: Math.ceil(total / limit) },
        });
    }
    catch (err) {
        console.error('getAllPayrolls:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch payrolls', 500);
    }
};
exports.getAllPayrolls = getAllPayrolls;
// ─────────────────────────────────────────────────────────────
// GET PAYROLL STATS
// GET /api/payroll/stats
//
// Query params (all optional):
//   assignmentId, weekStart, weekEnd, payPeriod, qbSynced
// ─────────────────────────────────────────────────────────────
const getPayrollStats = async (req, res) => {
    try {
        const { assignmentId, weekStart, weekEnd, payPeriod, qbSynced } = req.query;
        const andClauses = [];
        if (assignmentId)
            andClauses.push({ assignment_id: assignmentId });
        if (payPeriod)
            andClauses.push({ pay_period: payPeriod });
        if (weekStart || weekEnd) {
            const tsFilter = {};
            if (weekStart) {
                const d = new Date(weekStart);
                d.setUTCHours(0, 0, 0, 0);
                tsFilter.gte = d;
            }
            if (weekEnd) {
                const d = new Date(weekEnd);
                d.setUTCHours(23, 59, 59, 999);
                tsFilter.lte = d;
            }
            andClauses.push({ timesheet: { week_start_date: tsFilter } });
        }
        if (qbSynced !== undefined)
            andClauses.push({ qb_synced: qbSynced === 'true' });
        const where = andClauses.length > 0 ? { AND: andClauses } : {};
        const [totals, qbPending] = await Promise.all([
            prisma_config_1.default.payroll.aggregate({
                where,
                _count: { payroll_id: true },
                _sum: {
                    regular_hours: true,
                    ot_hours: true,
                    gross_pay: true,
                    net_pay: true,
                },
                _avg: {
                    gross_pay: true,
                },
            }),
            prisma_config_1.default.payroll.count({ where: { ...where, qb_synced: false } }),
        ]);
        const totalGross = Number(totals._sum.gross_pay ?? 0);
        const totalNet = Number(totals._sum.net_pay ?? 0);
        const totalReg = Number(totals._sum.regular_hours ?? 0);
        const totalOt = Number(totals._sum.ot_hours ?? 0);
        return (0, response_1.sendSuccess)(res, {
            total_payrolls: totals._count.payroll_id,
            total_regular_hours: totalReg,
            total_ot_hours: totalOt,
            total_hours: totalReg + totalOt,
            total_gross_pay: totalGross,
            total_net_pay: totalNet,
            avg_gross_pay: Number(totals._avg.gross_pay ?? 0),
            qb_pending_sync: qbPending,
        });
    }
    catch (err) {
        console.error('getPayrollStats:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch payroll stats', 500);
    }
};
exports.getPayrollStats = getPayrollStats;
// ─────────────────────────────────────────────────────────────
// GET SINGLE PAYROLL
// GET /api/payroll/:payrollId
// ─────────────────────────────────────────────────────────────
const getPayrollById = async (req, res) => {
    try {
        const { payrollId } = req.params;
        const payroll = await prisma_config_1.default.payroll.findUnique({
            where: { payroll_id: payrollId },
            include: {
                ...PAYROLL_INCLUDE,
                timesheet: {
                    include: {
                        time_entries: { orderBy: { work_date: 'asc' } },
                    },
                },
            },
        });
        if (!payroll)
            return (0, response_1.sendError)(res, 'Payroll record not found', 404);
        return (0, response_1.sendSuccess)(res, payroll);
    }
    catch (err) {
        console.error('getPayrollById:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch payroll record', 500);
    }
};
exports.getPayrollById = getPayrollById;
// ─────────────────────────────────────────────────────────────
// GET PAYROLLS BY ASSIGNMENT
// GET /api/payroll/assignment/:assignmentId
// ─────────────────────────────────────────────────────────────
const getPayrollsByAssignment = async (req, res) => {
    try {
        const { assignmentId } = req.params;
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
        const skip = (page - 1) * limit;
        const assignment = await prisma_config_1.default.assignment.findUnique({ where: { assignment_id: assignmentId } });
        if (!assignment)
            return (0, response_1.sendError)(res, 'Assignment not found', 404);
        const [payrolls, total] = await Promise.all([
            prisma_config_1.default.payroll.findMany({
                where: { assignment_id: assignmentId },
                skip,
                take: limit,
                orderBy: { processed_at: 'desc' },
                include: PAYROLL_INCLUDE,
            }),
            prisma_config_1.default.payroll.count({ where: { assignment_id: assignmentId } }),
        ]);
        // Running totals for this assignment
        const summary = await prisma_config_1.default.payroll.aggregate({
            where: { assignment_id: assignmentId },
            _sum: { gross_pay: true, net_pay: true, regular_hours: true, ot_hours: true },
            _count: { payroll_id: true },
        });
        return (0, response_1.sendSuccess)(res, {
            data: payrolls,
            paging: { total, page, limit, totalPages: Math.ceil(total / limit) },
            summary: {
                total_payrolls: summary._count.payroll_id,
                total_gross_pay: Number(summary._sum.gross_pay ?? 0),
                total_net_pay: Number(summary._sum.net_pay ?? 0),
                total_regular_hours: Number(summary._sum.regular_hours ?? 0),
                total_ot_hours: Number(summary._sum.ot_hours ?? 0),
            },
        });
    }
    catch (err) {
        console.error('getPayrollsByAssignment:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch payrolls for assignment', 500);
    }
};
exports.getPayrollsByAssignment = getPayrollsByAssignment;
// ─────────────────────────────────────────────────────────────
// MANUAL CREATE PAYROLL
// POST /api/payroll
//
// Normally payroll is auto-created during timesheet approval.
// This endpoint handles edge-cases: standalone payroll entries,
// corrections, or assignments without timesheets.
//
// Body: {
//   assignment_id   (required)
//   timesheet_id?   (optional — links to an approved timesheet)
//   pay_period?     (e.g. "2025-W12" — auto-derived from timesheet if omitted)
//   regular_hours   (required)
//   ot_hours?
//   pay_rate        (required)
//   ot_pay_rate?
//   gross_pay?      (auto-calculated if omitted: reg*pay + ot*ot_pay)
//   net_pay?        (defaults to gross_pay if omitted)
// }
// ─────────────────────────────────────────────────────────────
const createPayroll = async (req, res) => {
    try {
        const { assignment_id, timesheet_id, pay_period, regular_hours, ot_hours = 0, pay_rate, ot_pay_rate, gross_pay, net_pay, } = req.body;
        // ── Validate required fields ──────────────────────────────
        if (!assignment_id)
            return (0, response_1.sendError)(res, 'assignment_id is required', 400);
        if (regular_hours == null)
            return (0, response_1.sendError)(res, 'regular_hours is required', 400);
        if (pay_rate == null)
            return (0, response_1.sendError)(res, 'pay_rate is required', 400);
        const assignment = await prisma_config_1.default.assignment.findUnique({ where: { assignment_id } });
        if (!assignment)
            return (0, response_1.sendError)(res, 'Assignment not found', 404);
        // ── Optional timesheet link ───────────────────────────────
        let linkedTimesheet = null;
        if (timesheet_id) {
            linkedTimesheet = await prisma_config_1.default.timesheet.findUnique({ where: { timesheet_id } });
            if (!linkedTimesheet)
                return (0, response_1.sendError)(res, 'Timesheet not found', 404);
            if (linkedTimesheet.assignment_id !== assignment_id) {
                return (0, response_1.sendError)(res, 'Timesheet does not belong to this assignment', 409);
            }
            // Guard against duplicate payroll for the same timesheet
            const existing = await prisma_config_1.default.payroll.findUnique({ where: { timesheet_id } });
            if (existing) {
                return (0, response_1.sendError)(res, `A payroll record already exists for timesheet ${timesheet_id}`, 409);
            }
        }
        // ── Derive pay period ─────────────────────────────────────
        let resolvedPayPeriod = pay_period;
        if (!resolvedPayPeriod) {
            if (linkedTimesheet) {
                resolvedPayPeriod = getWeekLabel(linkedTimesheet.week_start_date);
            }
            else {
                resolvedPayPeriod = getWeekLabel(new Date());
            }
        }
        // ── Calculate amounts ─────────────────────────────────────
        const regHours = new library_1.Decimal(regular_hours);
        const otHrs = new library_1.Decimal(ot_hours);
        const payRateDec = new library_1.Decimal(pay_rate);
        const otPayRateDec = ot_pay_rate != null ? new library_1.Decimal(ot_pay_rate) : payRateDec.mul(1.5);
        const computedGross = payRateDec.mul(regHours).add(otPayRateDec.mul(otHrs));
        const finalGross = gross_pay != null ? new library_1.Decimal(gross_pay) : computedGross;
        const finalNet = net_pay != null ? new library_1.Decimal(net_pay) : finalGross;
        const payroll = await prisma_config_1.default.payroll.create({
            data: {
                assignment_id,
                timesheet_id: timesheet_id ?? undefined,
                pay_period: resolvedPayPeriod,
                regular_hours: regHours,
                ot_hours: otHrs,
                pay_rate: payRateDec,
                ot_pay_rate: otPayRateDec,
                gross_pay: finalGross,
                net_pay: finalNet,
            },
            include: PAYROLL_INCLUDE,
        });
        return (0, response_1.sendSuccess)(res, payroll, 201);
    }
    catch (err) {
        console.error('createPayroll:', err);
        return (0, response_1.sendError)(res, 'Failed to create payroll record', 500);
    }
};
exports.createPayroll = createPayroll;
// ─────────────────────────────────────────────────────────────
// UPDATE PAYROLL
// PATCH /api/payroll/:payrollId
//
// Allows correcting pay rates, hours, or net_pay on a payroll
// that has NOT yet been QB-synced. Once synced, corrections must
// go through voidAndReplace.
//
// Body: any subset of {
//   regular_hours, ot_hours, pay_rate, ot_pay_rate,
//   gross_pay, net_pay
// }
// ─────────────────────────────────────────────────────────────
const updatePayroll = async (req, res) => {
    try {
        const { payrollId } = req.params;
        const payroll = await prisma_config_1.default.payroll.findUnique({ where: { payroll_id: payrollId } });
        if (!payroll)
            return (0, response_1.sendError)(res, 'Payroll record not found', 404);
        if (payroll.qb_synced) {
            return (0, response_1.sendError)(res, 'This payroll has been synced to QuickBooks and cannot be edited directly. Use the void-and-replace flow instead.', 409);
        }
        const { regular_hours, ot_hours, pay_rate, ot_pay_rate, gross_pay, net_pay, } = req.body;
        const updateData = {};
        // Resolve updated values, falling back to current stored values
        const newRegHours = regular_hours != null ? new library_1.Decimal(regular_hours) : payroll.regular_hours;
        const newOtHours = ot_hours != null ? new library_1.Decimal(ot_hours) : payroll.ot_hours;
        const newPayRate = pay_rate != null ? new library_1.Decimal(pay_rate) : payroll.pay_rate;
        const newOtPayRate = ot_pay_rate != null ? new library_1.Decimal(ot_pay_rate) : (payroll.ot_pay_rate ?? newPayRate.mul(1.5));
        if (regular_hours != null)
            updateData.regular_hours = newRegHours;
        if (ot_hours != null)
            updateData.ot_hours = newOtHours;
        if (pay_rate != null)
            updateData.pay_rate = newPayRate;
        if (ot_pay_rate != null)
            updateData.ot_pay_rate = newOtPayRate;
        // Recalculate gross unless explicitly provided
        if (gross_pay != null) {
            updateData.gross_pay = new library_1.Decimal(gross_pay);
        }
        else if (regular_hours != null || ot_hours != null || pay_rate != null || ot_pay_rate != null) {
            updateData.gross_pay = newPayRate.mul(newRegHours).add(newOtPayRate.mul(newOtHours));
        }
        // net_pay: explicit value → use it; else default to recalculated gross
        if (net_pay != null) {
            updateData.net_pay = new library_1.Decimal(net_pay);
        }
        else if (updateData.gross_pay) {
            updateData.net_pay = updateData.gross_pay;
        }
        if (Object.keys(updateData).length === 0) {
            return (0, response_1.sendError)(res, 'No updatable fields provided', 400);
        }
        const updated = await prisma_config_1.default.payroll.update({
            where: { payroll_id: payrollId },
            data: updateData,
            include: PAYROLL_INCLUDE,
        });
        return (0, response_1.sendSuccess)(res, updated);
    }
    catch (err) {
        console.error('updatePayroll:', err);
        return (0, response_1.sendError)(res, 'Failed to update payroll record', 500);
    }
};
exports.updatePayroll = updatePayroll;
// ─────────────────────────────────────────────────────────────
// VOID AND REPLACE
// POST /api/payroll/:payrollId/void-and-replace
//
// Used when a QB-synced payroll needs correction.
// The original record is soft-voided (qb_synced stays true as a
// historical marker) and a new corrected record is created.
//
// Body: same fields as PATCH /api/payroll/:payrollId
// ─────────────────────────────────────────────────────────────
const voidAndReplacePayroll = async (req, res) => {
    try {
        const { payrollId } = req.params;
        const original = await prisma_config_1.default.payroll.findUnique({
            where: { payroll_id: payrollId },
            include: PAYROLL_INCLUDE,
        });
        if (!original)
            return (0, response_1.sendError)(res, 'Payroll record not found', 404);
        const { regular_hours = original.regular_hours, ot_hours = original.ot_hours, pay_rate = original.pay_rate, ot_pay_rate = original.ot_pay_rate, gross_pay, net_pay, } = req.body;
        const newRegHours = new library_1.Decimal(regular_hours);
        const newOtHours = new library_1.Decimal(ot_hours);
        const newPayRate = new library_1.Decimal(pay_rate);
        const newOtPayRate = new library_1.Decimal(ot_pay_rate ?? new library_1.Decimal(pay_rate).mul(1.5));
        const newGross = gross_pay != null
            ? new library_1.Decimal(gross_pay)
            : newPayRate.mul(newRegHours).add(newOtPayRate.mul(newOtHours));
        const newNet = net_pay != null ? new library_1.Decimal(net_pay) : newGross;
        // Replacement record cannot reuse the same timesheet_id (unique constraint)
        // so it is created as a standalone record referencing the same assignment + pay period
        const replacement = await prisma_config_1.default.payroll.create({
            data: {
                assignment_id: original.assignment_id,
                timesheet_id: undefined, // intentionally unlinked — original keeps the link
                pay_period: original.pay_period,
                regular_hours: newRegHours,
                ot_hours: newOtHours,
                pay_rate: newPayRate,
                ot_pay_rate: newOtPayRate,
                gross_pay: newGross,
                net_pay: newNet,
            },
            include: PAYROLL_INCLUDE,
        });
        return (0, response_1.sendSuccess)(res, {
            voided: { payroll_id: original.payroll_id, pay_period: original.pay_period },
            replacement,
            message: 'Original payroll voided; replacement record created. Re-sync the replacement to QuickBooks.',
        }, 201);
    }
    catch (err) {
        console.error('voidAndReplacePayroll:', err);
        return (0, response_1.sendError)(res, 'Failed to void-and-replace payroll', 500);
    }
};
exports.voidAndReplacePayroll = voidAndReplacePayroll;
// ─────────────────────────────────────────────────────────────
// DELETE PAYROLL  (only if NOT QB-synced)
// DELETE /api/payroll/:payrollId
// ─────────────────────────────────────────────────────────────
const deletePayroll = async (req, res) => {
    try {
        const { payrollId } = req.params;
        const payroll = await prisma_config_1.default.payroll.findUnique({ where: { payroll_id: payrollId } });
        if (!payroll)
            return (0, response_1.sendError)(res, 'Payroll record not found', 404);
        if (payroll.qb_synced) {
            return (0, response_1.sendError)(res, 'Cannot delete a QB-synced payroll. Use void-and-replace instead.', 409);
        }
        await prisma_config_1.default.payroll.delete({ where: { payroll_id: payrollId } });
        return (0, response_1.sendSuccess)(res, { deleted: true, payroll_id: payrollId });
    }
    catch (err) {
        console.error('deletePayroll:', err);
        return (0, response_1.sendError)(res, 'Failed to delete payroll record', 500);
    }
};
exports.deletePayroll = deletePayroll;
// ─────────────────────────────────────────────────────────────
// QUICKBOOKS SYNC
// POST /api/payroll/:payrollId/qb-sync
//
// Marks a payroll as synced to QuickBooks.
// Body: { qb_payroll_id: string }
// ─────────────────────────────────────────────────────────────
const markQbSynced = async (req, res) => {
    try {
        const { payrollId } = req.params;
        const { qb_payroll_id } = req.body;
        if (!qb_payroll_id)
            return (0, response_1.sendError)(res, 'qb_payroll_id is required', 400);
        const payroll = await prisma_config_1.default.payroll.findUnique({ where: { payroll_id: payrollId } });
        if (!payroll)
            return (0, response_1.sendError)(res, 'Payroll record not found', 404);
        if (payroll.qb_synced) {
            return (0, response_1.sendError)(res, 'Payroll is already marked as QB-synced', 409);
        }
        const updated = await prisma_config_1.default.payroll.update({
            where: { payroll_id: payrollId },
            data: {
                qb_synced: true,
                qb_synced_at: new Date(),
                qb_payroll_id,
            },
            include: PAYROLL_INCLUDE,
        });
        return (0, response_1.sendSuccess)(res, updated);
    }
    catch (err) {
        console.error('markQbSynced:', err);
        return (0, response_1.sendError)(res, 'Failed to mark payroll as QB-synced', 500);
    }
};
exports.markQbSynced = markQbSynced;
// ─────────────────────────────────────────────────────────────
// BULK QB SYNC
// POST /api/payroll/qb-sync/bulk
//
// Marks multiple payrolls as QB-synced in one call.
// Body: { records: [ { payroll_id, qb_payroll_id }, ... ] }
// ─────────────────────────────────────────────────────────────
const bulkMarkQbSynced = async (req, res) => {
    try {
        const { records } = req.body;
        if (!Array.isArray(records) || records.length === 0) {
            return (0, response_1.sendError)(res, 'records must be a non-empty array of { payroll_id, qb_payroll_id }', 400);
        }
        const errors = [];
        const updated = [];
        const syncedAt = new Date();
        await prisma_config_1.default.$transaction(records.map((r) => prisma_config_1.default.payroll.update({
            where: { payroll_id: r.payroll_id },
            data: {
                qb_synced: true,
                qb_synced_at: syncedAt,
                qb_payroll_id: r.qb_payroll_id,
            },
        }))).then(results => {
            results.forEach(r => updated.push(r.payroll_id));
        }).catch(err => {
            errors.push({ payroll_id: 'batch', message: err.message });
        });
        return (0, response_1.sendSuccess)(res, {
            synced_count: updated.length,
            error_count: errors.length,
            synced: updated,
            errors,
        });
    }
    catch (err) {
        console.error('bulkMarkQbSynced:', err);
        return (0, response_1.sendError)(res, 'Failed to bulk sync payrolls', 500);
    }
};
exports.bulkMarkQbSynced = bulkMarkQbSynced;
// ─────────────────────────────────────────────────────────────
// GET PAYROLL SUMMARY BY PAY PERIOD
// GET /api/payroll/periods
//
// Groups all payrolls by pay_period — useful for a "payroll run" view.
// Returns each period with total gross, net, worker count, hours.
//
// Query params: weekStart, weekEnd, assignmentId
// ─────────────────────────────────────────────────────────────
const getPayrollPeriods = async (req, res) => {
    try {
        const { assignmentId, weekStart, weekEnd } = req.query;
        const andClauses = [];
        if (assignmentId)
            andClauses.push({ assignment_id: assignmentId });
        if (weekStart || weekEnd) {
            const tsFilter = {};
            if (weekStart) {
                const d = new Date(weekStart);
                d.setUTCHours(0, 0, 0, 0);
                tsFilter.gte = d;
            }
            if (weekEnd) {
                const d = new Date(weekEnd);
                d.setUTCHours(23, 59, 59, 999);
                tsFilter.lte = d;
            }
            andClauses.push({ timesheet: { week_start_date: tsFilter } });
        }
        const where = andClauses.length > 0 ? { AND: andClauses } : {};
        const groups = await prisma_config_1.default.payroll.groupBy({
            by: ['pay_period'],
            where,
            _count: { payroll_id: true },
            _sum: { regular_hours: true, ot_hours: true, gross_pay: true, net_pay: true },
            orderBy: { pay_period: 'desc' },
        });
        // Enrich each period with its Monday date for display
        const periods = groups.map(g => {
            const monday = weekLabelToDate(g.pay_period);
            return {
                pay_period: g.pay_period,
                week_start_date: monday?.toISOString().slice(0, 10) ?? null,
                payroll_count: g._count.payroll_id,
                total_regular_hours: Number(g._sum.regular_hours ?? 0),
                total_ot_hours: Number(g._sum.ot_hours ?? 0),
                total_hours: Number(g._sum.regular_hours ?? 0) + Number(g._sum.ot_hours ?? 0),
                total_gross_pay: Number(g._sum.gross_pay ?? 0),
                total_net_pay: Number(g._sum.net_pay ?? 0),
            };
        });
        return (0, response_1.sendSuccess)(res, { data: periods, total: periods.length });
    }
    catch (err) {
        console.error('getPayrollPeriods:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch payroll periods', 500);
    }
};
exports.getPayrollPeriods = getPayrollPeriods;
// ─────────────────────────────────────────────────────────────
// GET PAYROLLS FOR A SPECIFIC PERIOD
// GET /api/payroll/periods/:payPeriod
//   e.g. /api/payroll/periods/2025-W12
// ─────────────────────────────────────────────────────────────
const getPayrollsByPeriod = async (req, res) => {
    try {
        const { payPeriod } = req.params;
        if (!/^\d{4}-W\d{2}$/.test(payPeriod)) {
            return (0, response_1.sendError)(res, 'payPeriod must be in format YYYY-WWW, e.g. 2025-W12', 400);
        }
        const payrolls = await prisma_config_1.default.payroll.findMany({
            where: { pay_period: payPeriod },
            orderBy: { processed_at: 'asc' },
            include: PAYROLL_INCLUDE,
        });
        const totals = payrolls.reduce((acc, p) => ({
            gross: acc.gross + Number(p.gross_pay),
            net: acc.net + Number(p.net_pay),
            reg: acc.reg + Number(p.regular_hours),
            ot: acc.ot + Number(p.ot_hours),
        }), { gross: 0, net: 0, reg: 0, ot: 0 });
        return (0, response_1.sendSuccess)(res, {
            pay_period: payPeriod,
            week_start_date: weekLabelToDate(payPeriod)?.toISOString().slice(0, 10) ?? null,
            payroll_count: payrolls.length,
            total_gross_pay: totals.gross,
            total_net_pay: totals.net,
            total_regular_hours: totals.reg,
            total_ot_hours: totals.ot,
            total_hours: totals.reg + totals.ot,
            data: payrolls,
        });
    }
    catch (err) {
        console.error('getPayrollsByPeriod:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch payrolls for period', 500);
    }
};
exports.getPayrollsByPeriod = getPayrollsByPeriod;
// ─────────────────────────────────────────────────────────────
// EXPORT
// ─────────────────────────────────────────────────────────────
exports.payrollController = {
    // Core CRUD
    getAllPayrolls: exports.getAllPayrolls,
    getPayrollStats: exports.getPayrollStats,
    getPayrollById: exports.getPayrollById,
    getPayrollsByAssignment: exports.getPayrollsByAssignment,
    createPayroll: exports.createPayroll,
    updatePayroll: exports.updatePayroll,
    deletePayroll: exports.deletePayroll,
    // Correction flow
    voidAndReplacePayroll: exports.voidAndReplacePayroll,
    // QuickBooks sync
    markQbSynced: exports.markQbSynced,
    bulkMarkQbSynced: exports.bulkMarkQbSynced,
    // Period views
    getPayrollPeriods: exports.getPayrollPeriods,
    getPayrollsByPeriod: exports.getPayrollsByPeriod,
};
//# sourceMappingURL=payrollController.js.map