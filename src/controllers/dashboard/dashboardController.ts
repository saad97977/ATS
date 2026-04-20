// dashboard.controller.ts
import { Request, Response } from "express";
import {
  PrismaClient,
  OrganizationStatus,
  TimesheetStatus,
  InvoiceStatus,
  JobStatus,
  ApplicationStatus,
  ApplicantStatus,
} from "@prisma/client";
import { sendSuccess, sendError } from "../../utils/response";

const prisma = new PrismaClient();

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

type OfficeType = "frontOffice" | "backOffice" | "clientOffice";

interface WidgetConfig {
  limit?: number;
  dateRange?: string; // "7d" | "30d" | "90d" | "365d" | "all"
  statuses?: string[];
  groupBy?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function getUserId(req: Request): string {
  // Prefer authenticated user_id from JWT; never trust URL param for identity.
  const authed = req.user?.user_id;
  if (authed) return authed;
  return req.params.userId;
}

/**
 * Converts a dateRange string like "30d" into a Date object for Prisma `gte` filters.
 * "all" or undefined returns undefined (no date filter).
 */
function resolveDateRange(dateRange?: string): Date | undefined {
  if (!dateRange || dateRange === "all") return undefined;
  const days = parseInt(dateRange.replace("d", ""), 10);
  if (isNaN(days)) return undefined;
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

/** Parse comma-separated statuses from query string */
function parseStatuses(raw?: string): string[] | undefined {
  if (!raw) return undefined;
  const arr = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return arr.length ? arr : undefined;
}

function filterEnum<T extends Record<string, string>>(
  raw: string[] | undefined,
  enumObj: T
): Array<T[keyof T]> | undefined {
  if (!raw?.length) return undefined;
  const allowed = new Set(Object.values(enumObj));
  const filtered = raw.filter((v) => allowed.has(v as any)) as Array<T[keyof T]>;
  return filtered.length ? filtered : undefined;
}

/** Start of current month */
function startOfMonth(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

// ─────────────────────────────────────────────────────────────────────────────
// PREFERENCES
// GET  /api/dashboard/preferences/:userId
// POST /api/dashboard/preferences/:userId
// ─────────────────────────────────────────────────────────────────────────────

export async function getDashboardPreference(req: Request, res: Response) {
  try {
    const userId = getUserId(req);
    const pref = await prisma.dashboardPreference.findUnique({
      where: { user_id: userId },
    });
    return sendSuccess(res, pref ?? { layout: [] });
  } catch (err) {
    console.error(err);
    return sendError(res, "Failed to fetch preferences", 500);
  }
}

export async function saveDashboardPreference(req: Request, res: Response) {
  try {
    const userId = getUserId(req);
    const { layout } = req.body;

    if (!req.user?.user_id) {
      return sendError(res, "Authentication required", 401);
    }

    if (!Array.isArray(layout)) {
      return sendError(res, "layout must be an array", 400);
    }

    // If user was deleted after token issuance, avoid a Prisma FK 500.
    const userExists = await prisma.user.findUnique({
      where: { user_id: userId },
      select: { user_id: true },
    });
    if (!userExists) {
      return sendError(res, "User not found", 404);
    }

    const pref = await prisma.dashboardPreference.upsert({
      where: { user_id: userId },
      create: { user_id: userId, layout },
      update: { layout },
    });

    return sendSuccess(res, pref);
  } catch (err) {
    console.error(err);
    return sendError(res, "Failed to save preferences", 500);
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
export async function widgetUserStats(req: Request, res: Response) {
  try {
    const userId = getUserId(req);
    const since = resolveDateRange(req.query.dateRange as string);

    const [total, active, inactive, byRole, recentUsers, newThisMonth] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { status: "ACTIVE" } }),
      prisma.user.count({ where: { status: "INACTIVE" } }),

      // Users grouped by role
      prisma.userRole.groupBy({
        by: ["role_id"],
        _count: { user_id: true },
      }),

      // Recently created users
      prisma.user.findMany({
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
      prisma.user.count({ where: { created_at: { gte: startOfMonth() } } }),
    ]);

    return sendSuccess(res, {
      total,
      active,
      inactive,
      newThisMonth,
      byRole,
      recentUsers,
    });
  } catch (err) {
    console.error(err);
    return sendError(res, "widgetUserStats failed", 500);
  }
}

/**
 * GET /api/dashboard/widget/backOffice/orgStats/:userId
 * Query: dateRange, statuses
 */
export async function widgetOrgStats(req: Request, res: Response) {
  try {
    const since = resolveDateRange(req.query.dateRange as string);
    const statusFilter = filterEnum(parseStatuses(req.query.statuses as string), OrganizationStatus);

    const [total, byStatus, topOrgs, recentOrgs] = await Promise.all([
      prisma.organization.count(),

      prisma.organization.groupBy({
        by: ["status"],
        _count: { organization_id: true },
      }),

      // Top orgs by job count
      prisma.organization.findMany({
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
      prisma.organization.findMany({
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

    return sendSuccess(res, {
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
  } catch (err) {
    console.error(err);
    return sendError(res, "widgetOrgStats failed", 500);
  }
}

/**
 * GET /api/dashboard/widget/backOffice/timesheets/:userId
 * Query: dateRange, statuses, limit
 */
export async function widgetTimesheets(req: Request, res: Response) {
  try {
    const since = resolveDateRange(req.query.dateRange as string);
    const statusFilter = filterEnum(parseStatuses(req.query.statuses as string), TimesheetStatus);
    const limit = Number(req.query.limit ?? 10);

    const whereBase = {
      ...(statusFilter ? { status: { in: statusFilter } } : {}),
      ...(since ? { created_at: { gte: since } } : {}),
    };

    const [pendingReview, byStatus, recentTimesheets, hoursThisMonth] = await Promise.all([
      prisma.timesheet.count({
        where: { status: { in: [TimesheetStatus.SUBMITTED, TimesheetStatus.UNDER_REVIEW] } },
      }),

      prisma.timesheet.groupBy({
        by: ["status"],
        _count: { timesheet_id: true },
        _sum: { total_hours: true, total_bill_amount: true },
      }),

      prisma.timesheet.findMany({
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
      prisma.timesheet.aggregate({
        _sum: { total_hours: true, total_bill_amount: true },
        where: { week_start_date: { gte: startOfMonth() } },
      }),
    ]);

    return sendSuccess(res, {
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
  } catch (err) {
    console.error(err);
    return sendError(res, "widgetTimesheets failed", 500);
  }
}

/**
 * GET /api/dashboard/widget/backOffice/invoiceStats/:userId
 * Query: dateRange, statuses, limit
 */
export async function widgetInvoiceStats(req: Request, res: Response) {
  try {
    const since = resolveDateRange(req.query.dateRange as string);
    const statusFilter = filterEnum(parseStatuses(req.query.statuses as string), InvoiceStatus);
    const limit = Number(req.query.limit ?? 8);

    const whereBase = {
      ...(statusFilter ? { status: { in: statusFilter } } : {}),
      ...(since ? { invoice_date: { gte: since } } : {}),
    };

    const [byStatus, recentInvoices, overdueSummary, totalRevenue] = await Promise.all([
      prisma.invoice.groupBy({
        by: ["status"],
        _count: { invoice_id: true },
        _sum: { total_amount: true },
      }),

      prisma.invoice.findMany({
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
      prisma.invoice.aggregate({
        _count: { invoice_id: true },
        _sum: { total_amount: true },
        where: { status: "OVERDUE" },
      }),

      // Total paid revenue this month
      prisma.invoice.aggregate({
        _sum: { total_amount: true },
        where: { status: "PAID", paid_at: { gte: startOfMonth() } },
      }),
    ]);

    return sendSuccess(res, {
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
  } catch (err) {
    console.error(err);
    return sendError(res, "widgetInvoiceStats failed", 500);
  }
}

/**
 * GET /api/dashboard/widget/backOffice/contracts/:userId
 * Query: dateRange, statuses, limit
 */
export async function widgetContracts(req: Request, res: Response) {
  try {
    const since = resolveDateRange(req.query.dateRange as string);
    const statusFilter = parseStatuses(req.query.statuses as string);
    const limit = Number(req.query.limit ?? 10);

    const [byStatus, recentContracts, pendingSignatures] = await Promise.all([
      prisma.contract.groupBy({
        by: ["status"],
        _count: { contract_id: true },
      }),

      prisma.contract.findMany({
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
      prisma.signatureRequest.count({ where: { status: "PENDING" } }),

      // Contracts expiring in next 30 days (if you have end_date)
      // prisma.contract.count({ where: { end_date: { lte: new Date(Date.now() + 30*24*60*60*1000), gte: new Date() } } }),
    ]);

    return sendSuccess(res, {
      byStatus: byStatus.map((c) => ({ status: c.status, count: c._count.contract_id })),
      recentContracts,
      pendingSignatures,
    });
  } catch (err) {
    console.error(err);
    return sendError(res, "widgetContracts failed", 500);
  }
}

/**
 * GET /api/dashboard/widget/backOffice/myTasks/:userId
 * Query: statuses, dateRange, limit
 */
export async function widgetMyTasksGrouped(req: Request, res: Response) {
  try {
    const userId = getUserId(req);
    const statusFilter = parseStatuses(req.query.statuses as string);
    const limit = Number(req.query.limit ?? 10);

    const [byStatus, upcoming] = await Promise.all([
      prisma.task.groupBy({
        by: ["status"],
        where: { assigned_to_user_id: userId },
        _count: { task_id: true },
      }),

      prisma.task.findMany({
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

    return sendSuccess(res, {
      byStatus: byStatus.map((t) => ({ status: t.status, count: t._count.task_id })),
      upcoming,
    });
  } catch (err) {
    console.error(err);
    return sendError(res, "widgetMyTasksGrouped failed", 500);
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
export async function widgetJobStats(req: Request, res: Response) {
  try {
    const userId = getUserId(req);
    const since = resolveDateRange(req.query.dateRange as string);
    const statusFilter = filterEnum(parseStatuses(req.query.statuses as string), JobStatus);
    const limit = Number(req.query.limit ?? 10);

    const [active, byStatus, myJobs, newThisMonth] = await Promise.all([
      prisma.job.count({ where: { status: "OPEN" } }),

      prisma.job.groupBy({
        by: ["status"],
        _count: { job_id: true },
      }),

      // Jobs owned by this user
      prisma.job.findMany({
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

      prisma.job.count({ where: { created_at: { gte: startOfMonth() } } }),
    ]);

    return sendSuccess(res, {
      active,
      newThisMonth,
      byStatus: byStatus.map((j) => ({ status: j.status, count: j._count.job_id })),
      myJobs,
    });
  } catch (err) {
    console.error(err);
    return sendError(res, "widgetJobStats failed", 500);
  }
}

/**
 * GET /api/dashboard/widget/frontOffice/applications/:userId
 * Query: dateRange, statuses, limit
 */
export async function widgetApplications(req: Request, res: Response) {
  try {
    const since = resolveDateRange(req.query.dateRange as string);
    const statusFilter = filterEnum(parseStatuses(req.query.statuses as string), ApplicationStatus);
    const limit = Number(req.query.limit ?? 15);

    const whereBase = {
      ...(statusFilter ? { status: { in: statusFilter } } : {}),
      ...(since ? { applied_at: { gte: since } } : {}),
    };

    const [byStatus, recentApplications, placedThisMonth, velocityByDay] = await Promise.all([
      prisma.application.groupBy({
        by: ["status"],
        _count: { application_id: true },
      }),

      prisma.application.findMany({
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

      prisma.application.count({
        where: { status: "HIRED", applied_at: { gte: startOfMonth() } },
      }),

      // Applications per day for the last 14 days (for trend chart)
      // Raw groupBy on date is tricky in Prisma — return raw recent list and let frontend compute
      prisma.application.findMany({
        where: { applied_at: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) } },
        select: { applied_at: true },
        orderBy: { applied_at: "asc" },
      }),
    ]);

    return sendSuccess(res, {
      byStatus: byStatus.map((a) => ({ status: a.status, count: a._count.application_id })),
      recentApplications,
      placedThisMonth,
      // Group velocity by date on frontend using applied_at timestamps
      velocityRaw: velocityByDay.map((a) => a.applied_at),
    });
  } catch (err) {
    console.error(err);
    return sendError(res, "widgetApplications failed", 500);
  }
}

/**
 * GET /api/dashboard/widget/frontOffice/pipeline/:userId
 * Returns stage-grouped pipeline data for Kanban view
 * Query: jobId (optional), dateRange, limit
 */
export async function widgetPipeline(req: Request, res: Response) {
  try {
    const { jobId } = req.query;
    const since = resolveDateRange(req.query.dateRange as string);
    const limit = Number(req.query.limit ?? 10);

    const [byStage, recentMovements] = await Promise.all([
      // Applications grouped by current pipeline stage
      prisma.pipelineStage.groupBy({
        by: ["stage_name"],
        _count: { pipeline_stage_id: true },
        where: {
          ...(jobId ? { application: { job_id: jobId as string } } : {}),
          ...(since ? { pipeline_date: { gte: since } } : {}),
        },
      }),

      // Recent pipeline movements
      prisma.pipelineStage.findMany({
        take: limit,
        orderBy: { pipeline_date: "desc" },
        where: {
          ...(jobId ? { application: { job_id: jobId as string } } : {}),
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

    return sendSuccess(res, {
      byStage: byStage.map((s) => ({ stage: s.stage_name, count: s._count.pipeline_stage_id })),
      recentMovements,
    });
  } catch (err) {
    console.error(err);
    return sendError(res, "widgetPipeline failed", 500);
  }
}

/**
 * GET /api/dashboard/widget/frontOffice/candidates/:userId
 * Query: dateRange, statuses, limit
 */
export async function widgetCandidates(req: Request, res: Response) {
  try {
    const since = resolveDateRange(req.query.dateRange as string);
    const statusFilter = filterEnum(parseStatuses(req.query.statuses as string), ApplicantStatus);
    const limit = Number(req.query.limit ?? 10);

    const [total, recentApplicants, topByScore, byStatus] = await Promise.all([
      prisma.applicant.count(),

      prisma.applicant.findMany({
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
      prisma.applicationEvaluation.findMany({
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

      prisma.applicant.groupBy({
        by: ["status"],
        _count: { applicant_id: true },
      }),
    ]);

    return sendSuccess(res, {
      total,
      byStatus: byStatus.map((s) => ({ status: s.status, count: s._count.applicant_id })),
      recentApplicants,
      topByScore,
    });
  } catch (err) {
    console.error(err);
    return sendError(res, "widgetCandidates failed", 500);
  }
}

/**
 * GET /api/dashboard/widget/frontOffice/interviews/:userId
 * Query: dateRange, statuses, limit
 */
export async function widgetInterviews(req: Request, res: Response) {
  try {
    const userId = getUserId(req);
    const since = resolveDateRange(req.query.dateRange as string);
    const limit = Number(req.query.limit ?? 10);

    const [openCount, upcoming, byStatus] = await Promise.all([
      // Open/pending interviews
      prisma.interview.count({
        where: { status: "PENDING", interview_date: { gte: new Date() } },
      }),

      // Upcoming interviews for this user's jobs
      prisma.interview.findMany({
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

      prisma.interview.groupBy({
        by: ["status"],
        _count: { interview_id: true },
      }),
    ]);

    return sendSuccess(res, {
      openCount,
      upcoming,
      byStatus: byStatus.map((i) => ({ status: i.status, count: i._count.interview_id })),
    });
  } catch (err) {
    console.error(err);
    return sendError(res, "widgetInterviews failed", 500);
  }
}

/**
 * GET /api/dashboard/widget/frontOffice/myTasks/:userId
 * Query: statuses, limit
 */
export async function widgetMyTasks(req: Request, res: Response) {
  try {
    const userId = getUserId(req);
    const statusFilter = parseStatuses(req.query.statuses as string);
    const limit = Number(req.query.limit ?? 10);

    const tasks = await prisma.task.findMany({
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

    return sendSuccess(res, { tasks });
  } catch (err) {
    console.error(err);
    return sendError(res, "widgetMyTasks failed", 500);
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
async function getClientOrgIds(userId: string): Promise<string[]> {
  const orgUsers = await prisma.organizationUser.findMany({
    where: { user_id: userId },
    select: { organization_id: true },
  });
  return orgUsers.map((o) => o.organization_id);
}

/**
 * GET /api/dashboard/widget/clientOffice/myOrgs/:userId
 */
export async function widgetMyOrgs(req: Request, res: Response) {
  try {
    const userId = getUserId(req);
    const orgIds = await getClientOrgIds(userId);

    const orgs = await prisma.organization.findMany({
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

    return sendSuccess(res, { orgs });
  } catch (err) {
    console.error(err);
    return sendError(res, "widgetMyOrgs failed", 500);
  }
}

/**
 * GET /api/dashboard/widget/clientOffice/jobStats/:userId
 * Query: dateRange, statuses, limit
 */
export async function widgetClientJobStats(req: Request, res: Response) {
  try {
    const userId = getUserId(req);
    const orgIds = await getClientOrgIds(userId);
    const since = resolveDateRange(req.query.dateRange as string);
    const statusFilter = filterEnum(parseStatuses(req.query.statuses as string), JobStatus);
    const limit = Number(req.query.limit ?? 10);

    const orgFilter = { organization_id: { in: orgIds } };

    const [active, byStatus, recentJobs] = await Promise.all([
      prisma.job.count({ where: { ...orgFilter, status: "OPEN" } }),

      prisma.job.groupBy({
        by: ["status"],
        where: orgFilter,
        _count: { job_id: true },
      }),

      prisma.job.findMany({
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

    return sendSuccess(res, {
      active,
      byStatus: byStatus.map((j) => ({ status: j.status, count: j._count.job_id })),
      recentJobs,
    });
  } catch (err) {
    console.error(err);
    return sendError(res, "widgetClientJobStats failed", 500);
  }
}

/**
 * GET /api/dashboard/widget/clientOffice/applicationFunnel/:userId
 * Query: dateRange, jobId
 */
export async function widgetApplicationFunnel(req: Request, res: Response) {
  try {
    const userId = getUserId(req);
    const orgIds = await getClientOrgIds(userId);
    const since = resolveDateRange(req.query.dateRange as string);
    const { jobId } = req.query;

    const where = {
      job: {
        organization_id: { in: orgIds },
        ...(jobId ? { job_id: jobId as string } : {}),
      },
      ...(since ? { applied_at: { gte: since } } : {}),
    };

    const [byStatus, recentApplications, placedCount] = await Promise.all([
      prisma.application.groupBy({
        by: ["status"],
        where,
        _count: { application_id: true },
      }),

      prisma.application.findMany({
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

      prisma.application.count({ where: { ...where, status: "HIRED" } }),
    ]);

    return sendSuccess(res, {
      funnel: byStatus.map((a) => ({ status: a.status, count: a._count.application_id })),
      recentApplications,
      placedCount,
    });
  } catch (err) {
    console.error(err);
    return sendError(res, "widgetApplicationFunnel failed", 500);
  }
}

/**
 * GET /api/dashboard/widget/clientOffice/invoices/:userId
 * Query: dateRange, statuses, limit
 */
export async function widgetClientInvoices(req: Request, res: Response) {
  try {
    const userId = getUserId(req);
    const orgIds = await getClientOrgIds(userId);
    const since = resolveDateRange(req.query.dateRange as string);
    const statusFilter = filterEnum(parseStatuses(req.query.statuses as string), InvoiceStatus);
    const limit = Number(req.query.limit ?? 8);

    const orgJobFilter = {
      assignment: { application: { job: { organization_id: { in: orgIds } } } },
    };

    const [openCount, overdueCount, recentInvoices, totalOutstanding] = await Promise.all([
      prisma.invoice.count({
        where: { ...orgJobFilter, status: { in: ["SENT", "OVERDUE"] } },
      }),

      prisma.invoice.count({
        where: { ...orgJobFilter, status: "OVERDUE" },
      }),

      prisma.invoice.findMany({
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
      prisma.invoice.aggregate({
        _sum: { total_amount: true },
        where: { ...orgJobFilter, status: { in: ["SENT", "OVERDUE"] } },
      }),
    ]);

    return sendSuccess(res, {
      openCount,
      overdueCount,
      totalOutstanding: totalOutstanding._sum.total_amount ?? 0,
      recentInvoices,
    });
  } catch (err) {
    console.error(err);
    return sendError(res, "widgetClientInvoices failed", 500);
  }
}

/**
 * GET /api/dashboard/widget/clientOffice/timesheets/:userId
 * Query: dateRange, statuses, limit
 */
export async function widgetClientTimesheets(req: Request, res: Response) {
  try {
    const userId = getUserId(req);
    const orgIds = await getClientOrgIds(userId);
    const since = resolveDateRange(req.query.dateRange as string);
    const statusFilter = filterEnum(parseStatuses(req.query.statuses as string), TimesheetStatus);
    const limit = Number(req.query.limit ?? 10);

    const orgJobFilter = {
      assignment: { application: { job: { organization_id: { in: orgIds } } } },
    };

    const [pendingApproval, recentTimesheets, hoursThisMonth] = await Promise.all([
      prisma.timesheet.count({
        where: { ...orgJobFilter, status: { in: ["SUBMITTED", "UNDER_REVIEW"] } },
      }),

      prisma.timesheet.findMany({
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

      prisma.timesheet.aggregate({
        _sum: { total_hours: true, total_bill_amount: true },
        where: { ...orgJobFilter, week_start_date: { gte: startOfMonth() } },
      }),
    ]);

    return sendSuccess(res, {
      pendingApproval,
      recentTimesheets,
      hoursThisMonth: {
        totalHours: hoursThisMonth._sum.total_hours ?? 0,
        totalBilled: hoursThisMonth._sum.total_bill_amount ?? 0,
      },
    });
  } catch (err) {
    console.error(err);
    return sendError(res, "widgetClientTimesheets failed", 500);
  }
}

/**
 * GET /api/dashboard/widget/clientOffice/placements/:userId
 * Query: dateRange, limit
 */
export async function widgetClientPlacements(req: Request, res: Response) {
  try {
    const userId = getUserId(req);
    const orgIds = await getClientOrgIds(userId);
    const limit = Number(req.query.limit ?? 10);

    const orgJobFilter = {
      application: { job: { organization_id: { in: orgIds } } },
    };

    const [activeAssignments, pendingContracts, recentAssignments] = await Promise.all([
      // Currently active placements
      prisma.assignment.count({
        where: { ...orgJobFilter, end_date: { gte: new Date() } },
      }),

      // Pending unsigned contracts
      prisma.contract.findMany({
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
      prisma.assignment.findMany({
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

    return sendSuccess(res, {
      activeAssignments,
      pendingContracts,
      recentAssignments,
    });
  } catch (err) {
    console.error(err);
    return sendError(res, "widgetClientPlacements failed", 500);
  }
}

/**
 * GET /api/dashboard/widget/clientOffice/myTasks/:userId
 * Query: statuses, limit
 */
export async function widgetClientMyTasks(req: Request, res: Response) {
  try {
    const userId = getUserId(req);
    const statusFilter = parseStatuses(req.query.statuses as string);
    const limit = Number(req.query.limit ?? 10);

    const tasks = await prisma.task.findMany({
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

    return sendSuccess(res, { tasks });
  } catch (err) {
    console.error(err);
    return sendError(res, "widgetClientMyTasks failed", 500);
  }
}