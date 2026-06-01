"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOrganizationTimesheets = exports.getOrganizationInvoices = exports.getOrganizationActivities = exports.getOrganizationContracts = exports.getOrganizationStats = exports.getOrganizationApplicants = exports.getOrganizationJobs = exports.getOrganizationUsers = void 0;
const prisma_config_1 = __importDefault(require("../../prisma.config"));
const response_1 = require("../../utils/response");
// ─────────────────────────────────────────────────────────────
// HELPER — safe integer parser
// ─────────────────────────────────────────────────────────────
function parsePage(val, defaultLimit = 10) {
    const page = Math.max(1, parseInt(val?.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(val?.limit) || defaultLimit));
    return { page, limit, skip: (page - 1) * limit };
}
// ============================================================
// 1.  GET /api/organizations/:id/users
//     Paginated list of OrganizationUser rows for an org.
//     Query params:
//       page, limit, search (name/email/title), division,
//       department, status (ACTIVE | INACTIVE)
// ============================================================
const getOrganizationUsers = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id)
            return (0, response_1.sendError)(res, 'Organization ID is required', 400);
        const { page: pageQ, limit: limitQ, search, division, department, status, } = req.query;
        const { page, limit, skip } = parsePage({ page: pageQ, limit: limitQ });
        // Build filter on the joined User
        const userWhere = {
            ...(status ? { status: status.toUpperCase() } : {}),
            ...(search?.trim()
                ? {
                    OR: [
                        { name: { contains: search.trim(), mode: 'insensitive' } },
                        { email: { contains: search.trim(), mode: 'insensitive' } },
                    ],
                }
                : {}),
        };
        const ouWhere = {
            organization_id: id,
            ...(division?.trim() ? { division: { contains: division.trim(), mode: 'insensitive' } } : {}),
            ...(department?.trim() ? { department: { contains: department.trim(), mode: 'insensitive' } } : {}),
            user: userWhere,
        };
        const [rows, total] = await Promise.all([
            prisma_config_1.default.organizationUser.findMany({
                where: ouWhere,
                skip,
                take: limit,
                orderBy: { user: { name: 'asc' } },
                select: {
                    organization_user_id: true,
                    division: true,
                    department: true,
                    title: true,
                    work_phone: true,
                    user: {
                        select: {
                            user_id: true,
                            name: true,
                            email: true,
                            status: true,
                            created_at: true,
                            user_role: {
                                select: {
                                    role: { select: { role_name: true } },
                                },
                            },
                            profile: {
                                select: {
                                    avatar_url: true,
                                    mobile_phone: true,
                                    title: true,
                                },
                            },
                        },
                    },
                    // How many contact-preview calls this person has logged for the org
                    contact_previews: {
                        select: { preview_id: true, type: true, date: true },
                        orderBy: { date: 'desc' },
                        take: 1, // just the latest preview per user
                    },
                },
            }),
            prisma_config_1.default.organizationUser.count({ where: ouWhere }),
        ]);
        // Flatten for frontend convenience
        const data = rows.map((ou) => ({
            organization_user_id: ou.organization_user_id,
            user_id: ou.user.user_id,
            name: ou.user.name,
            email: ou.user.email,
            status: ou.user.status,
            role: ou.user.user_role?.role?.role_name ?? null,
            avatar_url: ou.user.profile?.avatar_url ?? null,
            title: ou.title ?? ou.user.profile?.title ?? null,
            division: ou.division ?? null,
            department: ou.department ?? null,
            work_phone: ou.work_phone ?? ou.user.profile?.mobile_phone ?? null,
            joined_at: ou.user.created_at,
            last_contact_type: ou.contact_previews[0]?.type ?? null,
            last_contacted_at: ou.contact_previews[0]?.date ?? null,
        }));
        return (0, response_1.sendSuccess)(res, {
            data,
            paging: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        });
    }
    catch (err) {
        console.error('getOrganizationUsers error:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch organization users', 500);
    }
};
exports.getOrganizationUsers = getOrganizationUsers;
// ============================================================
// 2.  GET /api/organizations/:id/jobs
//     Paginated list of Jobs belonging to an org.
//     Query params:
//       page, limit, search (title/custom_job_id),
//       status (DRAFT|PENDING|OPEN|CLOSED|DECLINED),
//       job_type, job_category, job_branch
// ============================================================
const getOrganizationJobs = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id)
            return (0, response_1.sendError)(res, 'Organization ID is required', 400);
        const { page: pageQ, limit: limitQ, search, status, job_type, job_category, job_branch, } = req.query;
        const { page, limit, skip } = parsePage({ page: pageQ, limit: limitQ });
        const where = {
            organization_id: id,
            ...(status ? { status: status.toUpperCase() } : {}),
            ...(job_type ? { job_type: job_type.toUpperCase() } : {}),
            ...(job_category ? { job_category: job_category.toUpperCase() } : {}),
            ...(job_branch ? { job_branch: job_branch.toUpperCase() } : {}),
            ...(search?.trim()
                ? {
                    OR: [
                        { job_title: { contains: search.trim(), mode: 'insensitive' } },
                        { custom_job_id: { contains: search.trim(), mode: 'insensitive' } },
                        { city: { contains: search.trim(), mode: 'insensitive' } },
                    ],
                }
                : {}),
        };
        const [rows, total, statusCounts] = await Promise.all([
            prisma_config_1.default.job.findMany({
                where,
                skip,
                take: limit,
                orderBy: { created_at: 'desc' },
                select: {
                    job_id: true,
                    job_title: true,
                    status: true,
                    job_type: true,
                    job_category: true,
                    job_branch: true,
                    location: true,
                    city: true,
                    state: true,
                    start_date: true,
                    end_date: true,
                    open_date: true,
                    created_at: true,
                    max_positions: true,
                    open_positions: true,
                    custom_job_id: true,
                    approved: true,
                    pay_period: true,
                    rate_type: true,
                    // Manager details
                    manager: {
                        select: {
                            user_id: true,
                            name: true,
                            email: true,
                        },
                    },
                    // Aggregate counts — avoid loading full arrays
                    _count: {
                        select: {
                            applications: true,
                            job_owners: true,
                        },
                    },
                    // Latest rate for display
                    job_rates: {
                        select: {
                            pay_rate: true,
                            bill_rate: true,
                        },
                        take: 1,
                        orderBy: { job_rate_id: 'desc' },
                    },
                    // Active pipeline stages summary
                    applications: {
                        select: {
                            status: true,
                            pipeline_stages: {
                                select: { stage_name: true },
                                orderBy: { pipeline_date: 'desc' },
                                take: 1,
                            },
                        },
                    },
                },
            }),
            prisma_config_1.default.job.count({ where }),
            // Status breakdown for sidebar/tabs — always scoped to this org
            prisma_config_1.default.job.groupBy({
                by: ['status'],
                where: { organization_id: id },
                _count: { status: true },
            }),
        ]);
        const data = rows.map((job) => ({
            job_id: job.job_id,
            job_title: job.job_title,
            status: job.status,
            job_type: job.job_type,
            job_category: job.job_category ?? null,
            job_branch: job.job_branch ?? null,
            location: job.city && job.state ? `${job.city}, ${job.state}` : (job.location ?? null),
            start_date: job.start_date ?? null,
            end_date: job.end_date ?? null,
            open_date: job.open_date ?? null,
            created_at: job.created_at,
            max_positions: job.max_positions ?? null,
            open_positions: job.open_positions ?? null,
            custom_job_id: job.custom_job_id ?? null,
            approved: job.approved,
            pay_period: job.pay_period,
            rate_type: job.rate_type,
            pay_rate: job.job_rates[0]?.pay_rate ?? null,
            bill_rate: job.job_rates[0]?.bill_rate ?? null,
            manager_id: job.manager?.user_id ?? null,
            manager_name: job.manager?.name ?? null,
            manager_email: job.manager?.email ?? null,
            total_applicants: job._count.applications,
            hired_count: job.applications.filter((a) => a.status === 'HIRED').length,
        }));
        // Convert groupBy to a clean { OPEN: 4, CLOSED: 2, … } map
        const byStatus = statusCounts.reduce((acc, g) => {
            acc[g.status] = g._count.status;
            return acc;
        }, {});
        return (0, response_1.sendSuccess)(res, {
            data,
            paging: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
            statusBreakdown: byStatus, // useful for tabs/badges in the UI
        });
    }
    catch (err) {
        console.error('getOrganizationJobs error:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch organization jobs', 500);
    }
};
exports.getOrganizationJobs = getOrganizationJobs;
// ============================================================
// 3.  GET /api/organizations/:id/applicants
//     Paginated list of Applicants who have at least one
//     Application for a Job belonging to this org.
//     Query params:
//       page, limit, search (name/email/phone),
//       status (ApplicationStatus), pipeline_stage,
//       job_id (filter to a specific job within this org)
// ============================================================
const getOrganizationApplicants = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id)
            return (0, response_1.sendError)(res, 'Organization ID is required', 400);
        const { page: pageQ, limit: limitQ, search, status, pipeline_stage, job_id, } = req.query;
        const { page, limit, skip } = parsePage({ page: pageQ, limit: limitQ });
        // Find applicant_ids who applied to this org's jobs
        // We do this via applications → job → organization
        const applicationWhere = {
            job: { organization_id: id },
            ...(job_id ? { job_id } : {}),
            ...(status ? { status: status.toUpperCase() } : {}),
            ...(pipeline_stage
                ? {
                    pipeline_stages: {
                        some: { stage_name: pipeline_stage.toUpperCase() },
                    },
                }
                : {}),
        };
        // Applicant-level search
        const applicantWhere = {
            applications: { some: applicationWhere },
            ...(search?.trim()
                ? {
                    OR: [
                        { full_name: { contains: search.trim(), mode: 'insensitive' } },
                        { contact: { email: { contains: search.trim(), mode: 'insensitive' } } },
                        { contact: { phone: { contains: search.trim(), mode: 'insensitive' } } },
                    ],
                }
                : {}),
        };
        const [rows, total] = await Promise.all([
            prisma_config_1.default.applicant.findMany({
                where: applicantWhere,
                skip,
                take: limit,
                orderBy: { created_at: 'desc' },
                select: {
                    applicant_id: true,
                    full_name: true,
                    first_name: true,
                    last_name: true,
                    headline: true,
                    status: true,
                    first_impression: true,
                    add_to_hotlist: true,
                    source: true,
                    created_at: true,
                    last_active_at: true,
                    contact: {
                        select: {
                            email: true,
                            phone: true,
                            city: true,
                            state: true,
                        },
                    },
                    classification: {
                        select: {
                            talent_status: true,
                            position_categories: true,
                            skill_sets: true,
                        },
                    },
                    // Applications scoped to THIS org only
                    applications: {
                        where: { job: { organization_id: id } },
                        select: {
                            application_id: true,
                            status: true,
                            applied_at: true,
                            job: {
                                select: {
                                    job_id: true,
                                    job_title: true,
                                    status: true,
                                },
                            },
                            pipeline_stages: {
                                select: { stage_name: true, pipeline_date: true },
                                orderBy: { pipeline_date: 'desc' },
                                take: 1,
                            },
                            assignment: {
                                select: {
                                    assignment_id: true,
                                    start_date: true,
                                    end_date: true,
                                    employment_type: true,
                                },
                            },
                        },
                        orderBy: { applied_at: 'desc' },
                    },
                    // Latest resume document
                    documents: {
                        where: { document_type: 'RESUME' },
                        select: { file_url: true, created_at: true },
                        orderBy: { created_at: 'desc' },
                        take: 1,
                    },
                },
            }),
            prisma_config_1.default.applicant.count({ where: applicantWhere }),
        ]);
        const data = rows.map((a) => ({
            applicant_id: a.applicant_id,
            full_name: a.full_name,
            first_name: a.first_name ?? null,
            last_name: a.last_name ?? null,
            headline: a.headline ?? null,
            status: a.status,
            talent_status: a.classification?.talent_status ?? null,
            first_impression: a.first_impression ?? null,
            on_hotlist: a.add_to_hotlist ?? false,
            source: a.source ?? null,
            email: a.contact?.email ?? null,
            phone: a.contact?.phone ?? null,
            location: a.contact?.city && a.contact?.state
                ? `${a.contact.city}, ${a.contact.state}`
                : null,
            position_categories: a.classification?.position_categories ?? [],
            skills: a.classification?.skill_sets ?? [],
            resume_url: a.documents[0]?.file_url ?? null,
            // Applications summary for this org
            application_count: a.applications.length,
            applications: a.applications.map((app) => ({
                application_id: app.application_id,
                status: app.status,
                applied_at: app.applied_at,
                job_id: app.job.job_id,
                job_title: app.job.job_title,
                job_status: app.job.status,
                latest_stage: app.pipeline_stages[0]?.stage_name ?? null,
                stage_date: app.pipeline_stages[0]?.pipeline_date ?? null,
                is_assigned: !!app.assignment,
                assignment_id: app.assignment?.assignment_id ?? null,
                assignment_start: app.assignment?.start_date ?? null,
                assignment_end: app.assignment?.end_date ?? null,
                employment_type: app.assignment?.employment_type ?? null,
            })),
            last_active_at: a.last_active_at ?? null,
            created_at: a.created_at,
        }));
        return (0, response_1.sendSuccess)(res, {
            data,
            paging: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        });
    }
    catch (err) {
        console.error('getOrganizationApplicants error:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch organization applicants', 500);
    }
};
exports.getOrganizationApplicants = getOrganizationApplicants;
// ============================================================
// 4.  GET /api/organizations/:id/stats
//     Dashboard-level aggregate stats for a single org.
//     No pagination — single object response.
// ============================================================
const getOrganizationStats = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id)
            return (0, response_1.sendError)(res, 'Organization ID is required', 400);
        const orgExists = await prisma_config_1.default.organization.findUnique({
            where: { organization_id: id },
            select: { organization_id: true, name: true },
        });
        if (!orgExists)
            return (0, response_1.sendError)(res, 'Organization not found', 404);
        const [jobCounts, applicationCounts, assignmentCount, contractCount, openInvoicesAgg, activeTimesheetCount, recentActivities, topJobs,] = await Promise.all([
            // Jobs by status
            prisma_config_1.default.job.groupBy({
                by: ['status'],
                where: { organization_id: id },
                _count: { status: true },
            }),
            // Applications by status (across all org jobs)
            prisma_config_1.default.application.groupBy({
                by: ['status'],
                where: { job: { organization_id: id } },
                _count: { status: true },
            }),
            // Total active assignments
            prisma_config_1.default.assignment.count({
                where: {
                    application: { job: { organization_id: id } },
                    end_date: { gte: new Date() },
                },
            }),
            // Contracts
            prisma_config_1.default.contract.count({ where: { organization_id: id } }),
            // Open invoices aggregate (SENT + OVERDUE)
            prisma_config_1.default.invoice.aggregate({
                where: {
                    assignment: { application: { job: { organization_id: id } } },
                    status: { in: ['SENT', 'OVERDUE'] },
                },
                _sum: { total_amount: true },
                _count: { invoice_id: true },
            }),
            // Timesheets awaiting review
            prisma_config_1.default.timesheet.count({
                where: {
                    status: { in: ['SUBMITTED', 'UNDER_REVIEW'] },
                    assignment: { application: { job: { organization_id: id } } },
                },
            }),
            // Last 10 org activities
            prisma_config_1.default.organizationActivity.findMany({
                where: { organization_id: id },
                orderBy: { created_at: 'desc' },
                take: 10,
                select: {
                    activity_id: true,
                    activity_type: true,
                    details: true,
                    created_at: true,
                    logged_by: {
                        select: { user_id: true, name: true },
                    },
                },
            }),
            // Top 5 jobs by applicant count
            prisma_config_1.default.job.findMany({
                where: { organization_id: id },
                orderBy: { applications: { _count: 'desc' } },
                take: 5,
                select: {
                    job_id: true,
                    job_title: true,
                    status: true,
                    _count: { select: { applications: true } },
                },
            }),
        ]);
        const jobsByStatus = jobCounts.reduce((acc, g) => { acc[g.status] = g._count.status; return acc; }, {});
        const appsByStatus = applicationCounts.reduce((acc, g) => { acc[g.status] = g._count.status; return acc; }, {});
        const totalJobs = Object.values(jobsByStatus).reduce((s, v) => s + v, 0);
        const totalApplicants = Object.values(appsByStatus).reduce((s, v) => s + v, 0);
        return (0, response_1.sendSuccess)(res, {
            jobs: {
                total: totalJobs,
                by_status: jobsByStatus,
            },
            applicants: {
                total: totalApplicants,
                by_status: appsByStatus,
            },
            active_assignments: assignmentCount,
            total_contracts: contractCount,
            open_invoices: {
                count: openInvoicesAgg._count.invoice_id,
                amount: openInvoicesAgg._sum.total_amount ?? 0,
            },
            timesheets_pending_review: activeTimesheetCount,
            recent_activities: recentActivities,
            top_jobs_by_applicants: topJobs.map((j) => ({
                job_id: j.job_id,
                job_title: j.job_title,
                status: j.status,
                applicant_count: j._count.applications,
            })),
        });
    }
    catch (err) {
        console.error('getOrganizationStats error:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch organization stats', 500);
    }
};
exports.getOrganizationStats = getOrganizationStats;
// ============================================================
// 5.  GET /api/organizations/:id/contracts
//     Paginated contracts for an org.
//     Query params: page, limit, status, search
// ============================================================
const getOrganizationContracts = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id)
            return (0, response_1.sendError)(res, 'Organization ID is required', 400);
        const { page: pageQ, limit: limitQ, status, search } = req.query;
        const { page, limit, skip } = parsePage({ page: pageQ, limit: limitQ });
        const where = {
            organization_id: id,
            ...(status ? { status: status.toUpperCase() } : {}),
            ...(search?.trim()
                ? { contract_name: { contains: search.trim(), mode: 'insensitive' } }
                : {}),
        };
        const [rows, total] = await Promise.all([
            prisma_config_1.default.contract.findMany({
                where,
                skip,
                take: limit,
                orderBy: { created_at: 'desc' },
                include: {
                    user: {
                        select: { user_id: true, name: true, email: true },
                    },
                },
            }),
            prisma_config_1.default.contract.count({ where }),
        ]);
        return (0, response_1.sendSuccess)(res, {
            data: rows,
            paging: { total, page, limit, totalPages: Math.ceil(total / limit) },
        });
    }
    catch (err) {
        console.error('getOrganizationContracts error:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch organization contracts', 500);
    }
};
exports.getOrganizationContracts = getOrganizationContracts;
// ============================================================
// 6.  GET /api/organizations/:id/activities
//     Paginated activity log for an org.
//     Query params: page, limit, type (OrgActivityType)
// ============================================================
const getOrganizationActivities = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id)
            return (0, response_1.sendError)(res, 'Organization ID is required', 400);
        const { page: pageQ, limit: limitQ, type } = req.query;
        const { page, limit, skip } = parsePage({ page: pageQ, limit: limitQ });
        const where = {
            organization_id: id,
            ...(type ? { activity_type: type.toUpperCase() } : {}),
        };
        const [rows, total] = await Promise.all([
            prisma_config_1.default.organizationActivity.findMany({
                where,
                skip,
                take: limit,
                orderBy: { created_at: 'desc' },
                include: {
                    logged_by: {
                        select: { user_id: true, name: true, email: true },
                    },
                },
            }),
            prisma_config_1.default.organizationActivity.count({ where }),
        ]);
        return (0, response_1.sendSuccess)(res, {
            data: rows,
            paging: { total, page, limit, totalPages: Math.ceil(total / limit) },
        });
    }
    catch (err) {
        console.error('getOrganizationActivities error:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch organization activities', 500);
    }
};
exports.getOrganizationActivities = getOrganizationActivities;
// ============================================================
// 7.  GET /api/organizations/:id/invoices
//     Paginated invoices tied to assignments under this org.
//     Query params: page, limit, status
// ============================================================
const getOrganizationInvoices = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id)
            return (0, response_1.sendError)(res, 'Organization ID is required', 400);
        const { page: pageQ, limit: limitQ, status } = req.query;
        const { page, limit, skip } = parsePage({ page: pageQ, limit: limitQ });
        const where = {
            assignment: { application: { job: { organization_id: id } } },
            ...(status ? { status: status.toUpperCase() } : {}),
        };
        const [rows, total, totalAgg] = await Promise.all([
            prisma_config_1.default.invoice.findMany({
                where,
                skip,
                take: limit,
                orderBy: { invoice_date: 'desc' },
                select: {
                    invoice_id: true,
                    invoice_number: true,
                    status: true,
                    invoice_date: true,
                    due_date: true,
                    paid_at: true,
                    regular_hours: true,
                    ot_hours: true,
                    total_amount: true,
                    bill_rate: true,
                    assignment: {
                        select: {
                            application: {
                                select: {
                                    applicant: {
                                        select: { applicant_id: true, full_name: true },
                                    },
                                    job: {
                                        select: { job_id: true, job_title: true },
                                    },
                                },
                            },
                        },
                    },
                },
            }),
            prisma_config_1.default.invoice.count({ where }),
            prisma_config_1.default.invoice.aggregate({
                where,
                _sum: { total_amount: true },
            }),
        ]);
        const data = rows.map((inv) => ({
            invoice_id: inv.invoice_id,
            invoice_number: inv.invoice_number,
            status: inv.status,
            invoice_date: inv.invoice_date,
            due_date: inv.due_date,
            paid_at: inv.paid_at ?? null,
            regular_hours: inv.regular_hours,
            ot_hours: inv.ot_hours,
            total_amount: inv.total_amount,
            bill_rate: inv.bill_rate,
            applicant_id: inv.assignment?.application?.applicant?.applicant_id ?? null,
            applicant_name: inv.assignment?.application?.applicant?.full_name ?? null,
            job_id: inv.assignment?.application?.job?.job_id ?? null,
            job_title: inv.assignment?.application?.job?.job_title ?? null,
        }));
        return (0, response_1.sendSuccess)(res, {
            data,
            total_amount: totalAgg._sum.total_amount ?? 0,
            paging: { total, page, limit, totalPages: Math.ceil(total / limit) },
        });
    }
    catch (err) {
        console.error('getOrganizationInvoices error:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch organization invoices', 500);
    }
};
exports.getOrganizationInvoices = getOrganizationInvoices;
// ============================================================
// 8.  GET /api/organizations/:id/timesheets
//     Paginated timesheets tied to assignments under this org.
//     Query params: page, limit, status, week_start_date
// ============================================================
const getOrganizationTimesheets = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id)
            return (0, response_1.sendError)(res, 'Organization ID is required', 400);
        const { page: pageQ, limit: limitQ, status, week_start_date } = req.query;
        const { page, limit, skip } = parsePage({ page: pageQ, limit: limitQ });
        const where = {
            assignment: { application: { job: { organization_id: id } } },
            ...(status ? { status: status.toUpperCase() } : {}),
            ...(week_start_date ? { week_start_date: { gte: new Date(week_start_date) } } : {}),
        };
        const [rows, total] = await Promise.all([
            prisma_config_1.default.timesheet.findMany({
                where,
                skip,
                take: limit,
                orderBy: { week_start_date: 'desc' },
                select: {
                    timesheet_id: true,
                    week_start_date: true,
                    week_end_date: true,
                    status: true,
                    total_regular_hours: true,
                    total_ot_hours: true,
                    total_hours: true,
                    total_bill_amount: true,
                    total_pay_amount: true,
                    submitted_at: true,
                    approved_at: true,
                    rejected_at: true,
                    rejection_reason: true,
                    assignment: {
                        select: {
                            employment_type: true,
                            application: {
                                select: {
                                    applicant: { select: { applicant_id: true, full_name: true } },
                                    job: { select: { job_id: true, job_title: true } },
                                },
                            },
                        },
                    },
                    reviewed_by: { select: { user_id: true, name: true } },
                },
            }),
            prisma_config_1.default.timesheet.count({ where }),
        ]);
        const data = rows.map((ts) => ({
            timesheet_id: ts.timesheet_id,
            week_start_date: ts.week_start_date,
            week_end_date: ts.week_end_date,
            status: ts.status,
            total_regular_hours: ts.total_regular_hours,
            total_ot_hours: ts.total_ot_hours,
            total_hours: ts.total_hours,
            total_bill_amount: ts.total_bill_amount ?? null,
            total_pay_amount: ts.total_pay_amount ?? null,
            submitted_at: ts.submitted_at ?? null,
            approved_at: ts.approved_at ?? null,
            rejected_at: ts.rejected_at ?? null,
            rejection_reason: ts.rejection_reason ?? null,
            employment_type: ts.assignment?.employment_type ?? null,
            applicant_id: ts.assignment?.application?.applicant?.applicant_id ?? null,
            applicant_name: ts.assignment?.application?.applicant?.full_name ?? null,
            job_id: ts.assignment?.application?.job?.job_id ?? null,
            job_title: ts.assignment?.application?.job?.job_title ?? null,
            reviewed_by_id: ts.reviewed_by?.user_id ?? null,
            reviewed_by_name: ts.reviewed_by?.name ?? null,
        }));
        return (0, response_1.sendSuccess)(res, {
            data,
            paging: { total, page, limit, totalPages: Math.ceil(total / limit) },
        });
    }
    catch (err) {
        console.error('getOrganizationTimesheets error:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch organization timesheets', 500);
    }
};
exports.getOrganizationTimesheets = getOrganizationTimesheets;
// ============================================================
// EXPORT — merge into your existing organizationController
// ============================================================
//
// Replace the export at the bottom of your file with:
//
// export const organizationController = {
//   ...baseCrud,
//   getAll:              getAllOrganizations,
//   getById:             getOrganizationById,
//   update:              updateOrganizationComplete,
//
//   // Sub-resource endpoints
//   getUsers:            getOrganizationUsers,
//   getJobs:             getOrganizationJobs,
//   getApplicants:       getOrganizationApplicants,
//
//   // Additional detail endpoints
//   getStats:            getOrganizationStats,
//   getContracts:        getOrganizationContracts,
//   getActivities:       getOrganizationActivities,
//   getInvoices:         getOrganizationInvoices,
//   getTimesheets:       getOrganizationTimesheets,
// };
//# sourceMappingURL=organizationFiltersController.js.map