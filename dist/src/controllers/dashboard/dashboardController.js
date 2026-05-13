"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDashboardPreference = getDashboardPreference;
exports.saveDashboardPreference = saveDashboardPreference;
exports.widgetUserStats = widgetUserStats;
exports.widgetOrgStats = widgetOrgStats;
exports.widgetTimesheets = widgetTimesheets;
exports.widgetInvoiceStats = widgetInvoiceStats;
exports.widgetContracts = widgetContracts;
exports.widgetMyTasksGrouped = widgetMyTasksGrouped;
exports.widgetJobStats = widgetJobStats;
exports.widgetApplications = widgetApplications;
exports.widgetPipeline = widgetPipeline;
exports.widgetCandidates = widgetCandidates;
exports.widgetInterviews = widgetInterviews;
exports.widgetMyTasks = widgetMyTasks;
exports.widgetMyOrgs = widgetMyOrgs;
exports.widgetClientJobStats = widgetClientJobStats;
exports.widgetApplicationFunnel = widgetApplicationFunnel;
exports.widgetClientInvoices = widgetClientInvoices;
exports.widgetClientTimesheets = widgetClientTimesheets;
exports.widgetClientPlacements = widgetClientPlacements;
exports.widgetJobRequests = widgetJobRequests;
exports.widgetExpiringDocuments = widgetExpiringDocuments;
exports.sendExpiryReminderEmails = sendExpiryReminderEmails;
exports.widgetClientMyTasks = widgetClientMyTasks;
const prisma_config_1 = __importDefault(require("../../prisma.config"));
const client_1 = require("@prisma/client");
const response_1 = require("../../utils/response");
const emailService_1 = require("../../services/emailService");
// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function getUserId(req) {
    // Prefer authenticated user_id from JWT; never trust URL param for identity.
    const authed = req.user?.user_id;
    if (authed)
        return authed;
    return req.params.userId;
}
/**
 * Converts a dateRange string like "30d" into a Date object for Prisma `gte` filters.
 * "all" or undefined returns undefined (no date filter).
 */
function resolveDateRange(dateRange) {
    if (!dateRange || dateRange === "all")
        return undefined;
    const days = parseInt(dateRange.replace("d", ""), 10);
    if (isNaN(days))
        return undefined;
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d;
}
/** Parse comma-separated statuses from query string */
function parseStatuses(raw) {
    if (!raw)
        return undefined;
    const arr = raw.split(",").map((s) => s.trim()).filter(Boolean);
    return arr.length ? arr : undefined;
}
function filterEnum(raw, enumObj) {
    if (!raw?.length)
        return undefined;
    const allowed = new Set(Object.values(enumObj));
    const filtered = raw.filter((v) => allowed.has(v));
    return filtered.length ? filtered : undefined;
}
/** Start of current month */
function startOfMonth() {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
}
// ─────────────────────────────────────────────────────────────────────────────
// PREFERENCES
// GET  /api/dashboard/preferences/:userId
// POST /api/dashboard/preferences/:userId
// ─────────────────────────────────────────────────────────────────────────────
async function getDashboardPreference(req, res) {
    try {
        const userId = getUserId(req);
        const pref = await prisma_config_1.default.dashboardPreference.findUnique({
            where: { user_id: userId },
        });
        return (0, response_1.sendSuccess)(res, pref ?? { layout: [] });
    }
    catch (err) {
        console.error(err);
        return (0, response_1.sendError)(res, "Failed to fetch preferences", 500);
    }
}
async function saveDashboardPreference(req, res) {
    try {
        const userId = getUserId(req);
        const { layout } = req.body;
        if (!req.user?.user_id) {
            return (0, response_1.sendError)(res, "Authentication required", 401);
        }
        if (!Array.isArray(layout)) {
            return (0, response_1.sendError)(res, "layout must be an array", 400);
        }
        // If user was deleted after token issuance, avoid a Prisma FK 500.
        const userExists = await prisma_config_1.default.user.findUnique({
            where: { user_id: userId },
            select: { user_id: true },
        });
        if (!userExists) {
            return (0, response_1.sendError)(res, "User not found", 404);
        }
        const pref = await prisma_config_1.default.dashboardPreference.upsert({
            where: { user_id: userId },
            create: { user_id: userId, layout },
            update: { layout },
        });
        return (0, response_1.sendSuccess)(res, pref);
    }
    catch (err) {
        console.error(err);
        return (0, response_1.sendError)(res, "Failed to save preferences", 500);
    }
}
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
//  BACK OFFICE WIDGETS
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
/**
 * GET /api/dashboard/widget/backOffice/userStats/:userId
 * Query: dateRange (e.g. "30d"), statuses (comma-sep)
 */
async function widgetUserStats(req, res) {
    try {
        const userId = getUserId(req);
        const since = resolveDateRange(req.query.dateRange);
        const [total, active, inactive, byRole, recentUsers, newThisMonth] = await Promise.all([
            prisma_config_1.default.user.count(),
            prisma_config_1.default.user.count({ where: { status: "ACTIVE" } }),
            prisma_config_1.default.user.count({ where: { status: "INACTIVE" } }),
            // Users grouped by role
            prisma_config_1.default.userRole.groupBy({
                by: ["role_id"],
                _count: { user_id: true },
            }),
            // Recently created users
            prisma_config_1.default.user.findMany({
                take: req.query.limit ? Number(req.query.limit) : 10,
                orderBy: { created_at: "desc" },
                where: since ? { created_at: { gte: since } } : undefined,
                select: {
                    user_id: true,
                    name: true,
                    email: true,
                    status: true,
                    created_at: true,
                    user_role: { select: { role: { select: { role_name: true } } } },
                },
            }),
            // New users this month
            prisma_config_1.default.user.count({ where: { created_at: { gte: startOfMonth() } } }),
        ]);
        return (0, response_1.sendSuccess)(res, {
            total,
            active,
            inactive,
            newThisMonth,
            byRole,
            recentUsers,
        });
    }
    catch (err) {
        console.error(err);
        return (0, response_1.sendError)(res, "widgetUserStats failed", 500);
    }
}
/**
 * GET /api/dashboard/widget/backOffice/orgStats/:userId
 * Query: dateRange, statuses
 */
async function widgetOrgStats(req, res) {
    try {
        const since = resolveDateRange(req.query.dateRange);
        const statusFilter = filterEnum(parseStatuses(req.query.statuses), client_1.OrganizationStatus);
        const [total, byStatus, topOrgs, recentOrgs] = await Promise.all([
            prisma_config_1.default.organization.count(),
            prisma_config_1.default.organization.groupBy({
                by: ["status"],
                _count: { organization_id: true },
            }),
            // Top orgs by job count
            prisma_config_1.default.organization.findMany({
                take: Number(req.query.limit ?? 6),
                where: statusFilter ? { status: { in: statusFilter } } : undefined,
                orderBy: { jobs: { _count: "desc" } },
                select: {
                    organization_id: true,
                    name: true,
                    status: true,
                    industry: true,
                    website: true,
                    created_at: true,
                    _count: { select: { jobs: true, contracts: true, contacts: true } },
                },
            }),
            // Recently created orgs
            prisma_config_1.default.organization.findMany({
                take: 5,
                orderBy: { created_at: "desc" },
                where: since ? { created_at: { gte: since } } : undefined,
                select: {
                    organization_id: true,
                    name: true,
                    status: true,
                    created_at: true,
                },
            }),
        ]);
        return (0, response_1.sendSuccess)(res, {
            total,
            byStatus: byStatus.map((s) => ({ status: s.status, count: s._count.organization_id })),
            topOrgs: topOrgs.map((o) => ({
                id: o.organization_id,
                name: o.name,
                status: o.status,
                industry: o.industry,
                jobCount: o._count.jobs,
                contractCount: o._count.contracts,
                contactCount: o._count.contacts,
            })),
            recentOrgs,
        });
    }
    catch (err) {
        console.error(err);
        return (0, response_1.sendError)(res, "widgetOrgStats failed", 500);
    }
}
/**
 * GET /api/dashboard/widget/backOffice/timesheets/:userId
 * Query: dateRange, statuses, limit
 */
async function widgetTimesheets(req, res) {
    try {
        const since = resolveDateRange(req.query.dateRange);
        const statusFilter = filterEnum(parseStatuses(req.query.statuses), client_1.TimesheetStatus);
        const limit = Number(req.query.limit ?? 10);
        const whereBase = {
            ...(statusFilter ? { status: { in: statusFilter } } : {}),
            ...(since ? { created_at: { gte: since } } : {}),
        };
        const [pendingReview, byStatus, recentTimesheets, hoursThisMonth] = await Promise.all([
            prisma_config_1.default.timesheet.count({
                where: { status: { in: [client_1.TimesheetStatus.SUBMITTED, client_1.TimesheetStatus.UNDER_REVIEW] } },
            }),
            prisma_config_1.default.timesheet.groupBy({
                by: ["status"],
                _count: { timesheet_id: true },
                _sum: { total_hours: true, total_bill_amount: true },
            }),
            prisma_config_1.default.timesheet.findMany({
                take: limit,
                orderBy: { week_start_date: "desc" },
                where: whereBase,
                select: {
                    timesheet_id: true,
                    week_start_date: true,
                    week_end_date: true,
                    status: true,
                    total_hours: true,
                    total_bill_amount: true,
                    total_pay_amount: true,
                    assignment: {
                        select: {
                            application: {
                                select: {
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
            // Total hours billed this month
            prisma_config_1.default.timesheet.aggregate({
                _sum: { total_hours: true, total_bill_amount: true },
                where: { week_start_date: { gte: startOfMonth() } },
            }),
        ]);
        return (0, response_1.sendSuccess)(res, {
            pendingReview,
            byStatus: byStatus.map((s) => ({
                status: s.status,
                count: s._count.timesheet_id,
                totalHours: s._sum.total_hours,
                totalBilled: s._sum.total_bill_amount,
            })),
            recentTimesheets,
            hoursThisMonth: {
                totalHours: hoursThisMonth._sum.total_hours ?? 0,
                totalBilled: hoursThisMonth._sum.total_bill_amount ?? 0,
            },
        });
    }
    catch (err) {
        console.error(err);
        return (0, response_1.sendError)(res, "widgetTimesheets failed", 500);
    }
}
/**
 * GET /api/dashboard/widget/backOffice/invoiceStats/:userId
 * Query: dateRange, statuses, limit
 */
async function widgetInvoiceStats(req, res) {
    try {
        const since = resolveDateRange(req.query.dateRange);
        const statusFilter = filterEnum(parseStatuses(req.query.statuses), client_1.InvoiceStatus);
        const limit = Number(req.query.limit ?? 8);
        const whereBase = {
            ...(statusFilter ? { status: { in: statusFilter } } : {}),
            ...(since ? { invoice_date: { gte: since } } : {}),
        };
        const [byStatus, recentInvoices, overdueSummary, totalRevenue] = await Promise.all([
            prisma_config_1.default.invoice.groupBy({
                by: ["status"],
                _count: { invoice_id: true },
                _sum: { total_amount: true },
            }),
            prisma_config_1.default.invoice.findMany({
                take: limit,
                orderBy: { invoice_date: "desc" },
                where: whereBase,
                select: {
                    invoice_id: true,
                    invoice_number: true,
                    status: true,
                    invoice_date: true,
                    due_date: true,
                    total_amount: true,
                    paid_at: true,
                    assignment: {
                        select: {
                            application: {
                                select: {
                                    applicant: { select: { full_name: true } },
                                    job: { select: { organization: { select: { name: true } } } },
                                },
                            },
                        },
                    },
                },
            }),
            // Overdue invoices
            prisma_config_1.default.invoice.aggregate({
                _count: { invoice_id: true },
                _sum: { total_amount: true },
                where: { status: "OVERDUE" },
            }),
            // Total paid revenue this month
            prisma_config_1.default.invoice.aggregate({
                _sum: { total_amount: true },
                where: { status: "PAID", paid_at: { gte: startOfMonth() } },
            }),
        ]);
        return (0, response_1.sendSuccess)(res, {
            byStatus: byStatus.map((i) => ({
                status: i.status,
                count: i._count.invoice_id,
                total: i._sum.total_amount,
            })),
            recentInvoices,
            overdue: {
                count: overdueSummary._count.invoice_id,
                total: overdueSummary._sum.total_amount ?? 0,
            },
            revenueThisMonth: totalRevenue._sum.total_amount ?? 0,
        });
    }
    catch (err) {
        console.error(err);
        return (0, response_1.sendError)(res, "widgetInvoiceStats failed", 500);
    }
}
/**
 * GET /api/dashboard/widget/backOffice/contracts/:userId
 * Query: dateRange, statuses, limit
 */
async function widgetContracts(req, res) {
    try {
        const since = resolveDateRange(req.query.dateRange);
        const statusFilter = parseStatuses(req.query.statuses);
        const limit = Number(req.query.limit ?? 10);
        const [byStatus, recentContracts, pendingSignatures] = await Promise.all([
            prisma_config_1.default.contract.groupBy({
                by: ["status"],
                _count: { contract_id: true },
            }),
            prisma_config_1.default.contract.findMany({
                take: limit,
                orderBy: { created_at: "desc" },
                where: {
                    ...(statusFilter ? { status: { in: statusFilter } } : {}),
                    ...(since ? { created_at: { gte: since } } : {}),
                },
                select: {
                    contract_id: true,
                    contract_name: true,
                    status: true,
                    sent_status: true,
                    signed_status: true,
                    signed_at: true,
                    created_at: true,
                    organization: { select: { name: true, organization_id: true } },
                    user: { select: { name: true, user_id: true } },
                },
            }),
            // Pending signature requests (global)
            prisma_config_1.default.signatureRequest.count({ where: { status: "PENDING" } }),
            // Contracts expiring in next 30 days (if you have end_date)
            // prisma.contract.count({ where: { end_date: { lte: new Date(Date.now() + 30*24*60*60*1000), gte: new Date() } } }),
        ]);
        return (0, response_1.sendSuccess)(res, {
            byStatus: byStatus.map((c) => ({ status: c.status, count: c._count.contract_id })),
            recentContracts,
            pendingSignatures,
        });
    }
    catch (err) {
        console.error(err);
        return (0, response_1.sendError)(res, "widgetContracts failed", 500);
    }
}
/**
 * GET /api/dashboard/widget/backOffice/myTasks/:userId
 * Query: statuses, dateRange, limit
 */
async function widgetMyTasksGrouped(req, res) {
    try {
        const userId = getUserId(req);
        const statusFilter = parseStatuses(req.query.statuses);
        const limit = Number(req.query.limit ?? 10);
        const [byStatus, upcoming] = await Promise.all([
            prisma_config_1.default.task.groupBy({
                by: ["status"],
                where: { assigned_to_user_id: userId },
                _count: { task_id: true },
            }),
            prisma_config_1.default.task.findMany({
                take: limit,
                orderBy: { due_date: "asc" },
                where: {
                    assigned_to_user_id: userId,
                    ...(statusFilter ? { status: { in: statusFilter } } : {}),
                },
                select: {
                    task_id: true,
                    description: true,
                    status: true,
                    due_date: true,
                    created_by: { select: { name: true, user_id: true } },
                },
            }),
        ]);
        return (0, response_1.sendSuccess)(res, {
            byStatus: byStatus.map((t) => ({ status: t.status, count: t._count.task_id })),
            upcoming,
        });
    }
    catch (err) {
        console.error(err);
        return (0, response_1.sendError)(res, "widgetMyTasksGrouped failed", 500);
    }
}
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
//  FRONT OFFICE WIDGETS
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
/**
 * GET /api/dashboard/widget/frontOffice/jobStats/:userId
 * Query: dateRange, statuses, limit
 */
async function widgetJobStats(req, res) {
    try {
        const userId = getUserId(req);
        const since = resolveDateRange(req.query.dateRange);
        const statusFilter = filterEnum(parseStatuses(req.query.statuses), client_1.JobStatus);
        const limit = Number(req.query.limit ?? 10);
        const [active, byStatus, myJobs, newThisMonth] = await Promise.all([
            prisma_config_1.default.job.count({ where: { status: "OPEN" } }),
            prisma_config_1.default.job.groupBy({
                by: ["status"],
                _count: { job_id: true },
            }),
            // Jobs owned by this user
            prisma_config_1.default.job.findMany({
                take: limit,
                orderBy: { created_at: "desc" },
                where: {
                    OR: [
                        { created_by_user_id: userId },
                        { manager_id: userId },
                        { job_owners: { some: { user_id: userId } } },
                    ],
                    ...(statusFilter ? { status: { in: statusFilter } } : {}),
                    ...(since ? { created_at: { gte: since } } : {}),
                },
                select: {
                    job_id: true,
                    job_title: true,
                    status: true,
                    job_type: true,
                    open_positions: true,
                    location: true,
                    created_at: true,
                    organization: { select: { name: true, organization_id: true } },
                    _count: { select: { applications: true } },
                },
            }),
            prisma_config_1.default.job.count({ where: { created_at: { gte: startOfMonth() } } }),
        ]);
        return (0, response_1.sendSuccess)(res, {
            active,
            newThisMonth,
            byStatus: byStatus.map((j) => ({ status: j.status, count: j._count.job_id })),
            myJobs,
        });
    }
    catch (err) {
        console.error(err);
        return (0, response_1.sendError)(res, "widgetJobStats failed", 500);
    }
}
/**
 * GET /api/dashboard/widget/frontOffice/applications/:userId
 * Query: dateRange, statuses, limit
 */
async function widgetApplications(req, res) {
    try {
        const since = resolveDateRange(req.query.dateRange);
        const statusFilter = filterEnum(parseStatuses(req.query.statuses), client_1.ApplicationStatus);
        const limit = Number(req.query.limit ?? 15);
        const whereBase = {
            ...(statusFilter ? { status: { in: statusFilter } } : {}),
            ...(since ? { applied_at: { gte: since } } : {}),
        };
        const [byStatus, recentApplications, placedThisMonth, velocityByDay] = await Promise.all([
            prisma_config_1.default.application.groupBy({
                by: ["status"],
                _count: { application_id: true },
            }),
            prisma_config_1.default.application.findMany({
                take: limit,
                orderBy: { applied_at: "desc" },
                where: whereBase,
                select: {
                    application_id: true,
                    status: true,
                    applied_at: true,
                    source: true,
                    applicant: { select: { full_name: true, applicant_id: true } },
                    job: {
                        select: {
                            job_title: true,
                            job_id: true,
                            organization: { select: { name: true } },
                        },
                    },
                },
            }),
            prisma_config_1.default.application.count({
                where: { status: "HIRED", applied_at: { gte: startOfMonth() } },
            }),
            // Applications per day for the last 14 days (for trend chart)
            // Raw groupBy on date is tricky in Prisma — return raw recent list and let frontend compute
            prisma_config_1.default.application.findMany({
                where: { applied_at: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) } },
                select: { applied_at: true },
                orderBy: { applied_at: "asc" },
            }),
        ]);
        return (0, response_1.sendSuccess)(res, {
            byStatus: byStatus.map((a) => ({ status: a.status, count: a._count.application_id })),
            recentApplications,
            placedThisMonth,
            // Group velocity by date on frontend using applied_at timestamps
            velocityRaw: velocityByDay.map((a) => a.applied_at),
        });
    }
    catch (err) {
        console.error(err);
        return (0, response_1.sendError)(res, "widgetApplications failed", 500);
    }
}
/**
 * GET /api/dashboard/widget/frontOffice/pipeline/:userId
 * Returns stage-grouped pipeline data for Kanban view
 * Query: jobId (optional), dateRange, limit
 */
async function widgetPipeline(req, res) {
    try {
        const { jobId } = req.query;
        const since = resolveDateRange(req.query.dateRange);
        const limit = Number(req.query.limit ?? 10);
        const [byStage, recentMovements] = await Promise.all([
            // Applications grouped by current pipeline stage
            prisma_config_1.default.pipelineStage.groupBy({
                by: ["stage_name"],
                _count: { pipeline_stage_id: true },
                where: {
                    ...(jobId ? { application: { job_id: jobId } } : {}),
                    ...(since ? { pipeline_date: { gte: since } } : {}),
                },
            }),
            // Recent pipeline movements
            prisma_config_1.default.pipelineStage.findMany({
                take: limit,
                orderBy: { pipeline_date: "desc" },
                where: {
                    ...(jobId ? { application: { job_id: jobId } } : {}),
                    ...(since ? { pipeline_date: { gte: since } } : {}),
                },
                select: {
                    pipeline_stage_id: true,
                    stage_name: true,
                    pipeline_date: true,
                    application: {
                        select: {
                            application_id: true,
                            status: true,
                            applicant: { select: { full_name: true, applicant_id: true } },
                            job: {
                                select: {
                                    job_title: true,
                                    job_id: true,
                                    organization: { select: { name: true } },
                                },
                            },
                        },
                    },
                },
            }),
        ]);
        return (0, response_1.sendSuccess)(res, {
            byStage: byStage.map((s) => ({ stage: s.stage_name, count: s._count.pipeline_stage_id })),
            recentMovements,
        });
    }
    catch (err) {
        console.error(err);
        return (0, response_1.sendError)(res, "widgetPipeline failed", 500);
    }
}
/**
 * GET /api/dashboard/widget/frontOffice/candidates/:userId
 * Query: dateRange, statuses, limit
 */
async function widgetCandidates(req, res) {
    try {
        const since = resolveDateRange(req.query.dateRange);
        const statusFilter = filterEnum(parseStatuses(req.query.statuses), client_1.ApplicantStatus);
        const limit = Number(req.query.limit ?? 10);
        const [total, recentApplicants, topByScore, byStatus] = await Promise.all([
            prisma_config_1.default.applicant.count(),
            prisma_config_1.default.applicant.findMany({
                take: limit,
                orderBy: { created_at: "desc" },
                where: {
                    ...(statusFilter ? { status: { in: statusFilter } } : {}),
                    ...(since ? { created_at: { gte: since } } : {}),
                },
                select: {
                    applicant_id: true,
                    full_name: true,
                    status: true,
                    created_at: true,
                    contact: { select: { email: true, phone: true, city: true, state: true } },
                    _count: { select: { applications: true } },
                },
            }),
            // Top AI-scored candidates
            prisma_config_1.default.applicationEvaluation.findMany({
                take: limit,
                orderBy: { ai_score: "desc" },
                select: {
                    ai_score: true,
                    evaluated_at: true,
                    application: {
                        select: {
                            application_id: true,
                            status: true,
                            applicant: { select: { full_name: true, applicant_id: true } },
                            job: { select: { job_title: true, job_id: true } },
                        },
                    },
                },
            }),
            prisma_config_1.default.applicant.groupBy({
                by: ["status"],
                _count: { applicant_id: true },
            }),
        ]);
        return (0, response_1.sendSuccess)(res, {
            total,
            byStatus: byStatus.map((s) => ({ status: s.status, count: s._count.applicant_id })),
            recentApplicants,
            topByScore,
        });
    }
    catch (err) {
        console.error(err);
        return (0, response_1.sendError)(res, "widgetCandidates failed", 500);
    }
}
/**
 * GET /api/dashboard/widget/frontOffice/interviews/:userId
 * Query: dateRange, statuses, limit
 */
async function widgetInterviews(req, res) {
    try {
        const userId = getUserId(req);
        const since = resolveDateRange(req.query.dateRange);
        const limit = Number(req.query.limit ?? 10);
        const [openCount, upcoming, byStatus] = await Promise.all([
            // Open/pending interviews
            prisma_config_1.default.interview.count({
                where: { status: "PENDING", interview_date: { gte: new Date() } },
            }),
            // Upcoming interviews for this user's jobs
            prisma_config_1.default.interview.findMany({
                take: limit,
                orderBy: { interview_date: "asc" },
                where: {
                    interview_date: { gte: new Date() },
                    application: {
                        job: {
                            OR: [
                                { created_by_user_id: userId },
                                { manager_id: userId },
                                { job_owners: { some: { user_id: userId } } },
                            ],
                        },
                    },
                },
                select: {
                    interview_id: true,
                    interview_date: true,
                    interview_type: true,
                    status: true,
                    application: {
                        select: {
                            applicant: { select: { full_name: true } },
                            job: { select: { job_title: true, organization: { select: { name: true } } } },
                        },
                    },
                },
            }),
            prisma_config_1.default.interview.groupBy({
                by: ["status"],
                _count: { interview_id: true },
            }),
        ]);
        return (0, response_1.sendSuccess)(res, {
            openCount,
            upcoming,
            byStatus: byStatus.map((i) => ({ status: i.status, count: i._count.interview_id })),
        });
    }
    catch (err) {
        console.error(err);
        return (0, response_1.sendError)(res, "widgetInterviews failed", 500);
    }
}
/**
 * GET /api/dashboard/widget/frontOffice/myTasks/:userId
 * Query: statuses, limit
 */
async function widgetMyTasks(req, res) {
    try {
        const userId = getUserId(req);
        const statusFilter = parseStatuses(req.query.statuses);
        const limit = Number(req.query.limit ?? 10);
        const tasks = await prisma_config_1.default.task.findMany({
            take: limit,
            orderBy: { due_date: "asc" },
            where: {
                assigned_to_user_id: userId,
                ...(statusFilter ? { status: { in: statusFilter } } : {}),
            },
            select: {
                task_id: true,
                description: true,
                status: true,
                due_date: true,
                created_by: { select: { name: true, user_id: true } },
            },
        });
        return (0, response_1.sendSuccess)(res, { tasks });
    }
    catch (err) {
        console.error(err);
        return (0, response_1.sendError)(res, "widgetMyTasks failed", 500);
    }
}
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
//  CLIENT OFFICE WIDGETS
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Resolve org IDs for a client user — shared across client office widgets
 */
async function getClientOrgIds(userId) {
    const orgUsers = await prisma_config_1.default.organizationUser.findMany({
        where: { user_id: userId },
        select: { organization_id: true },
    });
    return orgUsers.map((o) => o.organization_id);
}
/**
 * GET /api/dashboard/widget/clientOffice/myOrgs/:userId
 */
async function widgetMyOrgs(req, res) {
    try {
        const userId = getUserId(req);
        const orgIds = await getClientOrgIds(userId);
        const orgs = await prisma_config_1.default.organization.findMany({
            where: { organization_id: { in: orgIds } },
            select: {
                organization_id: true,
                name: true,
                status: true,
                website: true,
                industry: true,
                _count: { select: { jobs: true, contacts: true, contracts: true } },
            },
        });
        return (0, response_1.sendSuccess)(res, { orgs });
    }
    catch (err) {
        console.error(err);
        return (0, response_1.sendError)(res, "widgetMyOrgs failed", 500);
    }
}
/**
 * GET /api/dashboard/widget/clientOffice/jobStats/:userId
 * Query: dateRange, statuses, limit
 */
async function widgetClientJobStats(req, res) {
    try {
        const userId = getUserId(req);
        const orgIds = await getClientOrgIds(userId);
        const since = resolveDateRange(req.query.dateRange);
        const statusFilter = filterEnum(parseStatuses(req.query.statuses), client_1.JobStatus);
        const limit = Number(req.query.limit ?? 10);
        const orgFilter = { organization_id: { in: orgIds } };
        const [active, byStatus, recentJobs] = await Promise.all([
            prisma_config_1.default.job.count({ where: { ...orgFilter, status: "OPEN" } }),
            prisma_config_1.default.job.groupBy({
                by: ["status"],
                where: orgFilter,
                _count: { job_id: true },
            }),
            prisma_config_1.default.job.findMany({
                take: limit,
                orderBy: { created_at: "desc" },
                where: {
                    ...orgFilter,
                    ...(statusFilter ? { status: { in: statusFilter } } : {}),
                    ...(since ? { created_at: { gte: since } } : {}),
                },
                select: {
                    job_id: true,
                    job_title: true,
                    status: true,
                    job_type: true,
                    location: true,
                    open_positions: true,
                    created_at: true,
                    _count: { select: { applications: true } },
                },
            }),
        ]);
        return (0, response_1.sendSuccess)(res, {
            active,
            byStatus: byStatus.map((j) => ({ status: j.status, count: j._count.job_id })),
            recentJobs,
        });
    }
    catch (err) {
        console.error(err);
        return (0, response_1.sendError)(res, "widgetClientJobStats failed", 500);
    }
}
/**
 * GET /api/dashboard/widget/clientOffice/applicationFunnel/:userId
 * Query: dateRange, jobId
 */
async function widgetApplicationFunnel(req, res) {
    try {
        const userId = getUserId(req);
        const orgIds = await getClientOrgIds(userId);
        const since = resolveDateRange(req.query.dateRange);
        const { jobId } = req.query;
        const where = {
            job: {
                organization_id: { in: orgIds },
                ...(jobId ? { job_id: jobId } : {}),
            },
            ...(since ? { applied_at: { gte: since } } : {}),
        };
        const [byStatus, recentApplications, placedCount] = await Promise.all([
            prisma_config_1.default.application.groupBy({
                by: ["status"],
                where,
                _count: { application_id: true },
            }),
            prisma_config_1.default.application.findMany({
                take: Number(req.query.limit ?? 10),
                orderBy: { applied_at: "desc" },
                where,
                select: {
                    application_id: true,
                    status: true,
                    applied_at: true,
                    applicant: { select: { full_name: true } },
                    job: { select: { job_title: true, job_id: true } },
                },
            }),
            prisma_config_1.default.application.count({ where: { ...where, status: "HIRED" } }),
        ]);
        return (0, response_1.sendSuccess)(res, {
            funnel: byStatus.map((a) => ({ status: a.status, count: a._count.application_id })),
            recentApplications,
            placedCount,
        });
    }
    catch (err) {
        console.error(err);
        return (0, response_1.sendError)(res, "widgetApplicationFunnel failed", 500);
    }
}
/**
 * GET /api/dashboard/widget/clientOffice/invoices/:userId
 * Query: dateRange, statuses, limit
 */
async function widgetClientInvoices(req, res) {
    try {
        const userId = getUserId(req);
        const orgIds = await getClientOrgIds(userId);
        const since = resolveDateRange(req.query.dateRange);
        const statusFilter = filterEnum(parseStatuses(req.query.statuses), client_1.InvoiceStatus);
        const limit = Number(req.query.limit ?? 8);
        const orgJobFilter = {
            assignment: { application: { job: { organization_id: { in: orgIds } } } },
        };
        const [openCount, overdueCount, recentInvoices, totalOutstanding] = await Promise.all([
            prisma_config_1.default.invoice.count({
                where: { ...orgJobFilter, status: { in: ["SENT", "OVERDUE"] } },
            }),
            prisma_config_1.default.invoice.count({
                where: { ...orgJobFilter, status: "OVERDUE" },
            }),
            prisma_config_1.default.invoice.findMany({
                take: limit,
                orderBy: { invoice_date: "desc" },
                where: {
                    ...orgJobFilter,
                    ...(statusFilter ? { status: { in: statusFilter } } : {}),
                    ...(since ? { invoice_date: { gte: since } } : {}),
                },
                select: {
                    invoice_id: true,
                    invoice_number: true,
                    status: true,
                    invoice_date: true,
                    due_date: true,
                    total_amount: true,
                    paid_at: true,
                },
            }),
            // Total outstanding (sent + overdue)
            prisma_config_1.default.invoice.aggregate({
                _sum: { total_amount: true },
                where: { ...orgJobFilter, status: { in: ["SENT", "OVERDUE"] } },
            }),
        ]);
        return (0, response_1.sendSuccess)(res, {
            openCount,
            overdueCount,
            totalOutstanding: totalOutstanding._sum.total_amount ?? 0,
            recentInvoices,
        });
    }
    catch (err) {
        console.error(err);
        return (0, response_1.sendError)(res, "widgetClientInvoices failed", 500);
    }
}
/**
 * GET /api/dashboard/widget/clientOffice/timesheets/:userId
 * Query: dateRange, statuses, limit
 */
async function widgetClientTimesheets(req, res) {
    try {
        const userId = getUserId(req);
        const orgIds = await getClientOrgIds(userId);
        const since = resolveDateRange(req.query.dateRange);
        const statusFilter = filterEnum(parseStatuses(req.query.statuses), client_1.TimesheetStatus);
        const limit = Number(req.query.limit ?? 10);
        const orgJobFilter = {
            assignment: { application: { job: { organization_id: { in: orgIds } } } },
        };
        const [pendingApproval, recentTimesheets, hoursThisMonth] = await Promise.all([
            prisma_config_1.default.timesheet.count({
                where: { ...orgJobFilter, status: { in: ["SUBMITTED", "UNDER_REVIEW"] } },
            }),
            prisma_config_1.default.timesheet.findMany({
                take: limit,
                orderBy: { week_start_date: "desc" },
                where: {
                    ...orgJobFilter,
                    ...(statusFilter ? { status: { in: statusFilter } } : {}),
                    ...(since ? { week_start_date: { gte: since } } : {}),
                },
                select: {
                    timesheet_id: true,
                    week_start_date: true,
                    week_end_date: true,
                    status: true,
                    total_hours: true,
                    total_bill_amount: true,
                    assignment: {
                        select: {
                            application: {
                                select: {
                                    applicant: { select: { full_name: true } },
                                    job: { select: { job_title: true } },
                                },
                            },
                        },
                    },
                },
            }),
            prisma_config_1.default.timesheet.aggregate({
                _sum: { total_hours: true, total_bill_amount: true },
                where: { ...orgJobFilter, week_start_date: { gte: startOfMonth() } },
            }),
        ]);
        return (0, response_1.sendSuccess)(res, {
            pendingApproval,
            recentTimesheets,
            hoursThisMonth: {
                totalHours: hoursThisMonth._sum.total_hours ?? 0,
                totalBilled: hoursThisMonth._sum.total_bill_amount ?? 0,
            },
        });
    }
    catch (err) {
        console.error(err);
        return (0, response_1.sendError)(res, "widgetClientTimesheets failed", 500);
    }
}
/**
 * GET /api/dashboard/widget/clientOffice/placements/:userId
 * Query: dateRange, limit
 */
async function widgetClientPlacements(req, res) {
    try {
        const userId = getUserId(req);
        const orgIds = await getClientOrgIds(userId);
        const limit = Number(req.query.limit ?? 10);
        const orgJobFilter = {
            application: { job: { organization_id: { in: orgIds } } },
        };
        const [activeAssignments, pendingContracts, recentAssignments] = await Promise.all([
            // Currently active placements
            prisma_config_1.default.assignment.count({
                where: { ...orgJobFilter, end_date: { gte: new Date() } },
            }),
            // Pending unsigned contracts
            prisma_config_1.default.contract.findMany({
                take: 5,
                where: {
                    organization_id: { in: orgIds },
                    signed_status: null,
                    status: { not: "SIGNED" },
                },
                select: {
                    contract_id: true,
                    contract_name: true,
                    status: true,
                    sent_status: true,
                    created_at: true,
                },
            }),
            // Recent active assignments with worker info
            prisma_config_1.default.assignment.findMany({
                take: limit,
                orderBy: { start_date: "desc" },
                where: {
                    ...orgJobFilter,
                    end_date: { gte: new Date() },
                },
                select: {
                    assignment_id: true,
                    start_date: true,
                    end_date: true,
                    application: {
                        select: {
                            applicant: { select: { full_name: true } },
                            job: { select: { job_title: true } },
                        },
                    },
                },
            }),
        ]);
        return (0, response_1.sendSuccess)(res, {
            activeAssignments,
            pendingContracts,
            recentAssignments,
        });
    }
    catch (err) {
        console.error(err);
        return (0, response_1.sendError)(res, "widgetClientPlacements failed", 500);
    }
}
/**
 * GET /api/dashboard/widget/frontOffice/jobRequests/:userId
 * Jobs where the authenticated user is the manager — a quick glance at their managed workload.
 * Query: statuses (comma-sep JobStatus), dateRange, limit
 */
async function widgetJobRequests(req, res) {
    try {
        const userId = getUserId(req);
        const since = resolveDateRange(req.query.dateRange);
        const statusFilter = filterEnum(parseStatuses(req.query.statuses), client_1.JobStatus);
        const limit = Number(req.query.limit ?? 10);
        const where = {
            manager_id: userId,
            ...(statusFilter ? { status: { in: statusFilter } } : {}),
            ...(since ? { created_at: { gte: since } } : {}),
        };
        const [total, byStatus, jobs] = await Promise.all([
            prisma_config_1.default.job.count({ where }),
            prisma_config_1.default.job.groupBy({
                by: ["status"],
                where: { manager_id: userId },
                _count: { job_id: true },
            }),
            prisma_config_1.default.job.findMany({
                take: limit,
                orderBy: { created_at: "desc" },
                where,
                select: {
                    job_id: true,
                    job_title: true,
                    status: true,
                    job_type: true,
                    location: true,
                    open_positions: true,
                    max_positions: true,
                    start_date: true,
                    end_date: true,
                    approved: true,
                    created_at: true,
                    organization: {
                        select: {
                            organization_id: true,
                            name: true,
                            status: true,
                        },
                    },
                    company_office: {
                        select: {
                            company_office_id: true,
                            office_name: true,
                            city: true,
                            state: true,
                        },
                    },
                    _count: { select: { applications: true } },
                },
            }),
        ]);
        return (0, response_1.sendSuccess)(res, {
            total,
            byStatus: byStatus.map((j) => ({ status: j.status, count: j._count.job_id })),
            jobs: jobs.map((j) => ({
                ...j,
                applicationCount: j._count.applications,
                _count: undefined,
            })),
        });
    }
    catch (err) {
        console.error(err);
        return (0, response_1.sendError)(res, "widgetJobRequests failed", 500);
    }
}
/**
 * GET /api/dashboard/widget/frontOffice/expiringDocuments/:userId
 * Organization documents expiring within the next 60 days OR already overdue,
 * bucketed by urgency with color metadata for the frontend.
 *
 * Buckets (days remaining):
 *   overdue   → < 0 days   → color: red    (#ef4444)
 *   critical  → 1–15 days  → color: red    (#ef4444)
 *   warning   → 16–30 days → color: orange (#f97316)
 *   attention → 31–45 days → color: orange (#f97316)
 *   watch     → 46–60 days → color: yellow (#eab308)
 *
 * Query: limit (default 50)
 */
async function widgetExpiringDocuments(req, res) {
    try {
        const limit = Number(req.query.limit ?? 50);
        const now = new Date();
        const cutoff = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
        // Fetch docs expiring within 60 days AND already-overdue ones
        const documents = await prisma_config_1.default.organizationDocument.findMany({
            take: limit,
            orderBy: { expiration_date: "asc" },
            where: {
                expiration_date: { lte: cutoff },
            },
            select: {
                document_id: true,
                document_name: true,
                document_type: true,
                privacy: true,
                expiration_date: true,
                expiration_reason: true,
                upload_date: true,
                organization: {
                    select: { organization_id: true, name: true, status: true },
                },
                title: {
                    select: { document_title_id: true, document_title: true },
                },
                user: {
                    select: { user_id: true, name: true, email: true },
                },
            },
        });
        const bucketMeta = {
            overdue: { label: "Overdue", color: "#ef4444", bgColor: "#fee2e2", daysRange: "past due" },
            critical: { label: "Critical", color: "#ef4444", bgColor: "#fee2e2", daysRange: "1–15 days" },
            warning: { label: "Warning", color: "#f97316", bgColor: "#ffedd5", daysRange: "16–30 days" },
            attention: { label: "Attention", color: "#f97316", bgColor: "#ffedd5", daysRange: "31–45 days" },
            watch: { label: "Watch", color: "#eab308", bgColor: "#fef9c3", daysRange: "46–60 days" },
        };
        const grouped = {
            overdue: [], critical: [], warning: [], attention: [], watch: [],
        };
        for (const doc of documents) {
            const msLeft = doc.expiration_date.getTime() - now.getTime();
            const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));
            let bucket;
            if (daysLeft < 0)
                bucket = "overdue";
            else if (daysLeft <= 15)
                bucket = "critical";
            else if (daysLeft <= 30)
                bucket = "warning";
            else if (daysLeft <= 45)
                bucket = "attention";
            else
                bucket = "watch";
            const meta = bucketMeta[bucket];
            grouped[bucket].push({
                ...doc,
                organization: {
                    organization_id: doc.organization.organization_id,
                    name: doc.organization.name,
                    status: doc.organization.status,
                },
                days_left: daysLeft,
                is_overdue: daysLeft < 0,
                bucket,
                color: meta.color,
                bg_color: meta.bgColor,
            });
        }
        const buildBucket = (key) => ({
            ...bucketMeta[key],
            count: grouped[key].length,
            documents: grouped[key],
        });
        return (0, response_1.sendSuccess)(res, {
            total: documents.length,
            lookahead: 60,
            summary: {
                overdue: grouped.overdue.length,
                critical: grouped.critical.length,
                warning: grouped.warning.length,
                attention: grouped.attention.length,
                watch: grouped.watch.length,
            },
            buckets: {
                overdue: buildBucket("overdue"),
                critical: buildBucket("critical"),
                warning: buildBucket("warning"),
                attention: buildBucket("attention"),
                watch: buildBucket("watch"),
            },
        });
    }
    catch (err) {
        console.error(err);
        return (0, response_1.sendError)(res, "widgetExpiringDocuments failed", 500);
    }
}
/**
 * POST /api/dashboard/widget/frontOffice/expiringDocuments/sendReminders
 * Sends expiry reminder emails to the uploader of each document that is
 * overdue or expiring within 60 days. Safe to call from a cron job or manually.
 */
async function sendExpiryReminderEmails(req, res) {
    try {
        const now = new Date();
        const cutoff = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
        const documents = await prisma_config_1.default.organizationDocument.findMany({
            where: { expiration_date: { lte: cutoff } },
            select: {
                document_id: true,
                document_name: true,
                document_type: true,
                expiration_date: true,
                expiration_reason: true,
                organization: { select: { name: true } },
                title: { select: { document_title: true } },
                user: { select: { name: true, email: true } },
            },
        });
        const results = await Promise.all(documents.map(async (doc) => {
            const daysLeft = Math.ceil((doc.expiration_date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            const result = await (0, emailService_1.sendDocumentExpiryReminderEmail)({
                recipientEmail: doc.user.email,
                recipientName: doc.user.name,
                documentName: doc.document_name,
                documentType: doc.document_type,
                documentTitle: doc.title.document_title,
                organizationName: doc.organization.name,
                expirationDate: doc.expiration_date,
                expirationReason: doc.expiration_reason,
                daysLeft,
            });
            return {
                document_id: doc.document_id,
                document_name: doc.document_name,
                recipient: doc.user.email,
                days_left: daysLeft,
                is_overdue: daysLeft < 0,
                email_sent: result.success,
                error: result.error ?? null,
            };
        }));
        const sent = results.filter((r) => r.email_sent).length;
        const failed = results.filter((r) => !r.email_sent).length;
        return (0, response_1.sendSuccess)(res, {
            message: `Reminder emails sent: ${sent} succeeded, ${failed} failed`,
            total: results.length,
            sent,
            failed,
            results,
        });
    }
    catch (err) {
        console.error(err);
        return (0, response_1.sendError)(res, "sendExpiryReminderEmails failed", 500);
    }
}
/**
 * GET /api/dashboard/widget/clientOffice/myTasks/:userId
 * Query: statuses, limit
 */
async function widgetClientMyTasks(req, res) {
    try {
        const userId = getUserId(req);
        const statusFilter = parseStatuses(req.query.statuses);
        const limit = Number(req.query.limit ?? 10);
        const tasks = await prisma_config_1.default.task.findMany({
            take: limit,
            orderBy: { due_date: "asc" },
            where: {
                assigned_to_user_id: userId,
                ...(statusFilter ? { status: { in: statusFilter } } : {}),
            },
            select: {
                task_id: true,
                description: true,
                status: true,
                due_date: true,
            },
        });
        return (0, response_1.sendSuccess)(res, { tasks });
    }
    catch (err) {
        console.error(err);
        return (0, response_1.sendError)(res, "widgetClientMyTasks failed", 500);
    }
}
//# sourceMappingURL=dashboardController.js.map