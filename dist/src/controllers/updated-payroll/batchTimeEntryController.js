"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.transactionBatchController = exports.getBatchReport = exports.closeBatch = exports.verifyBatch = exports.deleteTransactionLine = exports.updateTransactionLine = exports.addTransactionLine = exports.deleteTransaction = exports.updateTransaction = exports.getTransactionById = exports.importTransactionFromTimesheet = exports.createTransaction = exports.deleteBatch = exports.updateBatch = exports.getBatchById = exports.getAllBatches = exports.createBatch = exports.getAssignmentShortcut = exports.getJobShortcut = exports.getOrganizationShortcut = exports.getApplicantShortcut = exports.getAssignmentTimesheets = exports.getEarningTypes = exports.getJobRatesForAssignment = exports.getAssignmentContextForTransaction = exports.getApplicantAssignments = exports.searchApplicantsForPayroll = void 0;
const prisma_config_1 = __importDefault(require("../../prisma.config"));
const response_1 = require("../../utils/response");
// If you already have an SSN decrypt helper (referenced by
// ApplicantDemographic.ssn_encrypted / tax_info), point this import at it.
// This controller only ever needs the LAST 4 digits for masking, so if
// that helper isn't wired up yet, maskSsn() below just falls back safely.
// import { decryptSSN } from '../../utils/encryption';
// ============================================================
// HELPERS
// ============================================================
function toNum(v) {
    if (v === null || v === undefined)
        return 0;
    return typeof v === 'object' && typeof v.toNumber === 'function' ? v.toNumber() : Number(v);
}
function maskSsn(ssnEncrypted) {
    if (!ssnEncrypted)
        return null;
    try {
        // Swap in your real decrypt call here, e.g.:
        // const plain = decryptSSN(ssnEncrypted);
        // return `***-**-${plain.slice(-4)}`;
        return '***-**-****';
    }
    catch {
        return '***-**-****';
    }
}
function computeLineTotals(line) {
    return {
        item_pay: Number((line.pay_units * line.pay_rate).toFixed(2)),
        item_bill: Number((line.bill_units * line.bill_rate).toFixed(2)),
    };
}
// Resolves everything the header form needs from just an assignment_id:
// employee name/SSN, bill-to org, order/job, branch, position.
async function resolveAssignmentContext(assignment_id) {
    const assignment = await prisma_config_1.default.assignment.findUnique({
        where: { assignment_id },
        include: {
            application: {
                include: {
                    applicant: { include: { contact: true, demographic: true } },
                    job: { include: { organization: true } },
                },
            },
        },
    });
    if (!assignment)
        return null;
    const applicant = assignment.application?.applicant;
    const job = assignment.application?.job;
    const organization = job?.organization;
    return {
        assignment,
        employee_name: applicant?.full_name ?? null,
        employee_ssn_masked: maskSsn(applicant?.demographic?.ssn_encrypted),
        organization_id: organization?.organization_id ?? null,
        bill_to: organization?.name ?? null,
        job_id: job?.job_id ?? null,
        order_id: job?.custom_job_id ?? job?.job_id ?? null,
        job_position: job?.job_title ?? null,
        branch: job?.job_branch ?? organization?.branch_name ?? null,
    };
}
// Recalculates and persists the grand-summary cache on a transaction
// from its current set of lines. Call after any line create/update/delete.
async function recalcTransactionTotals(transaction_id) {
    const lines = await prisma_config_1.default.payrollTransactionLine.findMany({ where: { transaction_id } });
    let total_pay_units = 0;
    let total_bill_units = 0;
    let total_pay_amount = 0;
    let total_bill_amount = 0;
    for (const l of lines) {
        total_pay_units += toNum(l.pay_units);
        total_bill_units += toNum(l.bill_units);
        total_pay_amount += toNum(l.item_pay);
        total_bill_amount += toNum(l.item_bill);
    }
    return prisma_config_1.default.payrollTransaction.update({
        where: { transaction_id },
        data: {
            total_pay_units,
            total_bill_units,
            total_pay_amount,
            total_bill_amount,
        },
    });
}
// ============================================================
// LOOKUP / SEARCH ENDPOINTS (for the frontend form's search-based
// dropdowns — employee search -> pick assignment -> autofill preview)
// ============================================================
// GET /applicants/search?q=&limit=
// Step 1 of the employee picker: type-ahead search by name or email.
// Only returns applicants who actually have at least one assignment
// (i.e. have been placed), since unplaced applicants can't be paid.
const searchApplicantsForPayroll = async (req, res) => {
    try {
        const { q, limit } = req.query;
        if (!q || String(q).trim().length < 2) {
            return (0, response_1.sendError)(res, 'Query must be at least 2 characters', 400);
        }
        const take = limit ? Math.min(Number(limit), 50) : 20;
        const applicants = await prisma_config_1.default.applicant.findMany({
            where: {
                applications: { some: { assignment: { isNot: null } } },
                OR: [
                    { full_name: { contains: String(q), mode: 'insensitive' } },
                    { contact: { email: { contains: String(q), mode: 'insensitive' } } },
                ],
            },
            take,
            orderBy: { full_name: 'asc' },
            select: {
                applicant_id: true,
                full_name: true,
                contact: { select: { email: true, phone: true } },
                applications: {
                    where: { assignment: { isNot: null } },
                    select: { assignment: { select: { assignment_id: true } } },
                },
            },
        });
        const results = applicants.map((a) => ({
            applicant_id: a.applicant_id,
            employee_name: a.full_name,
            email: a.contact?.email ?? null,
            phone: a.contact?.phone ?? null,
            assignment_count: a.applications.length,
            // If they only have exactly one assignment, the frontend can skip
            // the second picker step and jump straight to the context preview.
            single_assignment_id: a.applications.length === 1 ? a.applications[0].assignment.assignment_id : null,
        }));
        return (0, response_1.sendSuccess)(res, { applicants: results });
    }
    catch (err) {
        console.error('Error searching applicants:', err);
        return (0, response_1.sendError)(res, 'Failed to search applicants', 500);
    }
};
exports.searchApplicantsForPayroll = searchApplicantsForPayroll;
// GET /applicants/:applicantId/assignments
// Step 2 of the employee picker: once an employee is chosen, list all of
// their assignments so the user can select the correct one (mirrors
// Avionte's "employee has multiple assignments" behavior).
const getApplicantAssignments = async (req, res) => {
    try {
        const { applicantId } = req.params;
        const assignments = await prisma_config_1.default.assignment.findMany({
            where: { application: { applicant_id: applicantId } },
            orderBy: { start_date: 'desc' },
            include: {
                application: {
                    include: {
                        job: {
                            include: {
                                organization: { select: { organization_id: true, name: true, branch_name: true } },
                            },
                        },
                    },
                },
            },
        });
        if (!assignments.length)
            return (0, response_1.sendError)(res, 'No assignments found for this applicant', 404);
        const results = assignments.map((a) => {
            const job = a.application?.job;
            const organization = job?.organization;
            const is_active = !a.end_date || new Date(a.end_date) >= new Date();
            return {
                assignment_id: a.assignment_id,
                job_position: job?.job_title ?? null,
                order_id: job?.custom_job_id ?? job?.job_id ?? null,
                bill_to: organization?.name ?? null,
                branch: job?.job_branch ?? organization?.branch_name ?? null,
                employment_type: a.employment_type,
                start_date: a.start_date,
                end_date: a.end_date,
                is_active,
            };
        });
        return (0, response_1.sendSuccess)(res, { assignments: results });
    }
    catch (err) {
        console.error('Error fetching applicant assignments:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch assignments', 500);
    }
};
exports.getApplicantAssignments = getApplicantAssignments;
// GET /assignments/:assignmentId/context
// Step 3: once an assignment is picked (either directly, or after the
// two steps above), fetch everything the header form auto-fills —
// Employee Name, Bill To, Order ID, Job Position, Branch, and the
// hire rates used to pre-seed the Regular line — WITHOUT creating a
// transaction yet. Lets the frontend show a preview before submit.
const getAssignmentContextForTransaction = async (req, res) => {
    try {
        const { assignmentId } = req.params;
        const context = await resolveAssignmentContext(assignmentId);
        if (!context)
            return (0, response_1.sendError)(res, 'Assignment not found', 404);
        return (0, response_1.sendSuccess)(res, {
            assignment_id: assignmentId,
            employee_name: context.employee_name,
            employee_ssn_masked: context.employee_ssn_masked,
            organization_id: context.organization_id,
            bill_to: context.bill_to,
            job_id: context.job_id,
            order_id: context.order_id,
            job_position: context.job_position,
            branch: context.branch,
            hire_pay_rate: toNum(context.assignment.hire_pay_rate),
            hire_bill_rate: toNum(context.assignment.hire_bill_rate),
            hire_ot_pay_rate: toNum(context.assignment.hire_ot_pay_rate),
            hire_ot_bill_rate: toNum(context.assignment.hire_ot_bill_rate),
            employment_type: context.assignment.employment_type,
            start_date: context.assignment.start_date,
            end_date: context.assignment.end_date,
        });
    }
    catch (err) {
        console.error('Error fetching assignment context:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch assignment context', 500);
    }
};
exports.getAssignmentContextForTransaction = getAssignmentContextForTransaction;
// GET /assignments/:assignmentId/job-rates
// Rate autofill for the Detail Grid. An Assignment only freezes
// Regular + OT rates at hire time (hire_pay_rate/hire_bill_rate/
// hire_ot_pay_rate/hire_ot_bill_rate) — there's no hire_dt_* field, so
// Double Time (and anything the assignment didn't freeze) has to fall
// back to the Job's JobRate row. A job can have several JobRate "tiers"
// (different `hours` breakpoints); we treat the lowest-hours tier as
// the base/primary rate card. Priority per earning type:
//   1. Assignment's frozen hire rate (if present) — this is what the
//      employee was actually placed at and should win.
//   2. The primary JobRate tier.
//   3. 0 (frontend should treat 0 as "needs manual entry").
const getJobRatesForAssignment = async (req, res) => {
    try {
        const { assignmentId } = req.params;
        const assignment = await prisma_config_1.default.assignment.findUnique({
            where: { assignment_id: assignmentId },
            include: {
                application: {
                    include: {
                        job: { include: { job_rates: true } },
                    },
                },
            },
        });
        if (!assignment)
            return (0, response_1.sendError)(res, 'Assignment not found', 404);
        const job = assignment.application?.job;
        const jobRates = job?.job_rates ?? [];
        const primary = jobRates.length
            ? [...jobRates].sort((a, b) => (a.hours ?? 0) - (b.hours ?? 0))[0]
            : null;
        const regularPay = toNum(assignment.hire_pay_rate) || toNum(primary?.pay_rate);
        const regularBill = toNum(assignment.hire_bill_rate) || toNum(primary?.bill_rate);
        const otPay = toNum(assignment.hire_ot_pay_rate) || toNum(primary?.ot_pay_rate);
        const otBill = toNum(assignment.hire_ot_bill_rate) || toNum(primary?.ot_bill_rate);
        const dtPay = toNum(primary?.dt_pay_rate);
        const dtBill = toNum(primary?.dt_bill_rate);
        // Holiday/PTO/Sick don't have their own rate fields anywhere in the
        // schema today — they're paid at the Regular rate by convention.
        // Bonus is a flat amount, so it defaults to 0/0 (units = dollar amount).
        const suggested_rates = {
            REGULAR: { pay_rate: regularPay, bill_rate: regularBill },
            OVERTIME: { pay_rate: otPay, bill_rate: otBill },
            DOUBLETIME: { pay_rate: dtPay, bill_rate: dtBill },
            HOLIDAY: { pay_rate: regularPay, bill_rate: regularBill },
            PTO: { pay_rate: regularPay, bill_rate: regularBill },
            SICK: { pay_rate: regularPay, bill_rate: regularBill },
            BONUS: { pay_rate: 0, bill_rate: 0 },
        };
        return (0, response_1.sendSuccess)(res, {
            assignment_id: assignmentId,
            job_id: job?.job_id ?? null,
            job_rate_tiers: jobRates.map((r) => ({
                job_rate_id: r.job_rate_id,
                hours: r.hours,
                pay_rate: toNum(r.pay_rate),
                bill_rate: toNum(r.bill_rate),
                ot_pay_rate: toNum(r.ot_pay_rate),
                ot_bill_rate: toNum(r.ot_bill_rate),
                dt_pay_rate: toNum(r.dt_pay_rate),
                dt_bill_rate: toNum(r.dt_bill_rate),
                markup_percentage: toNum(r.markup_percentage),
                overtime_rule: r.overtime_rule,
            })),
            suggested_rates,
        });
    }
    catch (err) {
        console.error('Error fetching job rates for assignment:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch job rates', 500);
    }
};
exports.getJobRatesForAssignment = getJobRatesForAssignment;
// GET /earning-types
// Static lookup for the Detail Grid's "Type" dropdown (Regular, OT, DT,
// Holiday, PTO, Sick, Bonus). Kept server-side so the label wording is
// centralized and can change without a frontend redeploy.
const getEarningTypes = async (_req, res) => {
    const earning_types = [
        { value: 'REGULAR', label: 'Regular' },
        { value: 'OVERTIME', label: 'Overtime' },
        { value: 'DOUBLETIME', label: 'Double Time' },
        { value: 'HOLIDAY', label: 'Holiday' },
        { value: 'PTO', label: 'PTO' },
        { value: 'SICK', label: 'Sick' },
        { value: 'BONUS', label: 'Bonus' },
    ];
    // Previously-created custom labels, so users can reuse ones they (or
    // teammates) already typed instead of retyping every time.
    const custom = await prisma_config_1.default.customEarningType.findMany({ orderBy: { label: 'asc' } });
    const custom_earning_types = custom.map((c) => ({
        value: 'OTHER',
        label: c.label,
        custom_label: c.label,
        is_custom: true,
    }));
    return (0, response_1.sendSuccess)(res, { earning_types, custom_earning_types });
};
exports.getEarningTypes = getEarningTypes;
// GET /assignments/:assignmentId/timesheets?status=APPROVED
// Feeds the "Import from Timesheet" picker — only approved (or already
// processed) timesheets make sense to pull payroll numbers from.
const getAssignmentTimesheets = async (req, res) => {
    try {
        const { assignmentId } = req.params;
        const { status } = req.query;
        const timesheets = await prisma_config_1.default.timesheet.findMany({
            where: {
                assignment_id: assignmentId,
                ...(status ? { status } : { status: { in: ['APPROVED', 'PROCESSED'] } }),
            },
            orderBy: { week_start_date: 'desc' },
        });
        const results = timesheets.map((t) => ({
            timesheet_id: t.timesheet_id,
            week_start_date: t.week_start_date,
            week_end_date: t.week_end_date,
            status: t.status,
            total_regular_hours: toNum(t.total_regular_hours),
            total_ot_hours: toNum(t.total_ot_hours),
            total_hours: toNum(t.total_hours),
        }));
        return (0, response_1.sendSuccess)(res, { timesheets: results });
    }
    catch (err) {
        console.error('Error fetching assignment timesheets:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch timesheets', 500);
    }
};
exports.getAssignmentTimesheets = getAssignmentTimesheets;
// ============================================================
// "SHORTCUT" NAVIGATION ENDPOINTS
// (the View Employee / View Customer / View Order / View Assignment
// buttons on the transaction form — no data is stored here, these just
// give the frontend enough to render a quick detail panel or route to
// the full Employee/Customer/Order/Assignment page elsewhere in the CRM.)
// ============================================================
// GET /shortcuts/applicants/:applicantId
const getApplicantShortcut = async (req, res) => {
    try {
        const { applicantId } = req.params;
        const applicant = await prisma_config_1.default.applicant.findUnique({
            where: { applicant_id: applicantId },
            include: { contact: true },
        });
        if (!applicant)
            return (0, response_1.sendError)(res, 'Applicant not found', 404);
        return (0, response_1.sendSuccess)(res, {
            applicant_id: applicant.applicant_id,
            full_name: applicant.full_name,
            status: applicant.status,
            email: applicant.contact?.email ?? null,
            phone: applicant.contact?.phone ?? null,
            city: applicant.contact?.city ?? null,
            state: applicant.contact?.state ?? null,
        });
    }
    catch (err) {
        console.error('Error fetching applicant shortcut:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch applicant', 500);
    }
};
exports.getApplicantShortcut = getApplicantShortcut;
// GET /shortcuts/organizations/:organizationId
const getOrganizationShortcut = async (req, res) => {
    try {
        const { organizationId } = req.params;
        const organization = await prisma_config_1.default.organization.findUnique({
            where: { organization_id: organizationId },
        });
        if (!organization)
            return (0, response_1.sendError)(res, 'Organization not found', 404);
        return (0, response_1.sendSuccess)(res, {
            organization_id: organization.organization_id,
            name: organization.name,
            status: organization.status,
            phone: organization.phone,
            branch_name: organization.branch_name,
            branch_region: organization.branch_region,
            custom_company_id: organization.custom_company_id,
        });
    }
    catch (err) {
        console.error('Error fetching organization shortcut:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch organization', 500);
    }
};
exports.getOrganizationShortcut = getOrganizationShortcut;
// GET /shortcuts/jobs/:jobId
const getJobShortcut = async (req, res) => {
    try {
        const { jobId } = req.params;
        const job = await prisma_config_1.default.job.findUnique({
            where: { job_id: jobId },
            include: { organization: { select: { organization_id: true, name: true } } },
        });
        if (!job)
            return (0, response_1.sendError)(res, 'Job not found', 404);
        return (0, response_1.sendSuccess)(res, {
            job_id: job.job_id,
            custom_job_id: job.custom_job_id,
            job_title: job.job_title,
            status: job.status,
            job_branch: job.job_branch,
            organization_id: job.organization?.organization_id ?? null,
            organization_name: job.organization?.name ?? null,
            po_number: job.po_number,
            po_amount: toNum(job.po_amount),
        });
    }
    catch (err) {
        console.error('Error fetching job shortcut:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch job', 500);
    }
};
exports.getJobShortcut = getJobShortcut;
// GET /shortcuts/assignments/:assignmentId
const getAssignmentShortcut = async (req, res) => {
    try {
        const { assignmentId } = req.params;
        const context = await resolveAssignmentContext(assignmentId);
        if (!context)
            return (0, response_1.sendError)(res, 'Assignment not found', 404);
        return (0, response_1.sendSuccess)(res, {
            assignment_id: assignmentId,
            employee_name: context.employee_name,
            bill_to: context.bill_to,
            order_id: context.order_id,
            job_position: context.job_position,
            branch: context.branch,
            employment_type: context.assignment.employment_type,
            start_date: context.assignment.start_date,
            end_date: context.assignment.end_date,
            falloff: context.assignment.falloff,
        });
    }
    catch (err) {
        console.error('Error fetching assignment shortcut:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch assignment', 500);
    }
};
exports.getAssignmentShortcut = getAssignmentShortcut;
// ============================================================
// BATCH CRUD
// ============================================================
// POST /batches
const createBatch = async (req, res) => {
    try {
        const { accounting_period, description } = req.body;
        const created_by_user_id = req.user?.user_id;
        if (!accounting_period)
            return (0, response_1.sendError)(res, 'accounting_period is required', 400);
        if (!created_by_user_id)
            return (0, response_1.sendError)(res, 'Unauthorized', 401);
        const batch = await prisma_config_1.default.transactionBatch.create({
            data: {
                accounting_period: new Date(accounting_period),
                description: description || null,
                created_by_user_id,
            },
            include: {
                created_by: { select: { user_id: true, name: true } },
            },
        });
        return (0, response_1.sendSuccess)(res, { batch }, 201);
    }
    catch (err) {
        console.error('Error creating batch:', err);
        return (0, response_1.sendError)(res, 'Failed to create batch', 500);
    }
};
exports.createBatch = createBatch;
// GET /batches?status=&from=&to=
const getAllBatches = async (req, res) => {
    try {
        const { status, from, to } = req.query;
        const where = {};
        if (status)
            where.status = status;
        if (from || to) {
            where.created_date = {};
            if (from)
                where.created_date.gte = new Date(from);
            if (to)
                where.created_date.lte = new Date(to);
        }
        const batches = await prisma_config_1.default.transactionBatch.findMany({
            where,
            orderBy: { created_date: 'desc' },
            include: {
                created_by: { select: { user_id: true, name: true } },
                _count: { select: { transactions: true } },
            },
        });
        return (0, response_1.sendSuccess)(res, { batches });
    }
    catch (err) {
        console.error('Error fetching batches:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch batches', 500);
    }
};
exports.getAllBatches = getAllBatches;
// GET /batches/:batchId  (full batch summary grid — bottom of image 2)
const getBatchById = async (req, res) => {
    try {
        const { batchId } = req.params;
        const batch = await prisma_config_1.default.transactionBatch.findUnique({
            where: { batch_id: batchId },
            include: {
                created_by: { select: { user_id: true, name: true } },
                transactions: {
                    include: {
                        organization: { select: { organization_id: true, name: true, branch_name: true } },
                        job: { select: { job_id: true, job_title: true, custom_job_id: true } },
                        assignment: {
                            include: {
                                application: {
                                    include: { applicant: { select: { full_name: true } } },
                                },
                            },
                        },
                        lines: true,
                    },
                },
            },
        });
        if (!batch)
            return (0, response_1.sendError)(res, 'Batch not found', 404);
        // Shape the "Batch Summary Grid" rows (Bill To / Department / Customer /
        // Branch / Staffing Order / Week Worked / Employee / Total Pay / Total Bill)
        const summary_grid = batch.transactions.map((t) => ({
            transaction_id: t.transaction_id,
            transaction_number: t.transaction_number,
            bill_to: t.organization?.name ?? null,
            department: t.department,
            branch: t.branch,
            staffing_order: t.job?.custom_job_id ?? t.job?.job_id ?? null,
            week_worked: t.week_worked,
            employee: t.assignment?.application?.applicant?.full_name ?? null,
            total_pay: toNum(t.total_pay_amount),
            total_bill: toNum(t.total_bill_amount),
            status: t.status,
        }));
        return (0, response_1.sendSuccess)(res, { batch, summary_grid });
    }
    catch (err) {
        console.error('Error fetching batch:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch batch', 500);
    }
};
exports.getBatchById = getBatchById;
// PATCH /batches/:batchId  (only while OPEN)
const updateBatch = async (req, res) => {
    try {
        const { batchId } = req.params;
        const { accounting_period, description } = req.body;
        const existing = await prisma_config_1.default.transactionBatch.findUnique({ where: { batch_id: batchId } });
        if (!existing)
            return (0, response_1.sendError)(res, 'Batch not found', 404);
        if (existing.status !== 'OPEN')
            return (0, response_1.sendError)(res, 'Only OPEN batches can be edited', 400);
        const batch = await prisma_config_1.default.transactionBatch.update({
            where: { batch_id: batchId },
            data: {
                ...(accounting_period !== undefined && { accounting_period: new Date(accounting_period) }),
                ...(description !== undefined && { description }),
            },
        });
        return (0, response_1.sendSuccess)(res, { batch });
    }
    catch (err) {
        console.error('Error updating batch:', err);
        return (0, response_1.sendError)(res, 'Failed to update batch', 500);
    }
};
exports.updateBatch = updateBatch;
// DELETE /batches/:batchId  (only while OPEN)
const deleteBatch = async (req, res) => {
    try {
        const { batchId } = req.params;
        const existing = await prisma_config_1.default.transactionBatch.findUnique({ where: { batch_id: batchId } });
        if (!existing)
            return (0, response_1.sendError)(res, 'Batch not found', 404);
        if (existing.status !== 'OPEN')
            return (0, response_1.sendError)(res, 'Only OPEN batches can be deleted', 400);
        // Cascade deletes transactions + lines (onDelete: Cascade on FK).
        await prisma_config_1.default.transactionBatch.delete({ where: { batch_id: batchId } });
        return (0, response_1.sendSuccess)(res, { message: 'Batch deleted.' });
    }
    catch (err) {
        console.error('Error deleting batch:', err);
        return (0, response_1.sendError)(res, 'Failed to delete batch', 500);
    }
};
exports.deleteBatch = deleteBatch;
// ============================================================
// TRANSACTIONS (one employee/assignment/week within a batch)
// ============================================================
// POST /batches/:batchId/transactions
// body: { assignment_id, week_worked, department?, job_position?, branch?, bill_units_equal_pay_units? }
const createTransaction = async (req, res) => {
    try {
        const { batchId } = req.params;
        const { assignment_id, week_worked, department, job_position, branch, bill_units_equal_pay_units } = req.body;
        if (!assignment_id)
            return (0, response_1.sendError)(res, 'assignment_id is required', 400);
        if (!week_worked)
            return (0, response_1.sendError)(res, 'week_worked is required', 400);
        const batch = await prisma_config_1.default.transactionBatch.findUnique({ where: { batch_id: batchId } });
        if (!batch)
            return (0, response_1.sendError)(res, 'Batch not found', 404);
        if (batch.status !== 'OPEN')
            return (0, response_1.sendError)(res, 'Cannot add transactions to a non-OPEN batch', 400);
        const context = await resolveAssignmentContext(assignment_id);
        if (!context)
            return (0, response_1.sendError)(res, 'Assignment not found', 404);
        if (!context.organization_id)
            return (0, response_1.sendError)(res, 'Could not resolve Bill To organization for this assignment', 400);
        // Prevent creating two transactions for the same assignment + week in
        // the same batch (mirrors the Timesheet uniqueness rule).
        const duplicate = await prisma_config_1.default.payrollTransaction.findFirst({
            where: { batch_id: batchId, assignment_id, week_worked: new Date(week_worked) },
        });
        if (duplicate) {
            return (0, response_1.sendError)(res, 'A transaction for this assignment and week already exists in this batch', 409);
        }
        const transaction = await prisma_config_1.default.payrollTransaction.create({
            data: {
                batch_id: batchId,
                assignment_id,
                organization_id: context.organization_id,
                job_id: context.job_id,
                department: department ?? null,
                job_position: job_position ?? context.job_position,
                branch: branch ?? context.branch,
                week_worked: new Date(week_worked),
                bill_units_equal_pay_units: !!bill_units_equal_pay_units,
            },
        });
        // Pre-seed a Regular line using the assignment's hire rates, if present,
        // matching Avionte's behavior of defaulting the grid to a Reg row.
        const assignment = context.assignment;
        if (assignment?.hire_pay_rate != null || assignment?.hire_bill_rate != null) {
            const pay_rate = toNum(assignment.hire_pay_rate);
            const bill_rate = toNum(assignment.hire_bill_rate);
            const totals = computeLineTotals({ pay_units: 0, bill_units: 0, pay_rate, bill_rate });
            await prisma_config_1.default.payrollTransactionLine.create({
                data: {
                    transaction_id: transaction.transaction_id,
                    earning_type: 'REGULAR',
                    pay_units: 0,
                    bill_units: 0,
                    pay_rate,
                    bill_rate,
                    ...totals,
                },
            });
        }
        const full = await getTransactionWithContext(transaction.transaction_id);
        return (0, response_1.sendSuccess)(res, { transaction: full }, 201);
    }
    catch (err) {
        console.error('Error creating transaction:', err);
        return (0, response_1.sendError)(res, 'Failed to create transaction', 500);
    }
};
exports.createTransaction = createTransaction;
// POST /batches/:batchId/transactions/import-timesheet
// body: { timesheet_id }
// Creates a transaction + Regular/OT lines pre-filled from an approved
// Timesheet's hours and rate snapshot, instead of manually re-entering them.
const importTransactionFromTimesheet = async (req, res) => {
    try {
        const { batchId } = req.params;
        const { timesheet_id } = req.body;
        if (!timesheet_id)
            return (0, response_1.sendError)(res, 'timesheet_id is required', 400);
        const batch = await prisma_config_1.default.transactionBatch.findUnique({ where: { batch_id: batchId } });
        if (!batch)
            return (0, response_1.sendError)(res, 'Batch not found', 404);
        if (batch.status !== 'OPEN')
            return (0, response_1.sendError)(res, 'Cannot add transactions to a non-OPEN batch', 400);
        const timesheet = await prisma_config_1.default.timesheet.findUnique({ where: { timesheet_id } });
        if (!timesheet)
            return (0, response_1.sendError)(res, 'Timesheet not found', 404);
        if (!['APPROVED', 'PROCESSED'].includes(timesheet.status)) {
            return (0, response_1.sendError)(res, 'Only APPROVED or PROCESSED timesheets can be imported', 400);
        }
        const assignment_id = timesheet.assignment_id;
        const week_worked = timesheet.week_start_date;
        const duplicate = await prisma_config_1.default.payrollTransaction.findFirst({
            where: { batch_id: batchId, assignment_id, week_worked },
        });
        if (duplicate) {
            return (0, response_1.sendError)(res, 'A transaction for this assignment and week already exists in this batch', 409);
        }
        const context = await resolveAssignmentContext(assignment_id);
        if (!context)
            return (0, response_1.sendError)(res, 'Assignment not found', 404);
        if (!context.organization_id)
            return (0, response_1.sendError)(res, 'Could not resolve Bill To organization for this assignment', 400);
        const transaction = await prisma_config_1.default.payrollTransaction.create({
            data: {
                batch_id: batchId,
                assignment_id,
                organization_id: context.organization_id,
                job_id: context.job_id,
                job_position: context.job_position,
                branch: context.branch,
                week_worked,
                bill_units_equal_pay_units: false,
            },
        });
        // Rate priority: whatever the timesheet actually billed at (custom
        // override, then its frozen snapshot), falling back to the
        // assignment's hire rates if the timesheet never carried its own.
        const payRate = toNum(timesheet.custom_pay_rate) || toNum(timesheet.pay_rate) || toNum(context.assignment.hire_pay_rate);
        const billRate = toNum(timesheet.custom_bill_rate) || toNum(timesheet.bill_rate) || toNum(context.assignment.hire_bill_rate);
        const otPayRate = toNum(timesheet.custom_ot_pay_rate) || toNum(timesheet.ot_pay_rate) || toNum(context.assignment.hire_ot_pay_rate);
        const otBillRate = toNum(timesheet.custom_ot_bill_rate) || toNum(timesheet.ot_bill_rate) || toNum(context.assignment.hire_ot_bill_rate);
        const regularHours = toNum(timesheet.total_regular_hours);
        const otHours = toNum(timesheet.total_ot_hours);
        const linesToCreate = [];
        if (regularHours > 0 || payRate > 0) {
            const totals = computeLineTotals({ pay_units: regularHours, bill_units: regularHours, pay_rate: payRate, bill_rate: billRate });
            linesToCreate.push({
                transaction_id: transaction.transaction_id, earning_type: 'REGULAR',
                pay_units: regularHours, bill_units: regularHours, pay_rate: payRate, bill_rate: billRate, ...totals,
            });
        }
        if (otHours > 0) {
            const totals = computeLineTotals({ pay_units: otHours, bill_units: otHours, pay_rate: otPayRate, bill_rate: otBillRate });
            linesToCreate.push({
                transaction_id: transaction.transaction_id, earning_type: 'OVERTIME',
                pay_units: otHours, bill_units: otHours, pay_rate: otPayRate, bill_rate: otBillRate, ...totals,
            });
        }
        if (linesToCreate.length) {
            await prisma_config_1.default.payrollTransactionLine.createMany({ data: linesToCreate });
        }
        await recalcTransactionTotals(transaction.transaction_id);
        const full = await getTransactionWithContext(transaction.transaction_id);
        return (0, response_1.sendSuccess)(res, { transaction: full }, 201);
    }
    catch (err) {
        console.error('Error importing transaction from timesheet:', err);
        return (0, response_1.sendError)(res, 'Failed to import transaction from timesheet', 500);
    }
};
exports.importTransactionFromTimesheet = importTransactionFromTimesheet;
async function getTransactionWithContext(transaction_id) {
    const t = await prisma_config_1.default.payrollTransaction.findUnique({
        where: { transaction_id },
        include: {
            organization: { select: { organization_id: true, name: true } },
            job: { select: { job_id: true, job_title: true, custom_job_id: true } },
            assignment: {
                include: {
                    application: {
                        include: { applicant: { include: { contact: true, demographic: true } } },
                    },
                },
            },
            lines: true,
            batch: { select: { batch_id: true, batch_number: true, status: true } },
        },
    });
    if (!t)
        return null;
    const applicant = t.assignment?.application?.applicant;
    return {
        ...t,
        employee_name: applicant?.full_name ?? null,
        employee_ssn_masked: maskSsn(applicant?.demographic?.ssn_encrypted),
        bill_to: t.organization?.name ?? null,
        order_id: t.job?.custom_job_id ?? t.job?.job_id ?? null,
    };
}
// GET /transactions/:transactionId  (the full form + grid from image 2)
const getTransactionById = async (req, res) => {
    try {
        const { transactionId } = req.params;
        const transaction = await getTransactionWithContext(transactionId);
        if (!transaction)
            return (0, response_1.sendError)(res, 'Transaction not found', 404);
        return (0, response_1.sendSuccess)(res, { transaction });
    }
    catch (err) {
        console.error('Error fetching transaction:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch transaction', 500);
    }
};
exports.getTransactionById = getTransactionById;
// PATCH /transactions/:transactionId  (header fields only)
const updateTransaction = async (req, res) => {
    try {
        const { transactionId } = req.params;
        const { department, job_position, branch, week_worked, bill_units_equal_pay_units } = req.body;
        const existing = await prisma_config_1.default.payrollTransaction.findUnique({
            where: { transaction_id: transactionId },
            include: { batch: true },
        });
        if (!existing)
            return (0, response_1.sendError)(res, 'Transaction not found', 404);
        if (existing.batch.status !== 'OPEN')
            return (0, response_1.sendError)(res, 'Batch is not OPEN', 400);
        // If bill_units_equal_pay_units is being flipped ON, sync all existing
        // lines' bill_units to their pay_units and recompute totals so the
        // checkbox behaves consistently with lines added after the fact.
        const transaction = await prisma_config_1.default.payrollTransaction.update({
            where: { transaction_id: transactionId },
            data: {
                ...(department !== undefined && { department }),
                ...(job_position !== undefined && { job_position }),
                ...(branch !== undefined && { branch }),
                ...(week_worked !== undefined && { week_worked: new Date(week_worked) }),
                ...(bill_units_equal_pay_units !== undefined && { bill_units_equal_pay_units }),
            },
        });
        if (bill_units_equal_pay_units === true) {
            const lines = await prisma_config_1.default.payrollTransactionLine.findMany({ where: { transaction_id: transactionId } });
            for (const l of lines) {
                const bill_units = toNum(l.pay_units);
                const totals = computeLineTotals({
                    pay_units: toNum(l.pay_units),
                    bill_units,
                    pay_rate: toNum(l.pay_rate),
                    bill_rate: toNum(l.bill_rate),
                });
                await prisma_config_1.default.payrollTransactionLine.update({
                    where: { line_id: l.line_id },
                    data: { bill_units, ...totals },
                });
            }
            await recalcTransactionTotals(transactionId);
        }
        return (0, response_1.sendSuccess)(res, { transaction });
    }
    catch (err) {
        console.error('Error updating transaction:', err);
        return (0, response_1.sendError)(res, 'Failed to update transaction', 500);
    }
};
exports.updateTransaction = updateTransaction;
// DELETE /transactions/:transactionId
const deleteTransaction = async (req, res) => {
    try {
        const { transactionId } = req.params;
        const existing = await prisma_config_1.default.payrollTransaction.findUnique({
            where: { transaction_id: transactionId },
            include: { batch: true },
        });
        if (!existing)
            return (0, response_1.sendError)(res, 'Transaction not found', 404);
        if (existing.batch.status !== 'OPEN')
            return (0, response_1.sendError)(res, 'Batch is not OPEN', 400);
        await prisma_config_1.default.payrollTransaction.delete({ where: { transaction_id: transactionId } });
        return (0, response_1.sendSuccess)(res, { message: 'Transaction deleted.' });
    }
    catch (err) {
        console.error('Error deleting transaction:', err);
        return (0, response_1.sendError)(res, 'Failed to delete transaction', 500);
    }
};
exports.deleteTransaction = deleteTransaction;
// ============================================================
// TRANSACTION LINES (the earning-type grid: Reg/OT/DT/Holiday/PTO/Sick/Bonus)
// ============================================================
// POST /transactions/:transactionId/lines
const addTransactionLine = async (req, res) => {
    try {
        const { transactionId } = req.params;
        const { earning_type, custom_earning_label, pay_units, bill_units, pay_rate, bill_rate } = req.body;
        const existing = await prisma_config_1.default.payrollTransaction.findUnique({
            where: { transaction_id: transactionId },
            include: { batch: true },
        });
        if (!existing)
            return (0, response_1.sendError)(res, 'Transaction not found', 404);
        if (existing.batch.status !== 'OPEN')
            return (0, response_1.sendError)(res, 'Batch is not OPEN', 400);
        const resolvedType = earning_type || 'REGULAR';
        let resolvedLabel = null;
        if (resolvedType === 'OTHER') {
            if (!custom_earning_label || !String(custom_earning_label).trim()) {
                return (0, response_1.sendError)(res, 'custom_earning_label is required when earning_type is OTHER', 400);
            }
            resolvedLabel = String(custom_earning_label).trim();
            // Remember it so it shows up in the dropdown for next time.
            await prisma_config_1.default.customEarningType.upsert({
                where: { label: resolvedLabel },
                update: {},
                create: { label: resolvedLabel, created_by_user_id: req.user?.user_id ?? null },
            });
        }
        const values = {
            pay_units: toNum(pay_units),
            bill_units: existing.bill_units_equal_pay_units ? toNum(pay_units) : toNum(bill_units),
            pay_rate: toNum(pay_rate),
            bill_rate: toNum(bill_rate),
        };
        const totals = computeLineTotals(values);
        const line = await prisma_config_1.default.payrollTransactionLine.create({
            data: {
                transaction_id: transactionId,
                earning_type: resolvedType,
                custom_earning_label: resolvedLabel,
                ...values,
                ...totals,
            },
        });
        await recalcTransactionTotals(transactionId);
        return (0, response_1.sendSuccess)(res, { line }, 201);
    }
    catch (err) {
        console.error('Error adding transaction line:', err);
        return (0, response_1.sendError)(res, 'Failed to add line', 500);
    }
};
exports.addTransactionLine = addTransactionLine;
// PATCH /lines/:lineId
const updateTransactionLine = async (req, res) => {
    try {
        const { lineId } = req.params;
        const { earning_type, custom_earning_label, pay_units, bill_units, pay_rate, bill_rate } = req.body;
        const existingLine = await prisma_config_1.default.payrollTransactionLine.findUnique({
            where: { line_id: lineId },
            include: { transaction: { include: { batch: true } } },
        });
        if (!existingLine)
            return (0, response_1.sendError)(res, 'Line not found', 404);
        if (existingLine.transaction.batch.status !== 'OPEN')
            return (0, response_1.sendError)(res, 'Batch is not OPEN', 400);
        const resolvedType = earning_type !== undefined ? earning_type : existingLine.earning_type;
        let resolvedLabel = existingLine.custom_earning_label;
        if (resolvedType === 'OTHER') {
            const label = custom_earning_label !== undefined ? custom_earning_label : existingLine.custom_earning_label;
            if (!label || !String(label).trim()) {
                return (0, response_1.sendError)(res, 'custom_earning_label is required when earning_type is OTHER', 400);
            }
            resolvedLabel = String(label).trim();
            await prisma_config_1.default.customEarningType.upsert({
                where: { label: resolvedLabel },
                update: {},
                create: { label: resolvedLabel, created_by_user_id: req.user?.user_id ?? null },
            });
        }
        else if (earning_type !== undefined) {
            resolvedLabel = null; // switched away from OTHER — clear the stale label
        }
        const nextPayUnits = pay_units !== undefined ? toNum(pay_units) : toNum(existingLine.pay_units);
        const nextBillUnits = existingLine.transaction.bill_units_equal_pay_units
            ? nextPayUnits
            : bill_units !== undefined
                ? toNum(bill_units)
                : toNum(existingLine.bill_units);
        const nextPayRate = pay_rate !== undefined ? toNum(pay_rate) : toNum(existingLine.pay_rate);
        const nextBillRate = bill_rate !== undefined ? toNum(bill_rate) : toNum(existingLine.bill_rate);
        const totals = computeLineTotals({
            pay_units: nextPayUnits,
            bill_units: nextBillUnits,
            pay_rate: nextPayRate,
            bill_rate: nextBillRate,
        });
        const line = await prisma_config_1.default.payrollTransactionLine.update({
            where: { line_id: lineId },
            data: {
                earning_type: resolvedType,
                custom_earning_label: resolvedLabel,
                pay_units: nextPayUnits,
                bill_units: nextBillUnits,
                pay_rate: nextPayRate,
                bill_rate: nextBillRate,
                ...totals,
            },
        });
        await recalcTransactionTotals(existingLine.transaction_id);
        return (0, response_1.sendSuccess)(res, { line });
    }
    catch (err) {
        console.error('Error updating transaction line:', err);
        return (0, response_1.sendError)(res, 'Failed to update line', 500);
    }
};
exports.updateTransactionLine = updateTransactionLine;
// DELETE /lines/:lineId
const deleteTransactionLine = async (req, res) => {
    try {
        const { lineId } = req.params;
        const existingLine = await prisma_config_1.default.payrollTransactionLine.findUnique({
            where: { line_id: lineId },
            include: { transaction: { include: { batch: true } } },
        });
        if (!existingLine)
            return (0, response_1.sendError)(res, 'Line not found', 404);
        if (existingLine.transaction.batch.status !== 'OPEN')
            return (0, response_1.sendError)(res, 'Batch is not OPEN', 400);
        await prisma_config_1.default.payrollTransactionLine.delete({ where: { line_id: lineId } });
        await recalcTransactionTotals(existingLine.transaction_id);
        return (0, response_1.sendSuccess)(res, { message: 'Line deleted.' });
    }
    catch (err) {
        console.error('Error deleting transaction line:', err);
        return (0, response_1.sendError)(res, 'Failed to delete line', 500);
    }
};
exports.deleteTransactionLine = deleteTransactionLine;
// ============================================================
// VERIFY / CLOSE
// ============================================================
// POST /batches/:batchId/verify
// Walks every transaction, flags errors (missing SSN, zero rates on
// units-bearing lines, missing required header fields), and marks each
// transaction VERIFIED or ERROR. Batch moves to VERIFIED only if every
// transaction passes.
const verifyBatch = async (req, res) => {
    try {
        const { batchId } = req.params;
        const batch = await prisma_config_1.default.transactionBatch.findUnique({
            where: { batch_id: batchId },
            include: {
                transactions: {
                    include: {
                        lines: true,
                        assignment: {
                            include: {
                                application: { include: { applicant: { include: { demographic: true } } } },
                            },
                        },
                    },
                },
            },
        });
        if (!batch)
            return (0, response_1.sendError)(res, 'Batch not found', 404);
        if (batch.status === 'CLOSED')
            return (0, response_1.sendError)(res, 'Batch is already CLOSED', 400);
        if (!batch.transactions.length)
            return (0, response_1.sendError)(res, 'Batch has no transactions to verify', 400);
        const allErrors = [];
        for (const t of batch.transactions) {
            const errors = [];
            const applicant = t.assignment?.application?.applicant;
            if (!applicant?.demographic?.ssn_encrypted)
                errors.push('Missing SSN.');
            if (!t.department)
                errors.push('Missing Department.');
            if (!t.branch)
                errors.push('Missing Branch.');
            if (!t.job_position)
                errors.push('Missing Job Position.');
            if (!t.lines.length)
                errors.push('No earning lines entered.');
            for (const l of t.lines) {
                if (toNum(l.pay_units) > 0 && toNum(l.pay_rate) <= 0) {
                    errors.push(`${l.earning_type}: pay units entered but pay rate is 0.`);
                }
                if (toNum(l.bill_units) > 0 && toNum(l.bill_rate) <= 0) {
                    errors.push(`${l.earning_type}: bill units entered but bill rate is 0.`);
                }
            }
            const status = errors.length ? 'ERROR' : 'VERIFIED';
            await prisma_config_1.default.payrollTransaction.update({
                where: { transaction_id: t.transaction_id },
                data: { status, error_messages: errors.length ? errors : null },
            });
            errors.forEach((message) => allErrors.push({ transaction_id: t.transaction_id, transaction_number: t.transaction_number, message }));
        }
        const batchStatus = allErrors.length ? 'OPEN' : 'VERIFIED';
        const updated = await prisma_config_1.default.transactionBatch.update({
            where: { batch_id: batchId },
            data: {
                status: batchStatus,
                verified_at: allErrors.length ? null : new Date(),
                verification_errors: allErrors.length ? allErrors : null,
            },
        });
        return (0, response_1.sendSuccess)(res, {
            batch: updated,
            is_valid: allErrors.length === 0,
            errors: allErrors,
        });
    }
    catch (err) {
        console.error('Error verifying batch:', err);
        return (0, response_1.sendError)(res, 'Failed to verify batch', 500);
    }
};
exports.verifyBatch = verifyBatch;
// POST /batches/:batchId/close
// Requires the batch to have passed verification (status VERIFIED).
const closeBatch = async (req, res) => {
    try {
        const { batchId } = req.params;
        const batch = await prisma_config_1.default.transactionBatch.findUnique({ where: { batch_id: batchId } });
        if (!batch)
            return (0, response_1.sendError)(res, 'Batch not found', 404);
        if (batch.status === 'CLOSED')
            return (0, response_1.sendError)(res, 'Batch is already CLOSED', 400);
        if (batch.status !== 'VERIFIED') {
            return (0, response_1.sendError)(res, 'Batch must be VERIFIED (no outstanding errors) before it can be closed', 400);
        }
        const updated = await prisma_config_1.default.transactionBatch.update({
            where: { batch_id: batchId },
            data: { status: 'CLOSED', closed_at: new Date() },
        });
        // Hook point: this is where you'd fan out to Invoice/Payroll creation
        // per transaction, mirroring how Timesheet approval currently snapshots
        // rates into Invoice/Payroll. Left out here since it depends on your
        // invoicing rules — happy to wire it up once those rules are set.
        return (0, response_1.sendSuccess)(res, {
            message: `Batch #${updated.batch_number} closed and ready for invoicing and payments.`,
            batch: updated,
        });
    }
    catch (err) {
        console.error('Error closing batch:', err);
        return (0, response_1.sendError)(res, 'Failed to close batch', 500);
    }
};
exports.closeBatch = closeBatch;
// ============================================================
// BATCH REPORT (the printable report in image 3)
// ============================================================
// GET /batches/:batchId/report
const getBatchReport = async (req, res) => {
    try {
        const { batchId } = req.params;
        const batch = await prisma_config_1.default.transactionBatch.findUnique({
            where: { batch_id: batchId },
            include: {
                created_by: { select: { name: true } },
                transactions: {
                    include: {
                        organization: { select: { name: true, branch_name: true } },
                        job: { select: { job_id: true, custom_job_id: true } },
                        assignment: {
                            include: {
                                application: {
                                    include: { applicant: { include: { demographic: true } } },
                                },
                            },
                        },
                        lines: true,
                    },
                },
            },
        });
        if (!batch)
            return (0, response_1.sendError)(res, 'Batch not found', 404);
        const rows = batch.transactions.flatMap((t) => {
            const applicant = t.assignment?.application?.applicant;
            return t.lines.map((l) => ({
                week_worked: t.week_worked,
                assignment_number: t.assignment_id,
                branch: t.branch,
                order_id: t.job?.custom_job_id ?? t.job?.job_id ?? null,
                employee_name: applicant?.full_name ?? null,
                ssn_masked: maskSsn(applicant?.demographic?.ssn_encrypted),
                department: t.department,
                bill_to: t.organization?.name ?? null,
                earning_type: l.earning_type,
                pay_units: toNum(l.pay_units),
                pay_rate: toNum(l.pay_rate),
                pay_total: toNum(l.item_pay),
                bill_units: toNum(l.bill_units),
                bill_rate: toNum(l.bill_rate),
                bill_total: toNum(l.item_bill),
                margin: Number((toNum(l.item_bill) - toNum(l.item_pay)).toFixed(2)),
            }));
        });
        const footer = rows.reduce((acc, r) => {
            acc.payroll_units += r.pay_units;
            acc.payroll_amount += r.pay_total;
            acc.billing_units += r.bill_units;
            acc.billing_amount += r.bill_total;
            return acc;
        }, { payroll_units: 0, payroll_amount: 0, billing_units: 0, billing_amount: 0 });
        const margin = Number((footer.billing_amount - footer.payroll_amount).toFixed(2));
        const margin_pct = footer.billing_amount > 0 ? Number(((margin / footer.billing_amount) * 100).toFixed(2)) : 0;
        // "Markup" shown in the Avionte report (e.g. 1.39 / 139%) is Billing ÷
        // Payroll, i.e. a multiplier, not (margin / payroll). Kept consistent
        // with the screenshot rather than the conventional markup-% formula.
        const markup_multiplier = footer.payroll_amount > 0 ? Number((footer.billing_amount / footer.payroll_amount).toFixed(2)) : 0;
        const report = {
            header: {
                batch_id: batch.batch_id,
                batch_number: batch.batch_number,
                description: batch.description,
                processed_by: batch.created_by?.name ?? null,
                total_txn_count: batch.transactions.length,
            },
            rows,
            footer: {
                ...footer,
                payroll_units: Number(footer.payroll_units.toFixed(2)),
                payroll_amount: Number(footer.payroll_amount.toFixed(2)),
                billing_units: Number(footer.billing_units.toFixed(2)),
                billing_amount: Number(footer.billing_amount.toFixed(2)),
                margin,
                margin_pct,
                markup_multiplier,
            },
        };
        return (0, response_1.sendSuccess)(res, { report });
    }
    catch (err) {
        console.error('Error generating batch report:', err);
        return (0, response_1.sendError)(res, 'Failed to generate batch report', 500);
    }
};
exports.getBatchReport = getBatchReport;
exports.transactionBatchController = {
    // Lookups / search (for frontend form dropdowns)
    searchApplicantsForPayroll: exports.searchApplicantsForPayroll,
    getApplicantAssignments: exports.getApplicantAssignments,
    getAssignmentContextForTransaction: exports.getAssignmentContextForTransaction,
    getJobRatesForAssignment: exports.getJobRatesForAssignment,
    getEarningTypes: exports.getEarningTypes,
    // Shortcut nav buttons
    getApplicantShortcut: exports.getApplicantShortcut,
    getOrganizationShortcut: exports.getOrganizationShortcut,
    getJobShortcut: exports.getJobShortcut,
    getAssignmentShortcut: exports.getAssignmentShortcut,
    // Batch CRUD
    createBatch: exports.createBatch,
    getAllBatches: exports.getAllBatches,
    getBatchById: exports.getBatchById,
    updateBatch: exports.updateBatch,
    deleteBatch: exports.deleteBatch,
    // Transactions
    createTransaction: exports.createTransaction,
    importTransactionFromTimesheet: exports.importTransactionFromTimesheet,
    getAssignmentTimesheets: exports.getAssignmentTimesheets,
    getTransactionById: exports.getTransactionById,
    updateTransaction: exports.updateTransaction,
    deleteTransaction: exports.deleteTransaction,
    // Lines
    addTransactionLine: exports.addTransactionLine,
    updateTransactionLine: exports.updateTransactionLine,
    deleteTransactionLine: exports.deleteTransactionLine,
    // Verify / Close
    verifyBatch: exports.verifyBatch,
    closeBatch: exports.closeBatch,
    // Report
    getBatchReport: exports.getBatchReport,
};
//# sourceMappingURL=batchTimeEntryController.js.map