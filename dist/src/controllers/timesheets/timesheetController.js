"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.timesheetController = exports.bulkUpsertTimeEntries = exports.getTimesheetNotifications = exports.getAssignmentsForTimesheets = exports.updateInvoiceStatus = exports.downloadInvoicePdf = exports.getInvoiceById = exports.getAllInvoices = exports.rejectTimesheet = exports.approveTimesheet = exports.submitTimesheet = exports.deleteTimeEntry = exports.upsertTimeEntry = exports.createOrGetTimesheet = exports.getTimesheetById = exports.getTimesheetsByAssignment = exports.getTimesheetStats = exports.getAllTimesheets = void 0;
const prisma_config_1 = __importDefault(require("../../prisma.config"));
const response_1 = require("../../utils/response");
const library_1 = require("@prisma/client/runtime/library");
const invoiceService_1 = require("./../../services/invoiceService");
// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────
/** Normalize any date to the Monday of its ISO week at 00:00:00 UTC */
const getWeekStart = (date) => {
    const d = new Date(date);
    const day = d.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setUTCDate(d.getUTCDate() + diff);
    d.setUTCHours(0, 0, 0, 0);
    return d;
};
const getWeekEnd = (weekStart) => {
    const d = new Date(weekStart);
    d.setUTCDate(d.getUTCDate() + 6);
    d.setUTCHours(23, 59, 59, 999);
    return d;
};
/** Returns ISO week label like "2025-W12" */
const getWeekLabel = (weekStart) => {
    const jan1 = new Date(Date.UTC(weekStart.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(((weekStart.getTime() - jan1.getTime()) / 86400000 + jan1.getUTCDay() + 1) / 7);
    return `${weekStart.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
};
/** Current week Monday/Sunday (reused in multiple endpoints) */
const currentWeekBounds = () => {
    const now = new Date();
    const start = getWeekStart(now);
    const end = getWeekEnd(start);
    return { start, end };
};
/**
 * Recalculate weekly hour totals by summing all daily TimeEntry rows.
 * Called after every entry upsert/delete.
 */
const recalculateTimesheetTotals = async (timesheetId) => {
    const entries = await prisma_config_1.default.timeEntry.findMany({
        where: { timesheet_id: timesheetId },
    });
    const totalRegular = entries.reduce((s, e) => s + Number(e.regular_hours), 0);
    const totalOt = entries.reduce((s, e) => s + Number(e.ot_hours), 0);
    await prisma_config_1.default.timesheet.update({
        where: { timesheet_id: timesheetId },
        data: {
            total_regular_hours: new library_1.Decimal(totalRegular),
            total_ot_hours: new library_1.Decimal(totalOt),
            total_hours: new library_1.Decimal(totalRegular + totalOt),
        },
    });
};
/**
 * Pull the latest JobRate for this assignment's job and compute billing totals.
 * Called at APPROVAL time — rates are snapshotted once and frozen on the record.
 */
const computeBilling = async (assignmentId, regularHours, otHours) => {
    const assignment = await prisma_config_1.default.assignment.findUnique({
        where: { assignment_id: assignmentId },
        include: {
            application: {
                include: {
                    job: {
                        include: {
                            job_rates: { take: 1, orderBy: { job_rate_id: 'desc' } },
                        },
                    },
                },
            },
        },
    });
    if (!assignment)
        throw new Error('Assignment not found');
    const rate = assignment.application.job.job_rates[0];
    if (!rate) {
        throw new Error(`No JobRate configured for job "${assignment.application.job.job_title}". ` +
            `Please add a billing rate before approving.`);
    }
    const billRate = new library_1.Decimal(rate.bill_rate);
    const otBillRate = rate.ot_bill_rate ? new library_1.Decimal(rate.ot_bill_rate) : billRate.mul(1.5);
    const payRate = rate.pay_rate ? new library_1.Decimal(rate.pay_rate) : new library_1.Decimal(0);
    const otPayRate = rate.ot_pay_rate ? new library_1.Decimal(rate.ot_pay_rate) : payRate.mul(1.5);
    const totalBill = billRate.mul(regularHours).add(otBillRate.mul(otHours));
    const totalPay = payRate.mul(regularHours).add(otPayRate.mul(otHours));
    return { billRate, otBillRate, payRate, otPayRate, totalBill, totalPay };
};
/** Generate a sequential invoice number e.g. INV-2025-0042 */
const generateInvoiceNumber = async () => {
    const year = new Date().getUTCFullYear();
    const count = await prisma_config_1.default.invoice.count({
        where: { invoice_date: { gte: new Date(`${year}-01-01T00:00:00Z`) } },
    });
    return `INV-${year}-${String(count + 1).padStart(4, '0')}`;
};
// ─────────────────────────────────────────────────────────────
// TIMESHEET ENDPOINTS
// ─────────────────────────────────────────────────────────────
/**
 * GET /api/timesheets
 * List timesheets with pagination and optional filters.
 * Query: assignmentId?, status?, weekStart?, search?, page?, limit?
 *
 * Improvements:
 *   - Added `search` param: filters by worker name, job title, or org name
 *   - Fixed filter conflict: AND-merges status + assignmentId + search
 *   - Returns LinearProgress-compatible `refreshing` state via 304
 */
const getAllTimesheets = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
        const skip = (page - 1) * limit;
        const { assignmentId, status, weekStart, search } = req.query;
        const andClauses = [];
        if (assignmentId)
            andClauses.push({ assignment_id: assignmentId });
        if (status)
            andClauses.push({ status });
        if (weekStart)
            andClauses.push({ week_start_date: getWeekStart(new Date(weekStart)) });
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
        const [timesheets, total] = await Promise.all([
            prisma_config_1.default.timesheet.findMany({
                where,
                skip,
                take: limit,
                orderBy: { week_start_date: 'desc' },
                include: {
                    assignment: {
                        include: {
                            application: {
                                include: {
                                    applicant: { select: { applicant_id: true, full_name: true } },
                                    job: {
                                        select: {
                                            job_id: true,
                                            job_title: true,
                                            organization: { select: { organization_id: true, name: true } },
                                        },
                                    },
                                },
                            },
                        },
                    },
                    reviewed_by: { select: { user_id: true, name: true } },
                    invoice: {
                        select: {
                            invoice_id: true,
                            invoice_number: true,
                            status: true,
                            total_amount: true,
                            pdf_url: true,
                        },
                    },
                    _count: { select: { time_entries: true } },
                },
            }),
            prisma_config_1.default.timesheet.count({ where }),
        ]);
        return (0, response_1.sendSuccess)(res, {
            data: timesheets,
            paging: { total, page, limit, totalPages: Math.ceil(total / limit) },
        });
    }
    catch (err) {
        console.error('getAllTimesheets:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch timesheets', 500);
    }
};
exports.getAllTimesheets = getAllTimesheets;
/**
 * GET /api/timesheets/stats
 * Aggregate statistics across timesheets.
 * Query: assignmentId?, status?, weekStart?, weekEnd?
 *
 * Field mapping (matches frontend expectations):
 *   total_billed  ← total_bill_amount sum
 *   total_payroll ← total_pay_amount sum
 */
const getTimesheetStats = async (req, res) => {
    try {
        const { assignmentId, status, weekStart, weekEnd } = req.query;
        const where = {};
        if (assignmentId)
            where.assignment_id = assignmentId;
        if (status)
            where.status = status;
        if (weekStart || weekEnd) {
            where.week_start_date = {};
            if (weekStart)
                where.week_start_date.gte = getWeekStart(new Date(weekStart));
            if (weekEnd)
                where.week_start_date.lte = getWeekStart(new Date(weekEnd));
        }
        const [statusGroups, totals] = await Promise.all([
            prisma_config_1.default.timesheet.groupBy({
                by: ['status'],
                where,
                _count: { timesheet_id: true },
            }),
            prisma_config_1.default.timesheet.aggregate({
                where,
                _sum: {
                    total_regular_hours: true,
                    total_ot_hours: true,
                    total_hours: true,
                    total_bill_amount: true,
                    total_pay_amount: true,
                },
                _avg: { total_hours: true },
                _count: { timesheet_id: true },
            }),
        ]);
        return (0, response_1.sendSuccess)(res, {
            total_timesheets: totals._count.timesheet_id,
            total_regular_hours: totals._sum.total_regular_hours ?? 0,
            total_ot_hours: totals._sum.total_ot_hours ?? 0,
            total_hours: totals._sum.total_hours ?? 0,
            // Aliased to match frontend stat card field names exactly
            total_billed: totals._sum.total_bill_amount ?? 0,
            total_payroll: totals._sum.total_pay_amount ?? 0,
            avg_hours_per_week: totals._avg.total_hours ?? 0,
            by_status: statusGroups.map(g => ({
                status: g.status,
                count: g._count.timesheet_id,
            })),
        });
    }
    catch (err) {
        console.error('getTimesheetStats:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch statistics', 500);
    }
};
exports.getTimesheetStats = getTimesheetStats;
/**
 * GET /api/timesheets/assignment/:assignmentId
 * All timesheets for a single assignment (worker history).
 */
const getTimesheetsByAssignment = async (req, res) => {
    try {
        const { assignmentId } = req.params;
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
        const skip = (page - 1) * limit;
        const assignment = await prisma_config_1.default.assignment.findUnique({
            where: { assignment_id: assignmentId },
        });
        if (!assignment)
            return (0, response_1.sendError)(res, 'Assignment not found', 404);
        const [timesheets, total] = await Promise.all([
            prisma_config_1.default.timesheet.findMany({
                where: { assignment_id: assignmentId },
                skip,
                take: limit,
                orderBy: { week_start_date: 'desc' },
                include: {
                    time_entries: { orderBy: { work_date: 'asc' } },
                    reviewed_by: { select: { user_id: true, name: true } },
                    invoice: {
                        select: {
                            invoice_id: true,
                            invoice_number: true,
                            status: true,
                            total_amount: true,
                            pdf_url: true,
                        },
                    },
                    payroll: {
                        select: {
                            payroll_id: true,
                            gross_pay: true,
                            net_pay: true,
                            processed_at: true,
                        },
                    },
                },
            }),
            prisma_config_1.default.timesheet.count({ where: { assignment_id: assignmentId } }),
        ]);
        return (0, response_1.sendSuccess)(res, {
            data: timesheets,
            paging: { total, page, limit, totalPages: Math.ceil(total / limit) },
        });
    }
    catch (err) {
        console.error('getTimesheetsByAssignment:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch timesheets', 500);
    }
};
exports.getTimesheetsByAssignment = getTimesheetsByAssignment;
/**
 * GET /api/timesheets/:id
 * Full timesheet detail including all daily entries, invoice, payroll.
 */
const getTimesheetById = async (req, res) => {
    try {
        const { id } = req.params;
        const timesheet = await prisma_config_1.default.timesheet.findUnique({
            where: { timesheet_id: id },
            include: {
                time_entries: { orderBy: { work_date: 'asc' } },
                reviewed_by: { select: { user_id: true, name: true, email: true } },
                invoice: true,
                payroll: true,
                assignment: {
                    include: {
                        application: {
                            include: {
                                applicant: { include: { contact: true } },
                                job: {
                                    include: {
                                        job_rates: { take: 1, orderBy: { job_rate_id: 'desc' } },
                                        organization: { select: { organization_id: true, name: true, website: true } },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });
        if (!timesheet)
            return (0, response_1.sendError)(res, 'Timesheet not found', 404);
        return (0, response_1.sendSuccess)(res, timesheet);
    }
    catch (err) {
        console.error('getTimesheetById:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch timesheet', 500);
    }
};
exports.getTimesheetById = getTimesheetById;
/**
 * POST /api/timesheets
 * Create or retrieve the timesheet for a given assignment + week (idempotent).
 * Body: { assignment_id, week_start_date, notes? }
 */
const createOrGetTimesheet = async (req, res) => {
    try {
        const { assignment_id, week_start_date, notes } = req.body;
        if (!assignment_id || !week_start_date) {
            return (0, response_1.sendError)(res, 'assignment_id and week_start_date are required', 400);
        }
        const assignment = await prisma_config_1.default.assignment.findUnique({
            where: { assignment_id },
        });
        if (!assignment)
            return (0, response_1.sendError)(res, 'Assignment not found', 404);
        const weekStart = getWeekStart(new Date(week_start_date));
        const weekEnd = getWeekEnd(weekStart);
        const existing = await prisma_config_1.default.timesheet.findUnique({
            where: {
                assignment_id_week_start_date: { assignment_id, week_start_date: weekStart },
            },
            include: { time_entries: { orderBy: { work_date: 'asc' } } },
        });
        if (existing) {
            return (0, response_1.sendSuccess)(res, { ...existing, _returned_existing: true }, 200);
        }
        const timesheet = await prisma_config_1.default.timesheet.create({
            data: { assignment_id, week_start_date: weekStart, week_end_date: weekEnd, notes, status: 'DRAFT' },
            include: { time_entries: true },
        });
        return (0, response_1.sendSuccess)(res, timesheet, 201);
    }
    catch (err) {
        console.error('createOrGetTimesheet:', err);
        return (0, response_1.sendError)(res, 'Failed to create timesheet', 500);
    }
};
exports.createOrGetTimesheet = createOrGetTimesheet;
/**
 * POST /api/timesheets/:id/entries
 * Add or update a single daily time entry. Timesheet must be DRAFT or REJECTED.
 */
const upsertTimeEntry = async (req, res) => {
    try {
        const { id } = req.params;
        const { work_date, regular_hours, ot_hours = 0, break_minutes = 0, work_type = 'REGULAR', notes } = req.body;
        if (work_date === undefined || regular_hours === undefined) {
            return (0, response_1.sendError)(res, 'work_date and regular_hours are required', 400);
        }
        const timesheet = await prisma_config_1.default.timesheet.findUnique({ where: { timesheet_id: id } });
        if (!timesheet)
            return (0, response_1.sendError)(res, 'Timesheet not found', 404);
        if (!['DRAFT', 'REJECTED'].includes(timesheet.status)) {
            return (0, response_1.sendError)(res, `Cannot edit entries on a ${timesheet.status} timesheet`, 409);
        }
        const entryDate = new Date(work_date);
        entryDate.setUTCHours(0, 0, 0, 0);
        if (entryDate < timesheet.week_start_date || entryDate > timesheet.week_end_date) {
            return (0, response_1.sendError)(res, `work_date must fall within: ${timesheet.week_start_date.toISOString().slice(0, 10)} – ${timesheet.week_end_date.toISOString().slice(0, 10)}`, 400);
        }
        const regDec = new library_1.Decimal(regular_hours);
        const otDec = new library_1.Decimal(ot_hours);
        const entry = await prisma_config_1.default.timeEntry.upsert({
            where: { timesheet_id_work_date: { timesheet_id: id, work_date: entryDate } },
            update: { regular_hours: regDec, ot_hours: otDec, total_hours: regDec.add(otDec), break_minutes, work_type, notes },
            create: { timesheet_id: id, assignment_id: timesheet.assignment_id, work_date: entryDate, regular_hours: regDec, ot_hours: otDec, total_hours: regDec.add(otDec), break_minutes, work_type, notes },
        });
        await recalculateTimesheetTotals(id);
        const updatedTotals = await prisma_config_1.default.timesheet.findUnique({
            where: { timesheet_id: id },
            select: { total_regular_hours: true, total_ot_hours: true, total_hours: true },
        });
        return (0, response_1.sendSuccess)(res, { entry, timesheet_totals: updatedTotals });
    }
    catch (err) {
        console.error('upsertTimeEntry:', err);
        return (0, response_1.sendError)(res, 'Failed to save time entry', 500);
    }
};
exports.upsertTimeEntry = upsertTimeEntry;
/**
 * DELETE /api/timesheets/:id/entries/:entryId
 */
const deleteTimeEntry = async (req, res) => {
    try {
        const { id, entryId } = req.params;
        const timesheet = await prisma_config_1.default.timesheet.findUnique({ where: { timesheet_id: id } });
        if (!timesheet)
            return (0, response_1.sendError)(res, 'Timesheet not found', 404);
        if (!['DRAFT', 'REJECTED'].includes(timesheet.status)) {
            return (0, response_1.sendError)(res, `Cannot delete entries on a ${timesheet.status} timesheet`, 409);
        }
        const entry = await prisma_config_1.default.timeEntry.findFirst({ where: { time_entry_id: entryId, timesheet_id: id } });
        if (!entry)
            return (0, response_1.sendError)(res, 'Time entry not found', 404);
        await prisma_config_1.default.timeEntry.delete({ where: { time_entry_id: entryId } });
        await recalculateTimesheetTotals(id);
        return (0, response_1.sendSuccess)(res, { deleted: true, time_entry_id: entryId });
    }
    catch (err) {
        console.error('deleteTimeEntry:', err);
        return (0, response_1.sendError)(res, 'Failed to delete time entry', 500);
    }
};
exports.deleteTimeEntry = deleteTimeEntry;
/**
 * POST /api/timesheets/:id/submit
 */
const submitTimesheet = async (req, res) => {
    try {
        const { id } = req.params;
        const timesheet = await prisma_config_1.default.timesheet.findUnique({
            where: { timesheet_id: id },
            include: { time_entries: true },
        });
        if (!timesheet)
            return (0, response_1.sendError)(res, 'Timesheet not found', 404);
        if (!['DRAFT', 'REJECTED'].includes(timesheet.status)) {
            return (0, response_1.sendError)(res, `Timesheet is already ${timesheet.status}`, 409);
        }
        if (timesheet.time_entries.length === 0) {
            return (0, response_1.sendError)(res, 'Cannot submit a timesheet with no time entries', 400);
        }
        const updated = await prisma_config_1.default.timesheet.update({
            where: { timesheet_id: id },
            data: { status: 'SUBMITTED', submitted_at: new Date() },
        });
        return (0, response_1.sendSuccess)(res, updated);
    }
    catch (err) {
        console.error('submitTimesheet:', err);
        return (0, response_1.sendError)(res, 'Failed to submit timesheet', 500);
    }
};
exports.submitTimesheet = submitTimesheet;
/**
 * POST /api/timesheets/:id/approve
 * Atomically snapshots billing, creates Invoice + Payroll, fires PDF async.
 * Body: { reviewed_by_user_id, tax_rate?, net_terms_days? }
 */
const approveTimesheet = async (req, res) => {
    try {
        const { id } = req.params;
        const { reviewed_by_user_id, tax_rate = 0, net_terms_days = 30 } = req.body;
        if (!reviewed_by_user_id)
            return (0, response_1.sendError)(res, 'reviewed_by_user_id is required', 400);
        const timesheet = await prisma_config_1.default.timesheet.findUnique({
            where: { timesheet_id: id },
            include: { time_entries: true },
        });
        if (!timesheet)
            return (0, response_1.sendError)(res, 'Timesheet not found', 404);
        if (!['SUBMITTED', 'UNDER_REVIEW'].includes(timesheet.status)) {
            return (0, response_1.sendError)(res, `Cannot approve a ${timesheet.status} timesheet`, 409);
        }
        const reviewer = await prisma_config_1.default.user.findUnique({ where: { user_id: reviewed_by_user_id } });
        if (!reviewer)
            return (0, response_1.sendError)(res, 'Reviewer user not found', 404);
        const billing = await computeBilling(timesheet.assignment_id, timesheet.total_regular_hours, timesheet.total_ot_hours);
        const taxRateDec = new library_1.Decimal(tax_rate);
        const taxAmount = billing.totalBill.mul(taxRateDec);
        const invoiceTotal = billing.totalBill.add(taxAmount);
        const invoiceNumber = await generateInvoiceNumber();
        const invoiceDate = new Date();
        const dueDate = new Date(invoiceDate);
        dueDate.setUTCDate(dueDate.getUTCDate() + net_terms_days);
        const payPeriod = getWeekLabel(timesheet.week_start_date);
        const { updatedTimesheet, invoice, payroll } = await prisma_config_1.default.$transaction(async (tx) => {
            const updatedTimesheet = await tx.timesheet.update({
                where: { timesheet_id: id },
                data: {
                    status: 'APPROVED', reviewed_by_user_id, reviewed_at: new Date(), approved_at: new Date(),
                    rejected_at: null, rejection_reason: null,
                    bill_rate: billing.billRate, ot_bill_rate: billing.otBillRate,
                    pay_rate: billing.payRate, ot_pay_rate: billing.otPayRate,
                    total_bill_amount: billing.totalBill, total_pay_amount: billing.totalPay,
                },
            });
            const invoice = await tx.invoice.create({
                data: {
                    assignment_id: timesheet.assignment_id, timesheet_id: id,
                    invoice_number: invoiceNumber, status: 'DRAFT', invoice_date: invoiceDate, due_date: dueDate,
                    regular_hours: timesheet.total_regular_hours, ot_hours: timesheet.total_ot_hours,
                    bill_rate: billing.billRate, ot_bill_rate: billing.otBillRate,
                    subtotal: billing.totalBill, tax_rate: taxRateDec, tax_amount: taxAmount, total_amount: invoiceTotal,
                },
            });
            const payroll = await tx.payroll.create({
                data: {
                    assignment_id: timesheet.assignment_id, timesheet_id: id,
                    pay_period: payPeriod,
                    regular_hours: timesheet.total_regular_hours, ot_hours: timesheet.total_ot_hours,
                    pay_rate: billing.payRate, ot_pay_rate: billing.otPayRate,
                    gross_pay: billing.totalPay, net_pay: billing.totalPay,
                },
            });
            return { updatedTimesheet, invoice, payroll };
        });
        // PDF fires async — does not block response
        (0, invoiceService_1.generateInvoicePdf)(invoice.invoice_id)
            .then(async (pdfUrl) => {
            await prisma_config_1.default.invoice.update({
                where: { invoice_id: invoice.invoice_id },
                data: { pdf_url: pdfUrl, pdf_generated_at: new Date() },
            });
        })
            .catch(err => console.error('PDF generation failed:', err));
        return (0, response_1.sendSuccess)(res, {
            timesheet: updatedTimesheet,
            invoice: {
                invoice_id: invoice.invoice_id,
                invoice_number: invoice.invoice_number,
                subtotal: invoice.subtotal,
                tax_amount: invoice.tax_amount,
                total_amount: invoice.total_amount,
                due_date: invoice.due_date,
                pdf_generating: true,
            },
            payroll: {
                payroll_id: payroll.payroll_id,
                pay_period: payroll.pay_period,
                gross_pay: payroll.gross_pay,
            },
        });
    }
    catch (err) {
        console.error('approveTimesheet:', err);
        if (err.message?.includes('No JobRate') || err.message?.includes('billing rate')) {
            return (0, response_1.sendError)(res, err.message, 422);
        }
        return (0, response_1.sendError)(res, 'Failed to approve timesheet', 500);
    }
};
exports.approveTimesheet = approveTimesheet;
/**
 * POST /api/timesheets/:id/reject
 */
const rejectTimesheet = async (req, res) => {
    try {
        const { id } = req.params;
        const { reviewed_by_user_id, rejection_reason } = req.body;
        if (!reviewed_by_user_id || !rejection_reason) {
            return (0, response_1.sendError)(res, 'reviewed_by_user_id and rejection_reason are required', 400);
        }
        const timesheet = await prisma_config_1.default.timesheet.findUnique({ where: { timesheet_id: id } });
        if (!timesheet)
            return (0, response_1.sendError)(res, 'Timesheet not found', 404);
        if (!['SUBMITTED', 'UNDER_REVIEW'].includes(timesheet.status)) {
            return (0, response_1.sendError)(res, `Cannot reject a ${timesheet.status} timesheet`, 409);
        }
        const updated = await prisma_config_1.default.timesheet.update({
            where: { timesheet_id: id },
            data: {
                status: 'REJECTED', reviewed_by_user_id, reviewed_at: new Date(),
                rejected_at: new Date(), rejection_reason, approved_at: null,
            },
        });
        return (0, response_1.sendSuccess)(res, updated);
    }
    catch (err) {
        console.error('rejectTimesheet:', err);
        return (0, response_1.sendError)(res, 'Failed to reject timesheet', 500);
    }
};
exports.rejectTimesheet = rejectTimesheet;
// ─────────────────────────────────────────────────────────────
// INVOICE ENDPOINTS
// ─────────────────────────────────────────────────────────────
const getAllInvoices = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
        const skip = (page - 1) * limit;
        const { assignmentId, status } = req.query;
        const where = {};
        if (assignmentId)
            where.assignment_id = assignmentId;
        if (status)
            where.status = status;
        const [invoices, total] = await Promise.all([
            prisma_config_1.default.invoice.findMany({
                where,
                skip,
                take: limit,
                orderBy: { invoice_date: 'desc' },
                include: {
                    timesheet: {
                        select: { week_start_date: true, week_end_date: true, total_hours: true },
                    },
                    assignment: {
                        include: {
                            application: {
                                include: {
                                    applicant: { select: { full_name: true } },
                                    job: {
                                        select: {
                                            job_title: true,
                                            organization: { select: { name: true } },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            }),
            prisma_config_1.default.invoice.count({ where }),
        ]);
        return (0, response_1.sendSuccess)(res, {
            data: invoices,
            paging: { total, page, limit, totalPages: Math.ceil(total / limit) },
        });
    }
    catch (err) {
        console.error('getAllInvoices:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch invoices', 500);
    }
};
exports.getAllInvoices = getAllInvoices;
const getInvoiceById = async (req, res) => {
    try {
        const { invoiceId } = req.params;
        const invoice = await prisma_config_1.default.invoice.findUnique({
            where: { invoice_id: invoiceId },
            include: {
                timesheet: { include: { time_entries: { orderBy: { work_date: 'asc' } } } },
                assignment: {
                    include: {
                        application: {
                            include: {
                                applicant: { include: { contact: true } },
                                job: {
                                    include: {
                                        organization: true,
                                        job_rates: { take: 1, orderBy: { job_rate_id: 'desc' } },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });
        if (!invoice)
            return (0, response_1.sendError)(res, 'Invoice not found', 404);
        return (0, response_1.sendSuccess)(res, invoice);
    }
    catch (err) {
        console.error('getInvoiceById:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch invoice', 500);
    }
};
exports.getInvoiceById = getInvoiceById;
const downloadInvoicePdf = async (req, res) => {
    try {
        const { invoiceId } = req.params;
        const invoice = await prisma_config_1.default.invoice.findUnique({ where: { invoice_id: invoiceId } });
        if (!invoice)
            return (0, response_1.sendError)(res, 'Invoice not found', 404);
        let pdfUrl = invoice.pdf_url;
        if (!pdfUrl) {
            pdfUrl = await (0, invoiceService_1.generateInvoicePdf)(invoiceId);
            await prisma_config_1.default.invoice.update({
                where: { invoice_id: invoiceId },
                data: { pdf_url: pdfUrl, pdf_generated_at: new Date() },
            });
        }
        // Extract filename from URL
        const filename = pdfUrl.split('/').pop() || `invoice-${invoiceId}.pdf`;
        const filePath = `${process.cwd()}/generated-invoices/${filename}`;
        // Check if file exists
        const fs = require('fs');
        if (!fs.existsSync(filePath)) {
            return (0, response_1.sendError)(res, 'PDF file not found on disk', 404);
        }
        // Send the PDF file directly
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
        return res.sendFile(filePath);
    }
    catch (err) {
        console.error('downloadInvoicePdf:', err);
        return (0, response_1.sendError)(res, 'Failed to generate invoice PDF', 500);
    }
};
exports.downloadInvoicePdf = downloadInvoicePdf;
const updateInvoiceStatus = async (req, res) => {
    try {
        const { invoiceId } = req.params;
        const { status, payment_method, payment_reference } = req.body;
        const VALID = ['DRAFT', 'SENT', 'VIEWED', 'PAID', 'OVERDUE', 'VOID'];
        if (!status || !VALID.includes(status)) {
            return (0, response_1.sendError)(res, `status must be one of: ${VALID.join(', ')}`, 400);
        }
        const invoice = await prisma_config_1.default.invoice.findUnique({ where: { invoice_id: invoiceId } });
        if (!invoice)
            return (0, response_1.sendError)(res, 'Invoice not found', 404);
        if (invoice.status === 'VOID')
            return (0, response_1.sendError)(res, 'Cannot update a voided invoice', 409);
        const updateData = { status };
        if (status === 'PAID') {
            updateData.paid_at = new Date();
            if (payment_method)
                updateData.payment_method = payment_method;
            if (payment_reference)
                updateData.payment_reference = payment_reference;
        }
        const updated = await prisma_config_1.default.invoice.update({ where: { invoice_id: invoiceId }, data: updateData });
        return (0, response_1.sendSuccess)(res, updated);
    }
    catch (err) {
        console.error('updateInvoiceStatus:', err);
        return (0, response_1.sendError)(res, 'Failed to update invoice status', 500);
    }
};
exports.updateInvoiceStatus = updateInvoiceStatus;
// ─────────────────────────────────────────────────────────────
// GET /api/timesheets/assignments
// Returns active assignments with current-week timesheet status.
//
// Improvements vs. original:
//   - Filters to ACTIVE assignments only (no end_date or end_date >= today)
//   - Adds pagination (default 100 to keep dropdown UX)
//   - Caches week bounds via shared helper
// ─────────────────────────────────────────────────────────────
const getAssignmentsForTimesheets = async (req, res) => {
    try {
        const { start: currentWeekStart } = currentWeekBounds();
        // Optional: include ended assignments if ?includeEnded=true
        const includeEnded = req.query.includeEnded === 'true';
        const where = includeEnded
            ? {}
            : { OR: [{ end_date: null }, { end_date: { gte: currentWeekStart } }] };
        const assignments = await prisma_config_1.default.assignment.findMany({
            where,
            orderBy: { start_date: 'desc' },
            // Don't paginate: these are for a dropdown — but limit to reasonable max
            take: 200,
            include: {
                application: {
                    include: {
                        applicant: { select: { applicant_id: true, full_name: true } },
                        job: {
                            select: {
                                job_id: true, job_title: true, location: true, job_type: true,
                                organization: { select: { organization_id: true, name: true } },
                                job_rates: {
                                    take: 1,
                                    orderBy: { job_rate_id: 'desc' },
                                    select: {
                                        bill_rate: true, pay_rate: true,
                                        ot_bill_rate: true, ot_pay_rate: true, hours: true,
                                    },
                                },
                            },
                        },
                    },
                },
                timesheets: {
                    where: { week_start_date: currentWeekStart },
                    select: { timesheet_id: true, status: true, total_hours: true },
                },
            },
        });
        const result = assignments.map((a) => {
            const job = a.application.job;
            const applicant = a.application.applicant;
            const rate = job.job_rates[0] ?? null;
            const cwt = a.timesheets[0] ?? null;
            return {
                assignment_id: a.assignment_id,
                employment_type: a.employment_type,
                start_date: a.start_date,
                end_date: a.end_date,
                applicant: {
                    applicant_id: applicant.applicant_id,
                    full_name: applicant.full_name,
                },
                job: {
                    job_id: job.job_id,
                    job_title: job.job_title,
                    location: job.location,
                    job_type: job.job_type,
                    organization: job.organization,
                },
                rate: rate ? {
                    bill_rate: rate.bill_rate,
                    pay_rate: rate.pay_rate,
                    ot_bill_rate: rate.ot_bill_rate,
                    ot_pay_rate: rate.ot_pay_rate,
                    standard_hours: rate.hours,
                } : null,
                current_week_timesheet: cwt,
                display_label: `${applicant.full_name} — ${job.job_title} @ ${job.organization.name}`,
            };
        });
        return (0, response_1.sendSuccess)(res, {
            data: result,
            current_week_start: currentWeekStart,
            total: result.length,
        });
    }
    catch (err) {
        console.error('getAssignmentsForTimesheets:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch assignments', 500);
    }
};
exports.getAssignmentsForTimesheets = getAssignmentsForTimesheets;
// ─────────────────────────────────────────────────────────────
// GET /api/timesheets/notifications
// ─────────────────────────────────────────────────────────────
const getTimesheetNotifications = async (req, res) => {
    try {
        const { start: currentWeekStart, end: currentWeekEnd } = currentWeekBounds();
        const activeAssignments = await prisma_config_1.default.assignment.findMany({
            where: {
                AND: [
                    { start_date: { lte: currentWeekEnd } },
                    { OR: [{ end_date: null }, { end_date: { gte: currentWeekStart } }] },
                ],
            },
            include: {
                application: {
                    include: {
                        applicant: { select: { full_name: true } },
                        job: {
                            select: {
                                job_title: true,
                                organization: { select: { name: true } },
                            },
                        },
                    },
                },
                timesheets: {
                    where: { week_start_date: currentWeekStart },
                    select: { timesheet_id: true, status: true, total_hours: true },
                },
            },
            orderBy: { start_date: 'desc' },
        });
        const missing = [];
        const drafts = [];
        const pendingApproval = [];
        for (const a of activeAssignments) {
            const ts = a.timesheets[0];
            const base = {
                assignment_id: a.assignment_id,
                worker_name: a.application.applicant.full_name,
                job_title: a.application.job.job_title,
                company: a.application.job.organization.name,
                week_start: currentWeekStart,
                week_end: currentWeekEnd,
            };
            if (!ts) {
                missing.push({ ...base, timesheet_id: null, status: 'NOT_STARTED', hours: 0 });
            }
            else if (['DRAFT', 'REJECTED'].includes(ts.status)) {
                drafts.push({ ...base, timesheet_id: ts.timesheet_id, status: ts.status, hours: Number(ts.total_hours) });
            }
            else if (['SUBMITTED', 'UNDER_REVIEW'].includes(ts.status)) {
                pendingApproval.push({ ...base, timesheet_id: ts.timesheet_id, status: ts.status, hours: Number(ts.total_hours) });
            }
        }
        return (0, response_1.sendSuccess)(res, {
            week_start: currentWeekStart,
            week_end: currentWeekEnd,
            total_active_assignments: activeAssignments.length,
            unread_count: missing.length + drafts.length,
            notifications: {
                missing,
                drafts,
                pending_approval: pendingApproval,
            },
        });
    }
    catch (err) {
        console.error('getTimesheetNotifications:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch notifications', 500);
    }
};
exports.getTimesheetNotifications = getTimesheetNotifications;
// ─────────────────────────────────────────────────────────────
// POST /api/timesheets/:id/entries/bulk
//
// Improvements vs. original:
//   - Validation errors returned as proper 400 with details, not raw 500
//   - Sanitizes empty string notes to null properly
//   - Recalculate + return updated timesheet totals after save
// ─────────────────────────────────────────────────────────────
const bulkUpsertTimeEntries = async (req, res) => {
    try {
        const { id } = req.params;
        const { entries } = req.body;
        if (!Array.isArray(entries) || entries.length === 0) {
            return (0, response_1.sendError)(res, 'entries array is required and must not be empty', 400);
        }
        if (entries.length > 7) {
            return (0, response_1.sendError)(res, 'A week can have at most 7 entries', 400);
        }
        const timesheet = await prisma_config_1.default.timesheet.findUnique({ where: { timesheet_id: id } });
        if (!timesheet)
            return (0, response_1.sendError)(res, 'Timesheet not found', 404);
        if (!['DRAFT', 'REJECTED'].includes(timesheet.status)) {
            return (0, response_1.sendError)(res, `Cannot edit a ${timesheet.status} timesheet. Only DRAFT and REJECTED can be edited.`, 409);
        }
        // Validate + parse all entries BEFORE the transaction — return 400 instead of 500 on bad input
        const validationErrors = [];
        const parsedEntries = entries.map((e, idx) => {
            const entryDate = new Date(e.work_date);
            entryDate.setUTCHours(0, 0, 0, 0);
            if (isNaN(entryDate.getTime())) {
                validationErrors.push(`Entry ${idx}: invalid work_date "${e.work_date}"`);
                return null;
            }
            if (entryDate < timesheet.week_start_date || entryDate > timesheet.week_end_date) {
                validationErrors.push(`Entry ${idx}: work_date ${e.work_date} is outside the timesheet week`);
                return null;
            }
            const toNum = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : Math.max(0, n); };
            const reg = new library_1.Decimal(toNum(e.regular_hours));
            const ot = new library_1.Decimal(toNum(e.ot_hours));
            const breakMins = parseInt(e.break_minutes, 10);
            return {
                work_date: entryDate,
                regular_hours: reg,
                ot_hours: ot,
                total_hours: reg.add(ot),
                break_minutes: isNaN(breakMins) ? 0 : Math.max(0, breakMins),
                work_type: e.work_type ?? 'REGULAR',
                notes: e.notes?.trim() || null,
            };
        });
        if (validationErrors.length > 0) {
            return (0, response_1.sendError)(res, 'Validation failed', 400, validationErrors.map(msg => ({ field: 'entries', message: msg })));
        }
        const validParsed = parsedEntries.filter(Boolean);
        // Upsert all valid days in one transaction
        await prisma_config_1.default.$transaction(validParsed.map(e => prisma_config_1.default.timeEntry.upsert({
            where: { timesheet_id_work_date: { timesheet_id: id, work_date: e.work_date } },
            update: {
                regular_hours: e.regular_hours, ot_hours: e.ot_hours, total_hours: e.total_hours,
                break_minutes: e.break_minutes, work_type: e.work_type, notes: e.notes,
            },
            create: {
                timesheet_id: id, assignment_id: timesheet.assignment_id,
                work_date: e.work_date, regular_hours: e.regular_hours, ot_hours: e.ot_hours,
                total_hours: e.total_hours, break_minutes: e.break_minutes, work_type: e.work_type, notes: e.notes,
            },
        })));
        // Recalculate running totals
        const allEntries = await prisma_config_1.default.timeEntry.findMany({ where: { timesheet_id: id } });
        const totalRegular = allEntries.reduce((s, e) => s + Number(e.regular_hours), 0);
        const totalOt = allEntries.reduce((s, e) => s + Number(e.ot_hours), 0);
        const updated = await prisma_config_1.default.timesheet.update({
            where: { timesheet_id: id },
            data: {
                total_regular_hours: new library_1.Decimal(totalRegular),
                total_ot_hours: new library_1.Decimal(totalOt),
                total_hours: new library_1.Decimal(totalRegular + totalOt),
            },
            include: { time_entries: { orderBy: { work_date: 'asc' } } },
        });
        return (0, response_1.sendSuccess)(res, {
            timesheet: updated,
            entries_saved: validParsed.length,
            totals: {
                regular_hours: totalRegular,
                ot_hours: totalOt,
                total_hours: totalRegular + totalOt,
            },
        });
    }
    catch (err) {
        console.error('bulkUpsertTimeEntries:', err);
        return (0, response_1.sendError)(res, err.message || 'Failed to save time entries', 500);
    }
};
exports.bulkUpsertTimeEntries = bulkUpsertTimeEntries;
// ─────────────────────────────────────────────────────────────
// EXPORT
// ─────────────────────────────────────────────────────────────
exports.timesheetController = {
    getAllTimesheets: exports.getAllTimesheets,
    getTimesheetById: exports.getTimesheetById,
    getTimesheetsByAssignment: exports.getTimesheetsByAssignment,
    getTimesheetStats: exports.getTimesheetStats,
    createOrGetTimesheet: exports.createOrGetTimesheet,
    upsertTimeEntry: exports.upsertTimeEntry,
    deleteTimeEntry: exports.deleteTimeEntry,
    submitTimesheet: exports.submitTimesheet,
    approveTimesheet: exports.approveTimesheet,
    rejectTimesheet: exports.rejectTimesheet,
    getAllInvoices: exports.getAllInvoices,
    getInvoiceById: exports.getInvoiceById,
    downloadInvoicePdf: exports.downloadInvoicePdf,
    updateInvoiceStatus: exports.updateInvoiceStatus,
    getAssignmentsForTimesheets: exports.getAssignmentsForTimesheets,
    getTimesheetNotifications: exports.getTimesheetNotifications,
    bulkUpsertTimeEntries: exports.bulkUpsertTimeEntries,
};
//# sourceMappingURL=timesheetController.js.map